import "server-only";
import { Kernel } from "@onkernel/sdk";
import nodemailer from "nodemailer";
import { sendEmail } from "./email";

// Live health of everything Handshake depends on, for /status and for alert emails. Each check is the
// cheapest real request that proves the service answers with our credentials; none of them creates
// anything or spends credits (Channel3, whose searches may cost credits, is checked hourly).
export type ServiceStatus = "up" | "slow" | "down" | "off";
export type Check = { id: string; name: string; role: string; status: ServiceStatus; ms?: number; checkedAt: string; note?: string };

type Probe = { id: string; name: string; role: string; ttlMs: number; enabled: () => boolean; run: () => Promise<string | void> };

const MIN = 60_000;
// A first request includes a fresh TLS connection; only beyond this is a service called slow.
const SLOW_MS = 4000;
const TIMEOUT_MS = 8000;

async function ok(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what} ${res.status}`);
}

const paypalToken = async (id?: string, secret?: string) => {
  const res = await fetch(`${process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com"}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  await ok(res, "PayPal");
};

// The timer workflow reports in on every sweep (see /api/internal/timers).
const g = globalThis as unknown as { __hsTimerSweep?: number; __hsStatus?: Map<string, Check>; __hsErrors?: number[]; __hsLastErrorAlert?: number };
export const recordTimerSweep = (at = Date.now()) => (g.__hsTimerSweep = at);

export const PROBES: Probe[] = [
  {
    id: "paypal",
    name: "PayPal payments",
    role: "Holds, captures and Sign in with PayPal",
    ttlMs: 5 * MIN,
    enabled: () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    run: () => paypalToken(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET),
  },
  {
    id: "payouts",
    name: "PayPal payouts",
    role: "Pays sellers from the payouts account",
    ttlMs: 5 * MIN,
    enabled: () => Boolean(process.env.PAYPAL_PAYOUT_CLIENT_ID && process.env.PAYPAL_PAYOUT_CLIENT_SECRET),
    run: () => paypalToken(process.env.PAYPAL_PAYOUT_CLIENT_ID, process.env.PAYPAL_PAYOUT_CLIENT_SECRET),
  },
  {
    id: "ai",
    name: "AI agents (OpenRouter)",
    role: "Scam checks, label reading, claims and negotiation",
    ttlMs: 5 * MIN,
    enabled: () => Boolean(process.env.OPENROUTER_API_KEY),
    run: async () => {
      const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      await ok(res, "OpenRouter");
      const j = (await res.json()) as { data?: { limit_remaining?: number | null } };
      const left = j.data?.limit_remaining;
      if (typeof left === "number" && left < 1) return "Credit nearly used up";
    },
  },
  {
    id: "channel3",
    name: "Channel3",
    role: "Real store prices for price checks and repairs",
    ttlMs: 60 * MIN,
    enabled: () => Boolean(process.env.CHANNEL3_API_KEY),
    run: async () => {
      const res = await fetch("https://api.trychannel3.com/v1/search", {
        method: "POST",
        headers: { "x-api-key": process.env.CHANNEL3_API_KEY ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ query: "usb c cable", limit: 1 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      await ok(res, "Channel3");
    },
  },
  {
    id: "kernel",
    name: "Kernel",
    role: "Cloud browsers that open pasted listing links",
    ttlMs: 15 * MIN,
    enabled: () => Boolean(process.env.KERNEL_API_KEY),
    run: async () => {
      await new Kernel({ timeout: TIMEOUT_MS, maxRetries: 0 }).browsers.list({ limit: 1 });
    },
  },
  {
    id: "elastic",
    name: "Elastic",
    role: "Scam memory",
    ttlMs: 5 * MIN,
    enabled: () => Boolean(process.env.ELASTIC_URL && process.env.ELASTIC_API_KEY),
    run: async () => {
      const res = await fetch(`${process.env.ELASTIC_URL!.replace(/\/$/, "")}/`, { headers: { Authorization: `ApiKey ${process.env.ELASTIC_API_KEY}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      await ok(res, "Elastic");
    },
  },
  {
    id: "easypost",
    name: "EasyPost",
    role: "Live parcel tracking from the carrier",
    ttlMs: 15 * MIN,
    enabled: () => Boolean(process.env.EASYPOST_API_KEY),
    run: async () => {
      const res = await fetch("https://api.easypost.com/v2/trackers?page_size=1", {
        headers: { Authorization: "Basic " + Buffer.from(`${process.env.EASYPOST_API_KEY}:`).toString("base64") },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      await ok(res, "EasyPost");
    },
  },
  {
    id: "email",
    name: "Email",
    role: "Deal updates to buyers and sellers",
    ttlMs: 15 * MIN,
    enabled: () => Boolean((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || process.env.RESEND_API_KEY),
    run: async () => {
      if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, "") }, connectionTimeout: TIMEOUT_MS });
        await t.verify();
        t.close();
        return;
      }
      const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      await ok(res, "Resend");
    },
  },
];

// The deadline timer is healthy when it has swept recently (it runs every 5 minutes on Render).
function timerCheck(now: number): Check {
  const base = { id: "timers", name: "Deadline timer", role: "Render Workflow that enforces every deal's deadlines", checkedAt: new Date(now).toISOString() };
  if (!process.env.TIMERS_SECRET) return { ...base, status: "off", note: "Deadlines are enforced when a deal is opened" };
  const last = g.__hsTimerSweep;
  if (!last) return { ...base, status: "slow", note: "Waiting for the first sweep since the last restart" };
  const age = now - last;
  const mins = Math.round(age / MIN);
  return { ...base, status: age < 12 * MIN ? "up" : age < 30 * MIN ? "slow" : "down", note: `Last sweep ${mins < 1 ? "under a minute" : `${mins} min`} ago` };
}

async function runProbe(p: Probe, now: number): Promise<Check> {
  const base = { id: p.id, name: p.name, role: p.role, checkedAt: new Date(now).toISOString() };
  if (!p.enabled()) return { ...base, status: "off", note: "Not configured on this server" };
  const started = Date.now();
  try {
    const note = await p.run();
    const ms = Date.now() - started;
    return { ...base, status: ms > SLOW_MS || note ? "slow" : "up", ms, note: note ?? undefined };
  } catch (e) {
    // Only a short, generic reason is ever shown: never a key, URL or full error.
    const msg = (e as Error).message ?? "";
    const code = msg.match(/\b(4\d\d|5\d\d)\b/)?.[1];
    const why = (e as Error).name === "TimeoutError" || /abort|timeout/i.test(msg) ? "Timed out" : code === "401" || code === "403" ? "Credentials refused" : code === "429" ? "Rate limited" : code ? `Error ${code}` : "No answer";
    return { ...base, status: "down", ms: Date.now() - started, note: why };
  }
}

const cache = () => (g.__hsStatus ??= new Map());

// Runs every check whose cached result is older than its interval (or all of them, when forced).
export async function checkAll(opts: { force?: boolean; alert?: boolean; now?: number } = {}): Promise<Check[]> {
  const now = opts.now ?? Date.now();
  const c = cache();
  const fresh = await Promise.all(
    PROBES.map(async (p) => {
      const prev = c.get(p.id);
      if (!opts.force && prev && now - Date.parse(prev.checkedAt) < p.ttlMs) return prev;
      const next = await runProbe(p, now);
      if (opts.alert) await alertOnChange(prev, next);
      c.set(p.id, next);
      return next;
    }),
  );
  const timers = timerCheck(now);
  if (opts.alert) await alertOnChange(c.get("timers"), timers);
  c.set("timers", timers);
  return [...fresh, timers];
}

export function overall(checks: Check[]): "up" | "degraded" | "down" {
  const live = checks.filter((c) => c.status !== "off");
  if (live.some((c) => c.status === "down" && (c.id === "paypal" || c.id === "payouts"))) return "down";
  return live.some((c) => c.status !== "up") ? "degraded" : "up";
}

// ── Alerts ────────────────────────────────────────────────────────────────

// Emailed to ALERT_EMAIL when a service goes down, and again when it recovers. One email per change.
async function alertOnChange(prev: Check | undefined, next: Check) {
  const to = process.env.ALERT_EMAIL;
  if (!to || !prev || prev.status === next.status) return;
  const wentDown = next.status === "down" && prev.status !== "down";
  const recovered = prev.status === "down" && next.status === "up";
  if (!wentDown && !recovered) return;
  const subject = wentDown ? `Handshake alert: ${next.name} is down` : `Handshake: ${next.name} recovered`;
  const text = `${next.name} (${next.role}) is ${wentDown ? `down: ${next.note ?? "no answer"}` : "working again"}.\n\nStatus page: ${baseUrl()}/status`;
  await sendEmail({ to, subject, text, html: `<p>${text.replace(/\n/g, "<br>")}</p>` }).catch((e) => console.error("alert email", (e as Error).message));
}

const baseUrl = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");

// Unexpected server errors (500s): counted for the status page, and the first one after a quiet hour
// is emailed, so a bug in production is noticed without anyone watching the logs.
export function recordServerError(where: string, now = Date.now()) {
  const errors = (g.__hsErrors ??= []).filter((t) => now - t < 60 * MIN);
  errors.push(now);
  g.__hsErrors = errors;
  const to = process.env.ALERT_EMAIL;
  if (to && (!g.__hsLastErrorAlert || now - g.__hsLastErrorAlert > 60 * MIN)) {
    g.__hsLastErrorAlert = now;
    sendEmail({ to, subject: "Handshake alert: an unexpected server error", text: `An unexpected error happened in ${where}. Check the Render logs.\n\nStatus page: ${baseUrl()}/status`, html: `<p>An unexpected error happened in <b>${where}</b>. Check the Render logs.</p><p><a href="${baseUrl()}/status">Status page</a></p>` }).catch(() => {});
  }
}

export const errorsLastHour = (now = Date.now()) => (g.__hsErrors ?? []).filter((t) => now - t < 60 * MIN).length;
