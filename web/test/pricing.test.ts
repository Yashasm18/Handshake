import { describe, expect, it } from "vitest";
import { itemComps, median, partComps } from "@/lib/server/channel3";
import { refundFor } from "@/lib/refund";
import { JOYCON_SEARCH, SCREEN_SEARCH, SWITCH_SEARCH } from "./fixtures";

const DEAL = 23_000; // $230 Switch OLED

describe("part pricing", () => {
  it("prices a cracked Joy-Con from Joy-Cons, never from consoles", () => {
    const kept = partComps("left Joy-Con", JOYCON_SEARCH, DEAL);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((c) => /joy-con/i.test(c.title))).toBe(true);
    expect(kept.some((c) => /oled/i.test(c.title))).toBe(false);
    const price = median(kept.map((c) => c.priceCents));
    expect(price).toBeGreaterThanOrEqual(2_500);
    expect(price).toBeLessThanOrEqual(6_000);
  });

  it("drops anything priced like the item itself", () => {
    const kept = partComps("screen", [{ id: "x", title: "Switch OLED screen assembly with console", priceCents: 30_000 }], DEAL);
    expect(kept).toHaveLength(0);
  });

  it("prices a broken screen from replacement screens, not protectors", () => {
    const kept = partComps("screen", SCREEN_SEARCH, 30_000);
    expect(kept.map((c) => c.title)).toEqual(["iPhone 13 Screen Replacement", "iPhone 14 Pro Screen Replacement"]);
  });

  it("still prices a broken charger from chargers", () => {
    const kept = partComps("charger", [{ id: "c", title: "Nintendo Switch AC Charger", priceCents: 2_999 }], DEAL);
    expect(kept).toHaveLength(1);
  });
});

describe("market comps for the item", () => {
  it("excludes docks and cases from a console search", () => {
    const titles = itemComps("Nintendo Switch OLED", SWITCH_SEARCH).map((c) => c.title);
    expect(titles).not.toContain("Dock - Oled Model");
    expect(titles).not.toContain("Protective Case for Switch OLED");
    expect(titles).toContain("Switch OLED");
  });
});

describe("refund math", () => {
  it("refunds the real part price for the cracked Joy-Con", () => {
    const part = median(partComps("left Joy-Con", JOYCON_SEARCH, DEAL).map((c) => c.priceCents));
    const { refundCents, captureCents } = refundFor("NOT_AS_DESCRIBED", part, DEAL);
    expect(refundCents).toBe(part);
    expect(refundCents + captureCents).toBe(DEAL);
  });

  it("never refunds more than the verdict's cap or the price", () => {
    for (const verdict of ["MINOR_ISSUE", "NOT_AS_DESCRIBED"] as const) {
      const { refundCents } = refundFor(verdict, 999_999, DEAL);
      expect(refundCents).toBe(Math.round(DEAL * (verdict === "MINOR_ISSUE" ? 0.35 : 0.6)));
      expect(refundCents).toBeLessThan(DEAL);
    }
  });

  it("refunds nothing when the item matches the listing", () => {
    expect(refundFor("MATCHES_LISTING", 5_000, DEAL)).toEqual({ refundCents: 0, captureCents: DEAL });
  });

  it("falls back to a small share when no part price is found", () => {
    expect(refundFor("MINOR_ISSUE", null, DEAL).refundCents).toBe(Math.round(DEAL * 0.15));
  });
});
