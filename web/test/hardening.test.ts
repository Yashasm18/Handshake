import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { Scan } from "@/lib/types";

// Fixes from the final "try to break it" pass on the live site: forged scam checks, malformed requests,
// cross-site requests, unlimited paid calls, and missing browser security headers.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-harden-"));
process.env.SESSION_SECRET = "hardening-test-secret";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => jar.set(k, v),
  }),
}));
const ai = vi.hoisted(() => ({ scanDeal: vi.fn(async (): Promise<Scan> => ({ item: "Switch OLED", priceCents: 9_000, condition: "Used", checklist: [], flags: [{ type: "FRIENDS_AND_FAMILY", quote: "send F&F", explanation: "No protection" }], risk: "HIGH", summary: "Scam signs.", market: null })) }));
vi.mock("@/lib/server/checks", async (orig) => ({ ...(await orig<typeof import("@/lib/server/checks")>()), scanDeal: ai.scanDeal }));

const { sealScan, verifyScan, SEAL_MAX_AGE_MS } = await import("@/lib/server/scan-seal");
const scanRoute = (await import("@/app/api/scan/route")).POST;
const dealsRoute = (await import("@/app/api/deals/route")).POST;
const { handle } = await import("@/lib/server/http");
const { proxy } = await import("@/proxy");
const { getDeal } = await import("@/lib/server/deals");

let ip = 0;
const post = (route: (r: Request) => Promise<Response>, body: unknown, who = `10.0.0.${++ip}`) =>
  route(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": who }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const deal = { title: "Nintendo Switch OLED", priceCents: 9_000, sellerName: "Sam" };

describe("a deal only shows a scam check Handshake really ran", () => {
  it("a scan from the API carries Handshake's seal", async () => {
    const scan = await (await post(scanRoute, { text: "Switch OLED $90, pay me Friends & Family" })).json();
    expect(scan).toMatchObject({ risk: "HIGH", seal: expect.any(String), sealedAt: expect.any(String) });
    expect(verifyScan(scan)).toBe(true);
  });

  it("the sealed scan, round-tripped through the browser (and its local storage), creates the deal", async () => {
    const scan = JSON.parse(JSON.stringify(await (await post(scanRoute, { text: "listing" })).json()));
    const res = await post(dealsRoute, { ...deal, scan });
    expect(res.status).toBe(200);
    expect((await getDeal((await res.json()).id))?.scan?.risk).toBe("HIGH");
  });

  it("a scammer's forged clean check is refused: invented, edited, or with a made-up seal", async () => {
    const real = await (await post(scanRoute, { text: "listing" })).json();
    const clean = { ...real, risk: "LOW", flags: [], summary: "No red flags." };
    const invented: Scan = { item: "Switch OLED", priceCents: 9_000, condition: "New", checklist: [], flags: [], risk: "LOW", summary: "Looks fine.", market: null };
    for (const scan of [clean, invented, { ...invented, sealedAt: new Date().toISOString(), seal: "forged" }, { ...real, market: { query: "x", medianCents: 9_500, lowCents: 9_000, highCents: 10_000, belowMarketPct: 5, comps: [] } }]) {
      const res = await post(dealsRoute, { ...deal, scan });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/couldn't be verified/);
    }
    // A deal without any scan is still allowed (it just shows no check).
    expect((await post(dealsRoute, deal)).status).toBe(200);
  });

  it("key order doesn't matter, but a day-old seal has expired", () => {
    const now = Date.now();
    const sealed = sealScan({ b: 1, a: { y: [1, 2], x: "z" } }, now);
    const reordered = { seal: sealed.seal, sealedAt: sealed.sealedAt, a: { x: "z", y: [1, 2] }, b: 1 };
    expect(verifyScan(reordered, now)).toBe(true);
    expect(verifyScan(sealed, now + SEAL_MAX_AGE_MS + 1)).toBe(false);
    expect(verifyScan({ ...sealed, b: 2 }, now)).toBe(false);
  });
});

describe("malformed and cross-site requests", () => {
  it("a body that isn't JSON is a clean 400, not a server error", async () => {
    const res = await post(dealsRoute, "{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That request wasn't valid JSON." });
    const viaHandle = await handle(async () => JSON.parse("{oops"));
    expect(viaHandle.status).toBe(400);
  });

  it("a state-changing API request from another site is refused; same-site and server-to-server pass", () => {
    const req = (method: string, headers: Record<string, string>) => new NextRequest("https://usehandshake.onrender.com/api/deals/x/cancel", { method, headers: { host: "usehandshake.onrender.com", ...headers } });
    expect(proxy(req("POST", { origin: "https://evil.example" })).status).toBe(403);
    expect(proxy(req("POST", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(proxy(req("POST", { origin: "null" })).status).toBe(403);
    expect(proxy(req("POST", { origin: "not a url" })).status).toBe(403);
    expect(proxy(req("POST", { origin: "https://usehandshake.onrender.com", "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect(proxy(req("POST", {})).status).toBe(200); // no browser origin: a server-to-server call
    expect(proxy(req("GET", { origin: "https://evil.example" })).status).toBe(200); // reads change nothing
  });
});

describe("limits on paid calls", () => {
  it("one visitor gets 30 scam checks per 10 minutes, then a clear 429", async () => {
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await post(scanRoute, { text: "listing" }, "203.0.113.7")).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    // Someone else is unaffected.
    expect((await post(scanRoute, { text: "listing" }, "203.0.113.8")).status).toBe(200);
  });

  it("one visitor can create 60 deals per 10 minutes, then a clear 429", async () => {
    const statuses = [];
    for (let i = 0; i < 61; i++) statuses.push((await post(dealsRoute, deal, "203.0.113.9")).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(60);
    expect(statuses[60]).toBe(429);
  });
});

describe("browser security headers", () => {
  it("every response gets a content policy, HTTPS-only, no framing, and no server banner", async () => {
    const config = (await import("../next.config")).default;
    expect(config.poweredByHeader).toBe(false);
    const [{ source, headers }] = await config.headers!();
    expect(source).toBe("/:path*");
    const h = Object.fromEntries(headers.map((x) => [x.key, x.value]));
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    // PayPal's checkout must keep working under the policy.
    expect(h["Content-Security-Policy"]).toMatch(/script-src[^;]*https:\/\/\*\.paypal\.com/);
    expect(h["Content-Security-Policy"]).toMatch(/frame-src[^;]*https:\/\/\*\.paypal\.com/);
  });
});
