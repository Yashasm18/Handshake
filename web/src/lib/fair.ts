import type { Market } from "./types";

// Used goods sell at a fraction of retail; the fraction depends on condition. Code decides the band,
// so the "fair zone" both sides see can't be argued up or down by either agent.
const BANDS: [RegExp, number, number][] = [
  [/\b(sealed|brand new|unopened|new in box)\b/i, 0.8, 0.95],
  [/\b(crack|broken|damage|dent|not working|for parts|worn|heavy)\b/i, 0.3, 0.5],
  // Matched on the whole condition text, so only phrases that describe the whole item ("screen in perfect condition" doesn't).
  [/\b(like new|mint condition|excellent condition|barely used|open box)\b/i, 0.62, 0.8],
];

export function fairBand(condition: string, market: Market | null | undefined) {
  if (!market?.medianCents) return null;
  const [, lo, hi] = BANDS.find(([re]) => re.test(condition)) ?? [null, 0.5, 0.68];
  const round = (c: number) => Math.round(c / 500) * 500; // nearest $5 reads like a human range
  return { lowCents: round(market.medianCents * lo), highCents: round(market.medianCents * hi) };
}
