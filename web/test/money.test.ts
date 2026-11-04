import { describe, expect, it } from "vitest";
import { REFUND_CAP, refundFor } from "@/lib/refund";
import { fairBand } from "@/lib/fair";
import { countdown, DAY, deadlinesFor, dueNow } from "@/lib/deadlines";
import { itemComps, median, type Comp } from "@/lib/server/channel3";
import type { Deal } from "@/lib/types";

describe("refunds: code computes every amount", () => {
  it("a delivery that matches the listing refunds nothing, whatever the part costs", () => {
    expect(refundFor("MATCHES_LISTING", 9_999, 23_000)).toEqual({ refundCents: 0, captureCents: 23_000 });
  });

  it("refunds the real part price when it's under the cap", () => {
    expect(refundFor("MINOR_ISSUE", 4_999, 23_000)).toEqual({ refundCents: 4_999, captureCents: 18_001 });
  });

  it("caps a minor issue at 35% and not-as-described at 60% of the price", () => {
    expect(refundFor("MINOR_ISSUE", 50_000, 20_000).refundCents).toBe(20_000 * REFUND_CAP.MINOR_ISSUE);
    expect(refundFor("NOT_AS_DESCRIBED", 50_000, 20_000).refundCents).toBe(20_000 * REFUND_CAP.NOT_AS_DESCRIBED);
  });

  it("falls back to a small share when no part price was found", () => {
    expect(refundFor("MINOR_ISSUE", null, 20_000).refundCents).toBe(3_000);
    expect(refundFor("NOT_AS_DESCRIBED", null, 20_000).refundCents).toBe(6_000);
  });

  it("never refunds a negative amount, and refund plus capture always equals the price", () => {
    for (const verdict of ["MATCHES_LISTING", "MINOR_ISSUE", "NOT_AS_DESCRIBED"] as const) {
      for (const part of [null, -500, 0, 1, 12_345, 10_000_000]) {
        for (const price of [100, 4_999, 23_000, 150_000]) {
          const r = refundFor(verdict, part, price);
          expect(r.refundCents).toBeGreaterThanOrEqual(0);
          expect(r.refundCents).toBeLessThanOrEqual(price);
          expect(r.refundCents + r.captureCents).toBe(price);
        }
      }
    }
  });
});

describe("fair price band", () => {
  const market = { query: "", medianCents: 30_000, lowCents: 0, highCents: 0, comps: [], belowMarketPct: null };

  it("has no band without market data", () => {
    expect(fairBand("Used", null)).toBeNull();
    expect(fairBand("Used", { ...market, medianCents: 0 })).toBeNull();
  });

  it("prices used goods at 50-68% of retail, rounded to $5", () => {
    expect(fairBand("Used, works fine", market)).toEqual({ lowCents: 15_000, highCents: 20_500 });
  });

  it("sealed items sit near retail and damaged ones far below", () => {
    expect(fairBand("Brand new, sealed", market)).toEqual({ lowCents: 24_000, highCents: 28_500 });
    expect(fairBand("Cracked screen, for parts", market)).toEqual({ lowCents: 9_000, highCents: 15_000 });
  });

  it("damage wins over praise for one part", () => {
    expect(fairBand("Screen in perfect condition but the hinge is broken", market)?.highCents).toBe(15_000);
  });
});

describe("market prices", () => {
  const c = (title: string, priceCents: number): Comp => ({ id: title, title, priceCents });

  it("median handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([100, 200, 301, 400])).toBe(251);
    expect(median([])).toBe(0);
  });

  it("drops cases and chargers when pricing the item itself", () => {
    const comps = [c("Nintendo Switch OLED", 34_999), c("Switch OLED Carrying Case", 1_999), c("Switch OLED Screen Protector", 899)];
    expect(itemComps("Nintendo Switch OLED", comps).map((x) => x.title)).toEqual(["Nintendo Switch OLED"]);
  });

  it("keeps accessories when the listing is an accessory", () => {
    const comps = [c("Switch Pro Controller Charger", 1_999), c("Switch OLED", 34_999)];
    expect(itemComps("Switch charger", comps)).toHaveLength(2);
  });
});

describe("deadline clock", () => {
  const T0 = Date.parse("2026-11-01T00:00:00Z");
  const held = { status: "HELD", clock: { heldAt: new Date(T0).toISOString() }, paypal: {} } as unknown as Deal;

  it("a demo scale shrinks the clock without changing what's due", () => {
    expect(deadlinesFor(held, 0.001)[0]).toMatchObject({ kind: "SHIP_BY", at: T0 + 3 * DAY * 0.001 });
  });

  it("is due exactly at the deadline, not a millisecond before", () => {
    expect(dueNow(held, T0 + 3 * DAY - 1)).toEqual([]);
    expect(dueNow(held, T0 + 3 * DAY)).toHaveLength(1);
  });

  it("a deal with no clock has no deadlines", () => {
    expect(deadlinesFor({ ...held, clock: undefined })).toEqual([]);
  });

  it("formats the countdown honestly", () => {
    expect(countdown(0)).toBe("now");
    expect(countdown(-5)).toBe("now");
    expect(countdown(45_000)).toBe("45s");
    expect(countdown(5 * 60_000 + 7_000)).toBe("5m 07s");
    expect(countdown(3 * 3_600_000 + 5 * 60_000)).toBe("3h 05m");
    expect(countdown(2 * DAY + 14 * 3_600_000)).toBe("2d 14h");
  });
});
