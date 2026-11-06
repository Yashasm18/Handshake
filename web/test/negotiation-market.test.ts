import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

// The agents argue from retail prices Handshake looks up itself for the deal's own title, never from the
// seller's scan: a seller could have run that check on a pricier listing to nudge the buyer's agent up.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-negmarket-"));

const prompts: string[] = [];
const ai = vi.hoisted(() => ({
  structured: vi.fn(async (o: { user: { type: string; text?: string }[]; system: string }) => {
    prompts.push([o.system, ...o.user.map((p) => p.text ?? "")].join("\n"));
    return { message: "Deal.", offer_usd: 250, accept: true };
  }),
}));
vi.mock("@/lib/server/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/server/ai")>()), structured: ai.structured }));
const c3 = vi.hoisted(() => ({
  searchComps: vi.fn(async (q: string) => [300, 290, 310].map((d, i) => ({ id: `c${i}`, title: `${q} retail`, priceCents: d * 100 }))),
}));
vi.mock("@/lib/server/channel3", async (orig) => ({ ...(await orig<typeof import("@/lib/server/channel3")>()), searchComps: c3.searchComps }));

const { startNegotiation, runNegotiation } = await import("@/lib/server/negotiate");
const { saveDeal, getDeal } = await import("@/lib/server/deals");

it("the agents see Handshake's own retail lookup for the deal's title, not the seller's scan", async () => {
  const now = new Date().toISOString();
  const deal: Deal = {
    id: "negmarket-xxxxxxxxxxxxx", createdAt: now, updatedAt: now, title: "Nintendo Switch OLED", priceCents: 28_000, condition: "Used, good", checklist: [],
    sellerName: "Sam", sellerEmail: "", demo: false, paypal: { orderId: "O", authorizationId: "A" }, events: [], status: "HELD", floorCents: 22_000, pendingOfferCents: 26_000,
    // The seller's scan claims a $1,000 retail price (say, from a scan of some other, pricier listing).
    scan: { item: "MacBook Pro", priceCents: 28_000, condition: "", checklist: [], flags: [], risk: "LOW", summary: "", market: { query: "MacBook Pro", medianCents: 100_000, lowCents: 90_000, highCents: 110_000, belowMarketPct: 72, comps: [] } },
  };
  startNegotiation(deal);
  await saveDeal(deal);
  runNegotiation(deal.id);
  for (let i = 0; i < 100 && (await getDeal(deal.id))!.status === "NEGOTIATING"; i++) await new Promise((r) => setTimeout(r, 100));

  const n = (await getDeal(deal.id))!.negotiation!;
  expect(c3.searchComps).toHaveBeenCalledWith("Nintendo Switch OLED");
  expect(n.market).toMatchObject({ query: "Nintendo Switch OLED", medianCents: 30_000 });
  expect(n.fair).not.toBeNull();
  expect(prompts.length).toBeGreaterThan(0);
  expect(prompts.join("\n")).toContain("$300");
  expect(prompts.join("\n")).not.toMatch(/\$1,000|MacBook/);
}, 20_000);
