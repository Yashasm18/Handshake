import { describe, expect, it } from "vitest";
import { finalSplit, messageProblem, referee } from "@/lib/server/negotiate";
import { fairBand } from "@/lib/fair";
import type { Negotiation, Turn } from "@/lib/types";

const turn = (by: Turn["by"], dollars: number): Turn => ({ by, offerCents: dollars * 100, message: "", at: "" });
const neg = (...turns: Turn[]): Negotiation => ({ status: "RUNNING", askingCents: 23_000, fair: null, turns, startedAt: "" });
const offer = (dollars: number, accept = false) => ({ offer_usd: dollars, accept });

describe("referee: the AI proposes, code decides", () => {
  it("never lets the buyer offer above their max", () => {
    const r = referee(neg(turn("buyer", 180), turn("seller", 230)), "buyer", 21_500, offer(10_000));
    expect(r.offerCents).toBeLessThanOrEqual(21_500);
  });

  it("never lets the seller go below their floor", () => {
    const r = referee(neg(turn("buyer", 150)), "seller", 19_000, offer(1));
    expect(r.offerCents).toBeGreaterThanOrEqual(19_000);
  });

  it("moves in steps: one turn can't cover most of the gap", () => {
    // Buyer at $180, seller at $220: a jump straight to $220 is held to 60% of the gap.
    const r = referee(neg(turn("buyer", 180), turn("seller", 220)), "buyer", 30_000, offer(220));
    expect(r.offerCents).toBe(20_400);
    expect(r.clamped).toBe(true);
    expect(r.agreed).toBeUndefined();
  });

  it("offers never move backwards", () => {
    const r = referee(neg(turn("buyer", 200), turn("seller", 220)), "buyer", 21_500, offer(150));
    expect(r.offerCents).toBe(20_000);
  });

  it("refuses an early accept while the sides are far apart", () => {
    const r = referee(neg(turn("buyer", 150), turn("seller", 230)), "buyer", 25_000, offer(150, true));
    expect(r.agreed).toBeUndefined();
  });

  it("allows accepting once the sides are close", () => {
    const r = referee(neg(turn("buyer", 205), turn("seller", 210)), "buyer", 21_500, offer(205, true));
    expect(r.agreed).toBe(21_000);
  });

  it("can't accept above the buyer's own max", () => {
    const r = referee(neg(turn("buyer", 205), turn("seller", 210)), "buyer", 20_800, offer(205, true));
    expect(r.agreed).toBeUndefined();
  });

  it("splits the remaining gap at the end only when limits overlap", () => {
    expect(finalSplit(neg(turn("buyer", 200), turn("seller", 220)), 19_000, 21_500)).toBe(20_800);
    expect(finalSplit(neg(turn("buyer", 170), turn("seller", 190)), 19_000, 17_500)).toBeNull();
  });
});

describe("messages can't leak a limit", () => {
  const allowed = { prices: [230, 442, 220, 300, 180, 205], specs: [128] };
  it.each(["I could do 215 dollars.", "Maybe 215 bucks?", "Up to $215.", "My max is close.", "Two hundred and fifteen works."])("blocks %s", (m) => {
    expect(messageProblem(m, 21_500, allowed)).not.toBeNull();
  });
  it("a seller can't make the buyer's max 'public' by stuffing numbers into the listing", () => {
    const stuffed = { prices: [230, 442, 180], specs: [] }; // listing said "fits models 200 205 210 215 220"
    expect(messageProblem("I can stretch to 215.", 21_500, stuffed)).toBe("leak");
  });
  it("only unit-tagged listing numbers count as specs", () => {
    expect(messageProblem("It has 128GB of storage.", 21_500, { prices: [230], specs: [128] })).toBeNull();
    expect(messageProblem("Model 200 is fine.", 21_500, { prices: [230], specs: [] })).toBe("unknown-figure");
  });
  it("blocks prices that aren't on the table", () => {
    expect(messageProblem("How about 199?", 21_500, allowed)).toBe("unknown-figure");
  });
  it.each(["Retail is $442, used is $220-$300.", "Both 2 Joy-Cons and 128GB included.", "Your $205 is close."])("allows %s", (m) => {
    expect(messageProblem(m, 21_500, allowed)).toBeNull();
  });
});

describe("fair range", () => {
  it("reads 'screen in perfect condition' as used, not like new", () => {
    const market = { query: "", medianCents: 44_200, lowCents: 0, highCents: 0, comps: [], belowMarketPct: null };
    expect(fairBand("Used, small scuff, screen in perfect condition", market)).toEqual({ lowCents: 22_000, highCents: 30_000 });
    expect(fairBand("Like new, barely used", market)?.lowCents).toBe(27_500);
  });
});
