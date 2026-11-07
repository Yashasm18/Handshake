import { beforeEach, describe, expect, it, vi } from "vitest";

// The /status page and alerts: each service's check, caching so nobody is hammered, the overall verdict,
// alert emails on a change (once), the deadline timer's heartbeat, and that nothing secret is shown.
const KEYS = {
  PAYPAL_CLIENT_ID: "pp-main-id",
  PAYPAL_CLIENT_SECRET: "pp-main-SECRET",
  PAYPAL_PAYOUT_CLIENT_ID: "pp-pay-id",
  PAYPAL_PAYOUT_CLIENT_SECRET: "pp-pay-SECRET",
  OPENROUTER_API_KEY: "or-SECRET",
  GROQ_API_KEY: "gsk-SECRET",
  CHANNEL3_API_KEY: "c3-SECRET",
  KERNEL_API_KEY: "k-SECRET",
  ELASTIC_URL: "https://secret-cluster.es.example.io",
  ELASTIC_API_KEY: "es-SECRET",
  EASYPOST_API_KEY: "EZTK-SECRET",
  GMAIL_USER: "usehandshake.deals@gmail.com",
  GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
  TIMERS_SECRET: "t-SECRET",
  ALERT_EMAIL: "ops@gmail.com",
};
Object.assign(process.env, KEYS);
delete process.env.RESEND_API_KEY;

const kernel = vi.hoisted(() => ({ list: vi.fn(async () => ({ data: [] })) }));
vi.mock("@onkernel/sdk", () => ({ Kernel: class { browsers = { list: kernel.list }; } }));
const smtp = vi.hoisted(() => ({ verify: vi.fn(async () => true), sendMail: vi.fn(async () => ({ messageId: "m" })) }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ verify: smtp.verify, close: () => {}, sendMail: smtp.sendMail }) } }));

// Each service answers "ok" unless a test says otherwise.
let answer: Record<string, () => Response> = {};
const fetchMock = vi.fn(async (url: string) => {
  const hit = Object.keys(answer).find((k) => url.includes(k));
  return hit ? answer[hit]() : Response.json({ ok: true, data: { limit_remaining: 50 } });
});
vi.stubGlobal("fetch", fetchMock);

const status = await import("@/lib/server/status");
const route = (await import("@/app/api/status/route")).GET;
const T = Date.parse("2026-11-05T12:00:00Z");
const g = globalThis as unknown as { __hsStatus?: Map<string, unknown>; __hsTimerSweep?: number; __hsErrors?: number[]; __hsLastErrorAlert?: number };
const alerts = () => smtp.sendMail.mock.calls.map((c) => (c as unknown as [{ subject: string; to: string }])[0]);

beforeEach(() => {
  answer = {};
  g.__hsStatus = new Map();
  g.__hsTimerSweep = undefined;
  g.__hsErrors = [];
  g.__hsLastErrorAlert = undefined;
  (globalThis as unknown as { __hsAlerted?: Map<string, string>; __hsInflight?: Map<string, unknown> }).__hsAlerted = new Map();
  (globalThis as unknown as { __hsInflight?: Map<string, unknown> }).__hsInflight = new Map();
  fetchMock.mockClear();
  smtp.sendMail.mockClear();
  kernel.list.mockReset().mockResolvedValue({ data: [] });
});

const byId = (cs: { id: string }[], id: string) => cs.find((c) => c.id === id) as { status: string; note?: string } | undefined;

describe("the checks", () => {
  it("all services answering means everything is working", async () => {
    status.recordTimerSweep(T - 60_000);
    const cs = await status.checkAll({ now: T });
    expect(cs.map((c) => c.id)).toEqual(["database", "paypal", "payouts", "ai", "groq", "channel3", "kernel", "elastic", "easypost", "email", "timers"]);
    // Without DATABASE_URL (this test), the database row says "not set up"; everything else answers.
    expect(cs.filter((c) => c.id !== "database").every((c) => c.status === "up")).toBe(true);
    expect(status.overall(cs)).toBe("up");
  });

  it("says why a service is down in a few safe words", async () => {
    answer = { "openrouter.ai": () => new Response("no", { status: 401 }), "easypost.com": () => new Response("slow down", { status: 429 }), "api.trychannel3.com": () => new Response("x", { status: 503 }) };
    kernel.list.mockRejectedValueOnce(Object.assign(new Error("Request timed out."), { name: "TimeoutError" }));
    const cs = await status.checkAll({ now: T });
    expect(byId(cs, "ai")).toMatchObject({ status: "down", note: "Credentials refused" });
    expect(byId(cs, "easypost")).toMatchObject({ status: "down", note: "Rate limited" });
    expect(byId(cs, "channel3")).toMatchObject({ status: "down", note: "Error 503" });
    expect(byId(cs, "kernel")).toMatchObject({ status: "down", note: "Timed out" });
    expect(status.overall(cs)).toBe("degraded");
  });

  it("PayPal down is the one outage that stops payments", async () => {
    answer = { "/v1/oauth2/token": () => new Response("x", { status: 500 }) };
    expect(status.overall(await status.checkAll({ now: T }))).toBe("down");
  });

  it("a service without keys is shown as not set up, not as down", async () => {
    const saved = process.env.KERNEL_API_KEY;
    delete process.env.KERNEL_API_KEY;
    const cs = await status.checkAll({ now: T });
    expect(byId(cs, "kernel")).toMatchObject({ status: "off" });
    process.env.KERNEL_API_KEY = saved;
  });

  it("AI credit running low stays green while it answers; the owner sees it in the detail", async () => {
    answer = { "openrouter.ai": () => Response.json({ data: { limit_remaining: 0.2 } }) };
    expect(byId(await status.checkAll({ now: T }), "ai")).toMatchObject({ status: "up", note: undefined, detail: "1 OpenRouter key; using key 1 (low)" });
  });

  it("a key at $0 is green while OpenRouter still answers; once it actually refuses, the row goes down (the alert)", async () => {
    const skip = ((globalThis as { __hsKeySkip?: Map<string, unknown> }).__hsKeySkip = new Map());
    answer = { "/api/v1/credits": () => Response.json({ data: { total_credits: 0, total_usage: 0.1 } }) };
    expect(byId(await status.checkAll({ now: T }), "ai")).toMatchObject({ status: "up", note: undefined, detail: "1 OpenRouter key; using key 1 (zero)" });
    g.__hsStatus = new Map();
    skip.set("or-SECRET", { until: Date.now() + 60_000, why: "credit" });
    expect(byId(await status.checkAll({ now: T }), "ai")).toMatchObject({ status: "down", note: "Paid AI is out of credit: running on the free backup" });
    skip.clear();
    g.__hsStatus = new Map();
    answer = { "/api/v1/credits": () => Response.json({ data: { total_credits: 5, total_usage: 4.5 } }) };
    expect(byId(await status.checkAll({ now: T }), "ai")).toMatchObject({ status: "up", note: undefined, detail: "1 OpenRouter key; using key 1 (low)" });
    g.__hsStatus = new Map();
    answer = { "/api/v1/credits": () => Response.json({ data: { total_credits: 10, total_usage: 1 } }) };
    expect(byId(await status.checkAll({ now: T }), "ai")).toMatchObject({ status: "up" });
  });

  it("with several OpenRouter keys, it says which were refused and which one is in use, and alerts once all are refused", async () => {
    Object.assign(process.env, { OPENROUTER_API_KEY_2: "or-2-SECRET", OPENROUTER_API_KEY_3: "or-3-SECRET", OPENROUTER_API_KEY_4: "or-4-SECRET" });
    const skip = ((globalThis as { __hsKeySkip?: Map<string, unknown> }).__hsKeySkip = new Map());
    const refuse = (...keys: string[]) => keys.forEach((k) => skip.set(k, { until: Date.now() + 60_000, why: "credit" }));
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/api/v1/credits") ? Response.json({ data: { total_credits: 10, total_usage: 0 } }) : Response.json({ ok: true, data: { limit_remaining: null } }),
    );
    try {
      refuse("or-SECRET", "or-2-SECRET");
      // Switching to key 3 is invisible to the public: paid AI still answers. The detail is the owner's.
      expect(byId(await status.checkAll({ now: T }), "ai")).toMatchObject({ status: "up", note: undefined, detail: "4 OpenRouter keys; keys 1 and 2 refused for credit; using key 3 (ok)" });
      g.__hsStatus = new Map();
      refuse("or-3-SECRET", "or-4-SECRET");
      smtp.sendMail.mockClear();
      expect(byId(await status.checkAll({ now: T + 10 * 60_000 }), "ai")).toMatchObject({ status: "down", note: "Paid AI is out of credit: running on the free backup" });
      expect(alerts().map((a) => a.subject)).toContain("Handshake alert: AI agents (OpenRouter) is down");
      // The owner's email has the key detail; the public API never shows it.
      const email = smtp.sendMail.mock.calls.map((c) => (c as unknown as [{ text: string }])[0].text).find((t) => t.includes("AI agents"));
      expect(email).toContain("Details (not shown on the public page): 4 OpenRouter keys; keys 1, 2, 3 and 4 refused for credit.");
      const json = await (await route()).text();
      expect(json).not.toMatch(/key 1|keys 1|OpenRouter keys/i);
      expect(JSON.parse(json).checks.find((c: { id: string }) => c.id === "ai")).toMatchObject({ status: "down", note: "Paid AI is out of credit: running on the free backup" });
    } finally {
      skip.clear();
      for (const n of [2, 3, 4]) delete process.env[`OPENROUTER_API_KEY_${n}`];
      fetchMock.mockImplementation(async (url: string) => {
        const hit = Object.keys(answer).find((k) => url.includes(k));
        return hit ? answer[hit]() : Response.json({ ok: true, data: { limit_remaining: 50 } });
      });
    }
  });

  it("results are cached per service, so polling the page never hammers anyone", async () => {
    await status.checkAll({ now: T });
    const calls = fetchMock.mock.calls.length;
    await status.checkAll({ now: T + 60_000 });
    expect(fetchMock.mock.calls.length).toBe(calls);
    // Channel3 (searches may cost credits) is only rechecked every 6 hours; the rest after 5 to 15 minutes.
    fetchMock.mockClear();
    await status.checkAll({ now: T + 20 * 60_000 });
    const hosts = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(hosts.some((u) => u.includes("trychannel3"))).toBe(false);
    expect(hosts.some((u) => u.includes("openrouter"))).toBe(true);
  });
});

describe("the deadline timer's heartbeat", () => {
  it("right after a restart it's fine while the first sweep is on its way, but not forever", async () => {
    expect(byId(await status.checkAll({ now: T, upSince: T - 2 * 60_000 }), "timers")).toMatchObject({ status: "up" });
    expect(byId(await status.checkAll({ now: T, upSince: T - 15 * 60_000 }), "timers")).toMatchObject({ status: "slow", note: "No sweep since the last restart" });
  });

  it("is working while it sweeps every few minutes, and down when it stops", async () => {
    status.recordTimerSweep(T - 3 * 60_000);
    expect(byId(await status.checkAll({ now: T }), "timers")).toMatchObject({ status: "up", note: "Last sweep 3 min ago" });
    status.recordTimerSweep(T - 45 * 60_000);
    expect(byId(await status.checkAll({ now: T }), "timers")?.status).toBe("down");
  });
});

describe("alerts", () => {
  it("emails once when a service goes down, and once when it recovers", async () => {
    await status.checkAll({ now: T });
    answer = { "secret-cluster": () => new Response("x", { status: 500 }) };
    await status.checkAll({ now: T + 6 * 60_000 });
    await status.checkAll({ now: T + 12 * 60_000 });
    answer = {};
    await status.checkAll({ now: T + 18 * 60_000 });
    expect(alerts().map((a) => a.subject)).toEqual(["Handshake alert: Elastic is down", "Handshake: Elastic recovered"]);
    expect(alerts().every((a) => a.to === "ops@gmail.com")).toBe(true);
  });

  it("an outage first seen by a page visit is still alerted, and only once", async () => {
    await status.checkAll({ now: T });
    answer = { "api.easypost.com": () => new Response("x", { status: 500 }) };
    await status.checkAll({ now: T + 20 * 60_000 }); // a visitor's request runs the probe
    await status.checkAll({ now: T + 40 * 60_000 }); // the timer sweep later
    expect(alerts().map((a) => a.subject)).toEqual(["Handshake alert: EasyPost is down"]);
  });

  it("visitors arriving together share one probe instead of each calling the partner", async () => {
    let calls = 0;
    answer = { "api.easypost.com": () => (calls++, Response.json({})) };
    await Promise.all([status.checkAll({ now: T }), status.checkAll({ now: T }), status.checkAll({ now: T })]);
    expect(calls).toBe(1);
  });

  it("unexpected server errors are counted, and emailed at most once an hour", () => {
    status.recordServerError("an API request", T);
    status.recordServerError("an API request", T + 60_000);
    expect(status.errorsLastHour(T + 2 * 60_000)).toBe(2);
    status.recordServerError("an API request", T + 61 * 60_000);
    expect(alerts().map((a) => a.subject)).toEqual(["Handshake alert: an unexpected server error", "Handshake alert: an unexpected server error"]);
    // Errors older than an hour drop off the count.
    expect(status.errorsLastHour(T + 62 * 60_000)).toBe(1);
  });
});

describe("the public status API", () => {
  it("never shows a key, the Elastic host or a raw error", async () => {
    answer = { "secret-cluster": () => new Response("internal details es-SECRET", { status: 500 }) };
    const json = await (await route()).text();
    for (const secret of [...Object.values(KEYS).filter((v) => v !== "ops@gmail.com" && !v.endsWith("@gmail.com")), "secret-cluster", "internal details"]) expect(json).not.toContain(secret);
    expect(JSON.parse(json)).toMatchObject({ overall: "degraded" });
  });
});
