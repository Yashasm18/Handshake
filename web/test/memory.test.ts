import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryMatch, ScamMemory } from "@/lib/types";

process.env.ELASTIC_URL = "https://es.test";
process.env.ELASTIC_API_KEY = "test-key";
process.env.ELASTIC_INDEX = "scams-test";

const { indicatorsOf, describeIndicator, memoryFlags, recall, remember, reportScan, holdForReport, witnessOf, networkOf, fingerprintId } = await import("@/lib/server/memory");

// A fake Elasticsearch: records each request and answers by path.
type Call = { method: string; path: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
let answer: (c: Call) => unknown = () => ({});
beforeEach(() => {
  calls = [];
  answer = (c) => (c.path.endsWith("/_search") ? { hits: { hits: [], total: { value: 24 } } } : {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const c = { method: init.method!, path: url.replace("https://es.test", ""), body: init.body ? JSON.parse(init.body as string) : undefined };
    calls.push(c);
    return new Response(JSON.stringify(answer(c)), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const match = (over: Partial<MemoryMatch>): MemoryMatch => ({ id: "m", kinds: [], details: [], flags: [], seen: 1, lastSeen: "2026-11-04T00:00:00Z", reported: false, confirmed: true, ...over });
const mem = (...matches: MemoryMatch[]): ScamMemory => ({ size: 24, matches });

describe("fingerprints: contact and payment details, found in code", () => {
  it("finds phones in any format, emails, Cash App tags, accounts and odd links", () => {
    const text = "Call (408) 555-0199 or +1 408.555.0199, email Deals.Now@Gmail.com, Cash App $QuickDeals22, venmo @fast_seller, verify at secure-pay-verify.xyz";
    expect(indicatorsOf(text).sort()).toEqual(["cashtag:quickdeals22", "domain:secure-pay-verify.xyz", "email:deals.now@gmail.com", "handle:fast_seller", "phone:4085550199"].sort());
  });

  it("never mistakes prices for Cash App tags, or everyday sites for evidence", () => {
    expect(indicatorsOf("Selling for $230, or $200 if you pick up. Pay on paypal.com, see my craigslist.org post")).toEqual([]);
  });

  it("tells the buyer enough to recognize a detail, not the whole thing", () => {
    expect(describeIndicator("phone:4085550199")).toBe("the same phone number (ending 0199)");
    expect(describeIndicator("email:deals.now@gmail.com")).toBe("the same email (d•••@gmail.com)");
  });

  it("the same message, however it's spaced or capitalized, has one fingerprint", () => {
    expect(fingerprintId("Send as  Friends & Family")).toBe(fingerprintId("send as friends & family "));
  });

  it("a visitor is counted by a keyed hash of their network, never stored as-is", () => {
    expect(witnessOf("1.2.3.4")).not.toContain("1.2.3.4");
    expect(witnessOf("1.2.3.4")).toBe(witnessOf("1.2.3.4"));
    expect(witnessOf("1.2.4.4")).not.toBe(witnessOf("1.2.3.4"));
  });

  it("neighbouring addresses are one witness: IPv4 /24 and IPv6 /64", () => {
    expect(witnessOf("1.2.3.4")).toBe(witnessOf("1.2.3.250"));
    expect(networkOf("2001:db8:aa:bb:1:2:3:4")).toBe("2001:db8:aa:bb::/64");
    expect(witnessOf("2001:db8:aa:bb::1")).toBe(witnessOf("2001:db8:aa:bb:ffff::9"));
    expect(witnessOf("2001:db8:aa:bc::1")).not.toBe(witnessOf("2001:db8:aa:bb::1"));
  });
});

describe("memory flags: code decides how much a match counts", () => {
  it("no matches, no flags", () => {
    expect(memoryFlags(null)).toEqual([]);
    expect(memoryFlags(mem())).toEqual([]);
  });

  it("confirmed details are a known scam", () => {
    const f = memoryFlags(mem(match({ kinds: ["SAME_DETAILS"], details: ["the same phone number (ending 0199)"] })));
    expect(f).toMatchObject([{ type: "KNOWN_SCAM", quote: "Uses the same phone number (ending 0199)" }]);
  });

  it("details seen by only one visitor are a warning, not a verdict", () => {
    const f = memoryFlags(mem(match({ kinds: ["SAME_DETAILS"], details: ["the same phone number (ending 0177)"], confirmed: false })));
    expect(f.map((x) => x.type)).toEqual(["SIMILAR_SCAM"]);
  });

  it("a reused photo is flagged", () => {
    expect(memoryFlags(mem(match({ kinds: ["SAME_PHOTO"] })))[0]).toMatchObject({ type: "KNOWN_SCAM", quote: expect.stringContaining("photo") });
  });

  it("similar wording alone is a warning and counts every sighting", () => {
    const f = memoryFlags(mem(match({ kinds: ["SIMILAR_WORDING"], seen: 3 }), match({ id: "n", kinds: ["SIMILAR_WORDING"], seen: 2 })));
    expect(f).toMatchObject([{ type: "SIMILAR_SCAM", quote: "Reads like 5 scams Handshake has seen" }]);
  });
});

describe("recall: what Handshake asks Elasticsearch", () => {
  it("looks up exact details, wording through the Jina reranker, and photos by vector", async () => {
    await recall({ text: "Send F&F to $QuickDeals22", photos: [[0.1, 0.2]] });
    const searches = calls.filter((c) => c.path === "/scams-test/_search");
    expect(searches[0].body).toMatchObject({ query: { terms: { indicators: ["cashtag:quickdeals22"] } } });
    expect(searches[1].body).toMatchObject({ retriever: { text_similarity_reranker: { inference_id: ".jina-reranker-v3", field: "text", min_score: 0.2 } } });
    expect(searches.some((c) => (c.body as { knn?: { field: string; similarity: number } }).knn?.field === "photos.vector")).toBe(true);
  });

  it("explains each match and puts exact details first", async () => {
    answer = (c) => {
      const b = c.body as Record<string, unknown> | undefined;
      const hit = (id: string, extra = {}) => ({ _id: id, _score: 1, _source: { flags: ["URGENCY"], seen: 2, lastSeen: "2026-11-04", indicators: ["cashtag:quickdeals22"], sources: ["seed"], ...extra } });
      if (b && "query" in b && (b.query as Record<string, unknown>).terms) return { hits: { hits: [hit("a")], total: { value: 1 } } };
      if (b && "retriever" in b) return { hits: { hits: [hit("b", { indicators: [] })], total: { value: 1 } } };
      return { hits: { hits: [], total: { value: 24 } } };
    };
    const m = await recall({ text: "Pay $QuickDeals22 now, F&F only" });
    expect(m).toMatchObject({ size: 24, matches: [{ id: "a", kinds: ["SAME_DETAILS"], details: ["the same Cash App tag ($quickdeals22)"], confirmed: true }, { id: "b", kinds: ["SIMILAR_WORDING"] }] });
  });

  it("a detail met by two different people in different messages is confirmed", async () => {
    answer = (c) => {
      const b = c.body as Record<string, unknown> | undefined;
      const hit = (id: string, w: string) => ({ _id: id, _score: 1, _source: { flags: [], seen: 1, lastSeen: "2026-11-04", indicators: ["phone:6505550177"], sources: ["report"], witnesses: [w] } });
      if (b && "query" in b && (b.query as Record<string, unknown>).terms) return { hits: { hits: [hit("a", "w1"), hit("b", "w2")], total: { value: 2 } } };
      return { hits: { hits: [], total: { value: 2 } } };
    };
    const m = await recall({ text: "text me 650 555 0177" });
    expect(m!.matches.every((x) => x.confirmed)).toBe(true);
    expect(memoryFlags(m)[0].type).toBe("KNOWN_SCAM");
  });

  it("stays off without Elastic settings", async () => {
    const url = process.env.ELASTIC_URL;
    delete process.env.ELASTIC_URL;
    expect(await recall({ text: "anything" })).toBeNull();
    process.env.ELASTIC_URL = url;
    expect(calls).toEqual([]);
  });
});

describe("remember and report", () => {
  const fp = { sellerText: "Send F&F, text 650-555-0177", tactics: ["Send F&F"], flags: ["FRIENDS_AND_FAMILY"], risk: "HIGH", item: "MacBook" };

  it("upserts one fingerprint per message: tactics for meaning, details for exact matches", async () => {
    await remember({ ...fp, source: "scan", witness: "w1" });
    const up = calls.find((c) => c.path.startsWith("/scams-test/_update/"))!;
    expect(up.path).toContain(fingerprintId(fp.sellerText));
    // A scan's own save and its buyer's report can race on the same document.
    expect(up.path).toContain("retry_on_conflict=");
    expect(up.body).toMatchObject({ upsert: { text: "Send F&F", indicators: ["phone:6505550177"], sources: ["scan"], witnesses: ["w1"], seen: 1 } });
    expect(JSON.stringify(up.body)).not.toContain("buyer");
  });

  it("keeps nothing it couldn't recognize again", async () => {
    expect(await remember({ ...fp, sellerText: "Nice bike", tactics: [], source: "scan" })).toBeNull();
    expect(calls.some((c) => c.path.includes("_update"))).toBe(false);
  });

  it("only the person who ran a scan can report it", async () => {
    holdForReport("owned", fp, "owner-w");
    expect(await reportScan("owned", "someone-else")).toBe("expired");
    expect(await reportScan("owned", "owner-w")).toBe("remembered");
  });

  it("a report needs a recent scan that found warning signs, and counts each visitor once", async () => {
    expect(await reportScan("missing", "w")).toBe("expired");
    holdForReport("low", { ...fp, risk: "LOW" });
    expect(await reportScan("low", "w")).toBe("nothing-suspicious");
    holdForReport("scan-1", fp);
    expect(await reportScan("scan-1", "w1")).toBe("remembered");
    expect(await reportScan("scan-1", "w1")).toBe("already");
    expect(calls.filter((c) => c.path.includes("_update"))).toHaveLength(1);
  });
});
