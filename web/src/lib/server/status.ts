import "server-only";
import { openRouterKeys, refusedForCredit } from "./ai";
import { Kernel } from "@onkernel/sdk";
import nodemailer from "nodemailer";
import { getDb, usingPostgres } from "./db";
import { sendEmail } from "./email";

// Live health of everything Handshake depends on, for /status and for alert emails. Each check is the
// cheapest real request that proves the service answers with our credentials; none of them creates
// anything or spends credits (Channel3, whose searches may cost credits, is checked every 6 hours).
export type ServiceStatus = "up" | "slow" | "down" | "off";
// `note` is public. `detail` is for the owner only: it goes into alert emails and the server log, and
// /api/status strips it.
export type Check = { id: string; name: string; role: string; status: ServiceStatus; ms?: number; checkedAt: string; note?: string; detail?: string };

type ProbeResult = string | { note?: string; detail?: string } | void;
type Probe = { id: string; name: string; role: string; ttlMs: number; enabled: () => boolean; run: () => Promise<ProbeResult> };

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
const g = globalThis as unknown as {
  __hsTimerSweep?: number;
  __hsStatus?: Map<string, Check>;
  __hsInflight?: Map<string, Promise<Check>>;
  __hsAlerted?: Map<string, ServiceStatus>;
  __hsErrors?: number[];
  __hsLastErrorAlert?: number;
};
export const recordTimerSweep = (at = Date.now()) => (g.__hsTimerSweep = at);

export const PROBES: Probe[] = [
  {
    id: "database",
    name: "Database",
    role: "Postgres: every deal and its history",
    ttlMs: 5 * MIN,
    enabled: () => usingPostgres(),
    run: async () => {
      await getDb()!.query("select 1");
    },
  },
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
    enabled: () => openRouterKeys().length > 0,
    // The AI uses its OpenRouter keys in order. The public row only says whether paid AI is answering;
    // which keys are empty is detail for the owner (alert email and log). It goes down, which emails the
    // alert, only when every key has actually been refused, leaving the free backup.
    run: async () => {
      const keys = openRouterKeys();
      const states = await Promise.all(keys.map(keyState));
      if (states.every((s) => s === "refused" || s === "error")) throw states.includes("refused") ? new Error("401") : new Error("No answer");
      const usable = states.flatMap((s, i) => (s === "ok" || s === "low" || s === "zero" ? [i + 1] : []));
      const empty = states.flatMap((s, i) => (s === "empty" ? [i + 1] : []));
      const bad = states.flatMap((s, i) => (s === "refused" || s === "error" ? [i + 1] : []));
      const detail = [
        `${keys.length} OpenRouter key${keys.length === 1 ? "" : "s"}`,
        empty.length ? `${plural("key", empty)} refused for credit` : "",
        bad.length ? `${plural("key", bad)} not answering` : "",
        usable.length ? `using key ${usable[0]} (${states[usable[0] - 1]})` : "",
      ].filter(Boolean).join("; ");
      if (!usable.length) throw Object.assign(new Error("all out"), { safeNote: "Paid AI is out of credit: running on the free backup", safeDetail: detail });
      // Paid AI is answering, so for everyone using the site it's working: the row stays green. How much
      // credit the key in use has left is the owner's to watch, in the detail (never shown publicly).
      const inUse = states[usable[0] - 1];
      return { detail: empty.length || bad.length || inUse !== "ok" ? detail : undefined };
    },
  },
  {
    id: "groq",
    name: "Free AI backup (Groq)",
    role: "Takes over the AI checks if OpenRouter is out of credit",
    ttlMs: 15 * MIN,
    enabled: () => Boolean(process.env.GROQ_API_KEY),
    run: async () => {
      const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      await ok(res, "Groq");
    },
  },
  {
    id: "channel3",
    name: "Channel3",
    role: "Real store prices for price checks and repairs",
    // Searches may cost credits: check every 6 hours (about 240 searches over two months).
    ttlMs: 6 * 60 * MIN,
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
// After a restart (every deploy), the timer's first sweep can take up to 5 minutes to arrive.
const startedAt = Date.now();

function timerCheck(now: number, upSince = startedAt): Check {
  const base = { id: "timers", name: "Deadline timer", role: "Render Workflow that enforces every deal's deadlines", checkedAt: new Date(now).toISOString() };
  if (!process.env.TIMERS_SECRET) return { ...base, status: "off", note: "Deadlines are enforced when a deal is opened" };
  const last = g.__hsTimerSweep;
  if (!last) {
    return now - upSince < 10 * MIN
      ? { ...base, status: "up", note: "Restarted just now; the first sweep is due within 5 minutes" }
      : { ...base, status: "slow", note: "No sweep since the last restart" };
  }
  const age = now - last;
  const mins = Math.round(age / MIN);
  return { ...base, status: age < 12 * MIN ? "up" : age < 30 * MIN ? "slow" : "down", note: `Last sweep ${mins < 1 ? "under a minute" : `${mins} min`} ago` };
}

async function runProbe(p: Probe, now: number): Promise<Check> {
  const base = { id: p.id, name: p.name, role: p.role, checkedAt: new Date(now).toISOString() };
  if (!p.enabled()) return { ...base, status: "off", note: "Not configured on this server" };
  const started = Date.now();
  try {
    const result = await p.run();
    const { note, detail } = typeof result === "string" ? { note: result, detail: undefined } : (result ?? {});
    const ms = Date.now() - started;
    if (detail) console.log("status", p.id, detail);
    return { ...base, status: ms > SLOW_MS || note ? "slow" : "up", ms, note, detail };
  } catch (e) {
    // Only a short, generic reason is ever shown: never a key, URL or full error.
    // A probe may give its own reason, written here in this file (never text from a service).
    const own = e as { safeNote?: string; safeDetail?: string };
    if (own.safeDetail) console.log("status", p.id, own.safeDetail);
    if (own.safeNote) return { ...base, status: "down", ms: Date.now() - started, note: own.safeNote, detail: own.safeDetail };
    const msg = (e as Error).message ?? "";
    const code = msg.match(/\b(4\d\d|5\d\d)\b/)?.[1];
    const why = (e as Error).name === "TimeoutError" || /abort|timeout/i.test(msg) ? "Timed out" : code === "401" || code === "403" ? "Credentials refused" : code === "429" ? "Rate limited" : code ? `Error ${code}` : "No answer";
    return { ...base, status: "down", ms: Date.now() - started, note: why };
  }
}

// One OpenRouter key's account: "ok", "low" (under $1 left), "zero" ($0 or below, but OpenRouter still
// answers), "empty" (OpenRouter refused it for credit in real use), "refused" (bad key) or "error".
async function keyState(key: string): Promise<"ok" | "low" | "zero" | "empty" | "refused" | "error"> {
  if (refusedForCredit(key)) return "empty";
  try {
    const opts = { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" as const };
    const res = await fetch("https://openrouter.ai/api/v1/key", opts);
    if (res.status === 401 || res.status === 403) return "refused";
    if (!res.ok) return "error";
    const left = ((await res.json()) as { data?: { limit_remaining?: number | null } }).data?.limit_remaining;
    // The key's own spending limit, then the account's balance (what actually runs out).
    if (typeof left === "number" && left <= 0) return "zero";
    const byLimit = typeof left === "number" && left < 1 ? "low" : "ok";
    const credits = await fetch("https://openrouter.ai/api/v1/credits", opts);
    if (!credits.ok) return byLimit;
    const c = ((await credits.json()) as { data?: { total_credits?: number; total_usage?: number } }).data;
    if (typeof c?.total_credits !== "number" || typeof c.total_usage !== "number") return byLimit;
    const balance = Math.min(c.total_credits - c.total_usage, typeof left === "number" ? left : Infinity);
    return balance <= 0 ? "zero" : balance < 1 ? "low" : "ok";
  } catch {
    return "error";
  }
}
const plural = (word: string, nums: number[]) => `${word}${nums.length > 1 ? "s" : ""} ${nums.join(", ").replace(/, (\d+)$/, " and $1")}`;

const cache = () => (g.__hsStatus ??= new Map());
const inflight = () => (g.__hsInflight ??= new Map());

// Runs every check whose cached result is older than its interval (or all of them, when forced).
// Visitors arriving together share one probe in flight, so a burst of page loads can't fan out into a
// burst of calls to our partners. Alerts are judged on every real probe, whoever triggered it.
export async function checkAll(opts: { force?: boolean; now?: number; upSince?: number } = {}): Promise<Check[]> {
  const now = opts.now ?? Date.now();
  const c = cache();
  const running = inflight();
  const fresh = await Promise.all(
    PROBES.map((p) => {
      const prev = c.get(p.id);
      if (!opts.force && prev && now - Date.parse(prev.checkedAt) < p.ttlMs) return prev;
      const already = running.get(p.id);
      if (already) return already;
      const job = runProbe(p, now)
        .then(async (next) => {
          c.set(p.id, next);
          await alertOnChange(next);
          return next;
        })
        .finally(() => running.delete(p.id));
      running.set(p.id, job);
      return job;
    }),
  );
  const timers = timerCheck(now, opts.upSince);
  c.set("timers", timers);
  await alertOnChange(timers);
  return [...fresh, timers];
}

export function overall(checks: Check[]): "up" | "degraded" | "down" {
  const live = checks.filter((c) => c.status !== "off");
  if (live.some((c) => c.status === "down" && (c.id === "paypal" || c.id === "payouts"))) return "down";
  return live.some((c) => c.status !== "up") ? "degraded" : "up";
}

// ── Alerts ────────────────────────────────────────────────────────────────

// Emailed to ALERT_EMAIL when a service goes down, and again when it recovers. One email per change,
// judged against the last state we alerted on (not the cache), so no outage slips through unannounced.
async function alertOnChange(next: Check) {
  const alerted = (g.__hsAlerted ??= new Map());
  const last = alerted.get(next.id);
  const wentDown = next.status === "down" && last !== "down";
  const recovered = last === "down" && next.status === "up";
  // The first sighting just sets the baseline (a restart shouldn't email "everything is fine").
  if (last === undefined && next.status !== "down") {
    alerted.set(next.id, next.status);
    return;
  }
  if (next.status !== "slow") alerted.set(next.id, next.status);
  const to = process.env.ALERT_EMAIL;
  if (!to || (!wentDown && !recovered)) return;
  const subject = wentDown ? `Handshake alert: ${next.name} is down` : `Handshake: ${next.name} recovered`;
  const details = wentDown && next.detail ? `\n\nDetails (not shown on the public page): ${next.detail}.` : "";
  const text = `${next.name} (${next.role}) is ${wentDown ? `down: ${next.note ?? "no answer"}` : "working again"}.${details}\n\nStatus page: ${baseUrl()}/status`;
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
