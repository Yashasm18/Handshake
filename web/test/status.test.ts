import { beforeEach, describe, expect, it, vi } from "vitest";

// The /status page and alerts: each service's check, caching so nobody is hammered, the overall verdict,
// alert emails on a change (once), the deadline timer's heartbeat, and that nothing secret is shown.
const KEYS = {
  PAYPAL_CLIENT_ID: "pp-main-id",
  PAYPAL_CLIENT_SECRET: "pp-main-SECRET",
  PAYPAL_PAYOUT_CLIENT_ID: "pp-pay-id",
  PAYPAL_PAYOUT_CLIENT_SECRET: "pp-pay-SECRET",
  OPENROUTER_API_KEY: "or-SECRET",
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
    expect(cs.map((c) => c.id)).toEqual(["paypal", "payouts", "ai", "channel3", "kernel", "elastic", "easypost", "email", "timers"]);
    expect(cs.every((c) => c.status === "up")).toBe(true);
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

  it("AI credit running out is flagged before it fails", async () => {
    answer = { "openrouter.ai": () => Response.json({ data: { limit_remaining: 0.2 } }) };
    expect(byId(await status.checkAll({ now: T }), "ai")).toMatchObject({ status: "slow", note: "Credit nearly used up" });
  });

  it("results are cached per service, so polling the page never hammers anyone", async () => {
    await status.checkAll({ now: T });
    const calls = fetchMock.mock.calls.length;
    await status.checkAll({ now: T + 60_000 });
    expect(fetchMock.mock.calls.length).toBe(calls);
    // Channel3 (searches may cost credits) is only rechecked hourly; the rest after 5 to 15 minutes.
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
