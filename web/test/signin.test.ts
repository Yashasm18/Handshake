import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-signin-"));
process.env.PAYPAL_CLIENT_ID = "client-id";
process.env.PAYPAL_CLIENT_SECRET = "client-secret";
process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

// Sign in with PayPal: the signed session, the OAuth round trip, and what an account may do on a deal.
// next/headers is replaced by a cookie jar the tests can read, like a browser would hold.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string, o?: { maxAge?: number }) => (o?.maxAge === 0 || v === "" ? jar.delete(k) : jar.set(k, v)),
  }),
}));

const session = await import("@/lib/server/session");
const login = await import("@/lib/server/paypal-login");
const { publicDeal, viewerFor, refuseOwnDeal } = await import("@/lib/server/auth");

const SECRET = "test-secret";
const ACCOUNT = { payerId: "SELLERPAYER1", name: "Sam Seller", firstName: "Sam", email: "sam@example.com", verified: true };

beforeEach(() => jar.clear());
afterEach(() => vi.unstubAllGlobals());

describe("session cookie", () => {
  it("round-trips the account", () => {
    expect(session.openSession(session.sealSession(ACCOUNT, SECRET), SECRET)).toEqual(ACCOUNT);
  });

  it("rejects a session someone edited, even by one character", () => {
    const value = session.sealSession(ACCOUNT, SECRET);
    const [body, mac] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ a: { ...ACCOUNT, payerId: "ATTACKER" }, exp: Date.now() + 1e9 })).toString("base64url");
    expect(session.openSession(`${forged}.${mac}`, SECRET)).toBeNull();
    expect(session.openSession(`${body}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`, SECRET)).toBeNull();
    expect(session.openSession(`${body}.${mac}.x`, SECRET)).toBeNull();
  });

  it("rejects a session signed with another key", () => {
    expect(session.openSession(session.sealSession(ACCOUNT, "other"), SECRET)).toBeNull();
    expect(session.openSession(session.sealSession(ACCOUNT, SECRET), null)).toBeNull();
  });

  it("expires after 30 days", () => {
    const at = Date.parse("2026-11-01T00:00:00Z");
    const v = session.sealSession(ACCOUNT, SECRET, at);
    expect(session.openSession(v, SECRET, at + 29 * 86_400_000)).not.toBeNull();
    expect(session.openSession(v, SECRET, at + 31 * 86_400_000)).toBeNull();
  });

  it("garbage is just signed out", () => {
    for (const v of [undefined, "", ".", "abc", "a.b", "%%%.%%%"]) expect(session.openSession(v, SECRET)).toBeNull();
  });

  it("without SESSION_SECRET, the key is derived from the PayPal secret and isn't the PayPal secret", () => {
    delete process.env.SESSION_SECRET;
    const k = session.sessionSecret();
    expect(k).toBeTruthy();
    expect(k).not.toBe("client-secret");
    process.env.SESSION_SECRET = "explicit";
    expect(session.sessionSecret()).toBe("explicit");
    delete process.env.SESSION_SECRET;
  });
});

describe("PayPal profile", () => {
  it("reads the paypalv1.1 shape: payer id, primary email, verified", () => {
    expect(
      login.accountFrom({ payer_id: "P1", name: "Sam Seller", given_name: "Sam", emails: [{ value: "old@x.com" }, { value: "sam@x.com", primary: true }], verified_account: "true" }),
    ).toEqual({ payerId: "P1", name: "Sam Seller", firstName: "Sam", email: "sam@x.com", verified: true });
  });

  it("reads the OpenID shape and treats a missing flag as unverified", () => {
    expect(login.accountFrom({ payer_id: "P2", given_name: "Bo", family_name: "Buyer", email: "bo@x.com" })).toEqual({ payerId: "P2", name: "Bo Buyer", firstName: "Bo", email: "bo@x.com", verified: false });
  });

  it("refuses a profile without a payer id, since there'd be nowhere to pay", () => {
    expect(() => login.accountFrom({ name: "No Id" })).toThrow(login.LoginError);
  });
});

describe("where sign-in sends you", () => {
  it("only to a path on this site", () => {
    expect(login.safeNext("/check?mode=sell&resume=1")).toBe("/check?mode=sell&resume=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r\n//evil.example", "/%09/evil.example".replace("%09", "\x00"), "javascript:alert(1)", null, ""]) {
      expect(login.safeNext(bad)).toBe("/deals");
    }
    // Dot segments can't collapse into a protocol-relative URL.
    for (const bad of ["/.//evil.example", "/a/..//evil.example", "/././/evil.example/x?y=1", "/%2e//evil.example", "/%2e%2e//evil.example"]) expect(login.safeNext(bad)).toBe("/deals");
    // Encoded tricks stay a harmless path on this site.
    expect(login.safeNext("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });

  it("asks PayPal for the payer id scope on the sandbox login page", () => {
    const u = new URL(login.authorizeUrl("https://h.example/api/auth/paypal/callback", "STATE"));
    expect(u.origin).toBe("https://www.sandbox.paypal.com");
    expect(u.searchParams.get("scope")).toContain("https://uri.paypal.com/services/paypalattributes");
    expect(u.searchParams.get("state")).toBe("STATE");
    expect(u.searchParams.get("client_id")).toBe("client-id");
  });

  it("builds the return URL from the public host Render forwards", () => {
    const req = new Request("http://localhost:10000/api/auth/signin", { headers: { "x-forwarded-host": "handshake.example", "x-forwarded-proto": "https" } });
    expect(login.callbackUrl(req)).toBe("https://handshake.example/api/auth/paypal/callback");
    expect(login.callbackUrl(new Request("http://localhost:3000/api/auth/signin", { headers: { host: "localhost:3000" } }))).toBe("http://localhost:3000/api/auth/paypal/callback");
  });
});

const start = (await import("@/app/api/auth/signin/route")).POST;
const startGet = (await import("@/app/api/auth/signin/route")).GET;
const callback = (await import("@/app/api/auth/paypal/callback/route")).GET;
const me = (await import("@/app/api/auth/me/route")).GET;
const signout = (await import("@/app/api/auth/signout/route")).POST;

describe("the sign-in round trip", () => {
  function paypal(profile: object = { payer_id: "SELLERPAYER1", name: "Sam Seller", given_name: "Sam", emails: [{ value: "sam@example.com", primary: true }], verified_account: true }) {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body?.toString() });
      if (url.endsWith("/v1/oauth2/token")) return init?.body?.toString().includes("code=GOOD") ? Response.json({ access_token: "user-token" }) : Response.json({ error_description: "bad code" }, { status: 400 });
      if (url.includes("/userinfo")) return Response.json(profile);
      return new Response("not found", { status: 404 });
    }));
    return calls;
  }

  async function begin(next = "/check?mode=sell&resume=1") {
    const res = await start(new Request("http://localhost:3000/api/auth/signin", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ next }) }));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    return new URL(url).searchParams.get("state")!;
  }


  const back = (q: string) => callback(new Request(`http://localhost:3000/api/auth/paypal/callback?${q}`));
  const where = (res: Response) => res.headers.get("location");

  it("never redirects to PayPal from the server: the browser goes there itself (Chrome blocks bounce-to-login)", async () => {
    const res = await start(new Request("http://localhost:3000/api/auth/signin", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000" }, body: "{}" }));
    expect(res.status).toBe(200);
    expect(new URL((await res.json()).url).origin).toBe("https://www.sandbox.paypal.com");
    const old = await startGet(new Request("http://localhost:3000/api/auth/signin?next=%2Fcheck", { headers: { host: "localhost:3000" } }));
    expect(old.headers.get("location")).toBe("/check");
  });

  it("another site can't start a sign-in", async () => {
    const res = await start(new Request("http://localhost:3000/api/auth/signin", { method: "POST", headers: { host: "localhost:3000", origin: "https://evil.example" }, body: "{}" }));
    expect(res.status).toBe(403);
    expect(jar.has(session.OAUTH_COOKIE)).toBe(false);
  });

  it("signs you in and returns you to where you were", async () => {
    const calls = paypal();
    const state = await begin();
    const res = await back(`code=GOOD&state=${state}`);
    expect(where(res)).toBe("/check?mode=sell&resume=1&signin=ok");
    expect(calls[0].body).toContain("grant_type=authorization_code");
    const who = await (await me()).json();
    expect(who.account).toEqual({ name: "Sam Seller", firstName: "Sam", email: "sam@example.com", verified: true });
    // The payer id never goes to the browser.
    expect(JSON.stringify(who)).not.toContain("SELLERPAYER1");
    expect(jar.has(session.OAUTH_COOKIE)).toBe(false);
  });

  it("refuses a callback with someone else's state (login CSRF)", async () => {
    paypal();
    await begin();
    expect(where(await back("code=GOOD&state=attacker-state"))).toContain("signin=expired");
    expect(jar.has(session.SESSION_COOKIE)).toBe(false);
  });

  it("refuses a callback this browser never started", async () => {
    paypal();
    expect(where(await back("code=GOOD&state=anything"))).toBe("/deals?signin=expired");
    expect(jar.has(session.SESSION_COOKIE)).toBe(false);
  });

  it("a state works once", async () => {
    paypal();
    const state = await begin();
    await back(`code=GOOD&state=${state}`);
    jar.delete(session.SESSION_COOKIE);
    expect(where(await back(`code=GOOD&state=${state}`))).toContain("signin=expired");
    expect(jar.has(session.SESSION_COOKIE)).toBe(false);
  });

  it("handles cancelling on PayPal, a bad code, and a profile without a payer id", async () => {
    paypal();
    expect(where(await back(`error=access_denied&state=${await begin()}`))).toContain("signin=cancelled");
    expect(where(await back(`code=BAD&state=${await begin()}`))).toContain("signin=failed");
    paypal({ name: "No Payer Id" });
    expect(where(await back(`code=GOOD&state=${await begin()}`))).toContain("signin=failed");
    expect(jar.has(session.SESSION_COOKIE)).toBe(false);
  });

  it("never redirects off-site, whatever next says", async () => {
    paypal();
    const state = await begin("https://evil.example/steal");
    expect(where(await back(`code=GOOD&state=${state}`))).toBe("/deals?signin=ok");
  });

  it("signs out", async () => {
    paypal();
    await back(`code=GOOD&state=${await begin()}`);
    await signout();
    expect((await (await me()).json()).account).toBeNull();
  });
});

describe("accounts on a deal", () => {
  const deal = (over: Partial<Deal> = {}): Deal => ({
    id: "acct-xxxxxxxxxxxxxxxxxx", createdAt: "", updatedAt: "", title: "Switch", priceCents: 20_000, condition: "Used", checklist: [],
    sellerName: "Sam", sellerEmail: "", scan: null, status: "HELD", demo: false, paypal: {}, events: [],
    sellerToken: "s-tok", buyerToken: "b-tok",
    seller: { payerId: "SELLERPAYER1", name: "Sam Seller", email: "sam@example.com", verified: true },
    buyer: { payerId: "BUYERPAYER1", name: "Bo Buyer", email: "bo@example.com", verified: false },
    ...over,
  });
  const as = (payerId: string) => ({ ...ACCOUNT, payerId });

  it("the seller's PayPal account opens the seller side on any device, with no deal cookie", () => {
    expect(viewerFor(deal(), {}, as("SELLERPAYER1"))).toEqual({ seller: true, buyer: false });
    expect(viewerFor(deal(), {}, as("BUYERPAYER1"))).toEqual({ seller: false, buyer: true });
  });

  it("another PayPal account, or no account, gets nothing", () => {
    expect(viewerFor(deal(), {}, as("SOMEONEELSE"))).toEqual({ seller: false, buyer: false });
    expect(viewerFor(deal(), {}, null)).toEqual({ seller: false, buyer: false });
    expect(viewerFor(deal({ seller: undefined, buyer: undefined }), {}, as("SELLERPAYER1"))).toEqual({ seller: false, buyer: false });
  });

  it("guest deals keep working with the browser cookie", () => {
    expect(viewerFor(deal({ seller: undefined }), { seller: "s-tok" }, null)).toEqual({ seller: true, buyer: false });
  });

  it("payer ids and emails never reach the browser; buyers only learn the seller is PayPal-verified", () => {
    for (const viewer of [{ seller: false, buyer: false }, { seller: true, buyer: false }, { seller: false, buyer: true }]) {
      const view = publicDeal(deal(), viewer);
      const json = JSON.stringify(view);
      for (const secret of ["SELLERPAYER1", "BUYERPAYER1", "sam@example.com", "bo@example.com"]) expect(json).not.toContain(secret);
      expect(view.sellerPayPal).toEqual({ signedIn: true, verified: true });
    }
    expect(publicDeal(deal({ seller: undefined }), { seller: false, buyer: false }).sellerPayPal).toEqual({ signedIn: false, verified: false });
  });

  it("a seller signed in with PayPal can't pay for their own deal", async () => {
    jar.set(session.SESSION_COOKIE, session.sealSession(ACCOUNT, session.sessionSecret()!));
    await expect(refuseOwnDeal(deal())).rejects.toThrow(/your own deal/);
    jar.set(session.SESSION_COOKIE, session.sealSession(as("BUYERPAYER1"), session.sessionSecret()!));
    await expect(refuseOwnDeal(deal())).resolves.toBeUndefined();
  });
});
