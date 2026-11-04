import type { Deal } from "./types";

// Every deal has a clock, so nobody can stall it: a seller who never ships, a buyer who goes quiet,
// a claim nobody answers, or a PayPal hold getting old. Deadlines are computed from the deal alone
// (no I/O), so the server, the timer workflow and the countdown UI all agree on them.

export const DAY = 24 * 60 * 60 * 1000;

export const RULES = {
  // The seller has 3 days from payment to ship, or the buyer's hold is released.
  SHIP_BY: 3 * DAY,
  // For an in-person deal, the same 3 days to meet and hand it over.
  MEET_BY: 3 * DAY,
  // PayPal honors an authorization for 3 days; renewing then keeps the funds reserved during shipping.
  REAUTHORIZE: 3 * DAY,
  // After shipping, the buyer has 7 days to confirm or report a problem before payment releases.
  AUTO_RELEASE: 7 * DAY,
  // A damage proposal nobody declines settles after 3 days.
  CLAIM_SETTLE: 3 * DAY,
} as const;

export type DeadlineKind = keyof typeof RULES;

export type Deadline = {
  kind: DeadlineKind;
  at: number; // epoch ms
  // Who has to act before `at`, and what happens if they don't.
  who: "buyer" | "seller" | "both" | "handshake";
  consequence: string;
};

// `scale` shrinks every rule for demos (1 = real days). It never changes the order of events.
export function deadlinesFor(deal: Deal, scale = 1): Deadline[] {
  const c = deal.clock;
  if (!c) return [];
  const t = (iso: string | undefined, kind: DeadlineKind) => (iso ? Date.parse(iso) + RULES[kind] * scale : NaN);
  const out: Deadline[] = [];

  // Once money is captured it can't be released by a deadline; only the settlement can finish.
  if (deal.status === "HELD" && !deal.paypal.captureId) {
    const kind = deal.handoff === "meet" ? "MEET_BY" : "SHIP_BY";
    out.push({ kind, at: t(c.heldAt, kind), who: kind === "MEET_BY" ? "both" : "seller", consequence: "the hold is released and the buyer pays nothing" });
  }
  // Only an uncaptured hold can be renewed (a settlement may have captured and then paused before payout).
  if ((deal.status === "SHIPPED" || deal.status === "CLAIM_OPEN") && !c.reauthorizedAt && !deal.paypal.captureId) {
    out.push({ kind: "REAUTHORIZE", at: c.reauthorizeAfter ? Date.parse(c.reauthorizeAfter) : t(c.authorizedAt, "REAUTHORIZE"), who: "handshake", consequence: "Handshake renews the PayPal hold" });
  }
  // Paying out on silence needs proof the item really went to the buyer: a label photo that matched
  // their PayPal address. A tracking number typed by the seller isn't enough.
  if (deal.status === "SHIPPED" && deal.shipment?.labelCheck?.match) {
    out.push({ kind: "AUTO_RELEASE", at: t(c.shippedAt, "AUTO_RELEASE"), who: "buyer", consequence: "payment is released to the seller" });
  }
  if (deal.status === "CLAIM_OPEN" && !deal.claim?.declinedBy) {
    out.push({ kind: "CLAIM_SETTLE", at: t(c.claimAt, "CLAIM_SETTLE"), who: "both", consequence: "the proposed refund settles automatically" });
  }
  return out.filter((d) => Number.isFinite(d.at)).sort((a, b) => a.at - b.at);
}

export const dueNow = (deal: Deal, now: number, scale = 1) => deadlinesFor(deal, scale).filter((d) => d.at <= now);

// "2d 14h", "3h 05m", "45s": compact and honest about the unit.
export function countdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}
