import type { Claim } from "./types";

// Refund caps by verdict: a share of the price the buyer can never exceed, whatever the part costs.
export const REFUND_CAP = { MATCHES_LISTING: 0, MINOR_ISSUE: 0.35, NOT_AS_DESCRIBED: 0.6 } as const;
// Used when no replacement part price could be found.
const FALLBACK = { MATCHES_LISTING: 0, MINOR_ISSUE: 0.15, NOT_AS_DESCRIBED: 0.3 } as const;

// Money math lives in code, never in the model: grounded in the real part price and capped per verdict.
export function refundFor(verdict: Claim["verdict"], partPriceCents: number | null, priceCents: number) {
  const raw = partPriceCents ?? Math.round(priceCents * FALLBACK[verdict]);
  const refundCents = Math.max(0, Math.min(raw, Math.round(priceCents * REFUND_CAP[verdict]), priceCents));
  return { refundCents, captureCents: priceCents - refundCents };
}
