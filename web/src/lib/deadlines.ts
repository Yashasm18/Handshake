import type { Deal, Tracking, TrackingFlag } from "./types";

// Signs of a fake shipment. Any of them stops a payout on silence: the buyer has to confirm it arrived.
// REUSED_NUMBER isn't here: reuse depends on other deals, so the payout itself rechecks it fresh each
// time (see timers.ts AUTO_RELEASE). A stale flag can then never stall an honest seller.
export const BLOCKING_FLAGS: TrackingFlag[] = ["UNKNOWN_NUMBER", "WRONG_ZIP", "DELIVERED_BEFORE_SHIPPED", "LOST"];
export const blocksRelease = (t?: Tracking) => Boolean(t?.flags.some((f) => BLOCKING_FLAGS.includes(f)));

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
  // With carrier tracking, it's 3 days from the moment the carrier says it was delivered instead.
  DELIVERED_WINDOW: 3 * DAY,
  // The carrier returned the parcel to the seller: the buyer's hold is released straight away.
  RETURNED: 0,
  // How often the timer asks the carrier, in case a webhook went missing.
  TRACKING_CHECK: 3 * 60 * 60 * 1000,
  // A damage proposal nobody declines settles after 3 days.
  CLAIM_SETTLE: 3 * DAY,
  // Money captured but the payout refused (say, the platform balance was short): retried with backoff.
  // Timed by payoutRetryAt, not a fixed rule, and never scaled.
  PAYOUT: 0,
} as const;

// DELIVERED_WINDOW is a length of time used by AUTO_RELEASE, not a deadline of its own.
export type DeadlineKind = Exclude<keyof typeof RULES, "DELIVERED_WINDOW">;
export const DEADLINE_KINDS = (Object.keys(RULES) as (keyof typeof RULES)[]).filter((k): k is DeadlineKind => k !== "DELIVERED_WINDOW");
// Deadlines Handshake handles behind the scenes; people don't need a countdown for them.
export const BACKSTAGE: DeadlineKind[] = ["REAUTHORIZE", "PAYOUT", "TRACKING_CHECK", "RETURNED"];

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
  // Captured but not yet paid out: the only thing left is to retry the payout. Nothing else may run.
  if (deal.paypal.captureId && deal.status !== "SETTLED" && deal.status !== "RELEASED") {
    const at = deal.paypal.payoutRetryAt ? Date.parse(deal.paypal.payoutRetryAt) : Date.parse(deal.updatedAt);
    out.push({ kind: "PAYOUT", at: Number.isFinite(at) ? at : 0, who: "handshake", consequence: "Handshake retries paying the seller" });
    return out;
  }
  // Only an uncaptured hold can be renewed (a settlement may have captured and then paused before payout).
  if ((deal.status === "SHIPPED" || deal.status === "CLAIM_OPEN") && !c.reauthorizedAt && !deal.paypal.captureId) {
    out.push({ kind: "REAUTHORIZE", at: c.reauthorizeAfter ? Date.parse(c.reauthorizeAfter) : t(c.authorizedAt, "REAUTHORIZE"), who: "handshake", consequence: "Handshake renews the PayPal hold" });
  }
  // Paying out on silence needs proof the item really went to the buyer: a label photo that matched
  // their PayPal address. A tracking number typed by the seller isn't enough.
  const tracking = deal.shipment?.tracking;
  // Until EasyPost has actually registered the parcel (no tracker id yet, say it was down or rate
  // limited), the deal keeps the label-verified rule and the timer keeps trying to register it.
  if (deal.status === "SHIPPED" && tracking && !tracking.trackerId) {
    // Only for temporary failures: a number EasyPost rejected carries a blocking flag, so the buyer
    // has to confirm and there's nothing left to retry.
    if (!blocksRelease(tracking)) {
      if (deal.shipment?.labelCheck?.match) out.push({ kind: "AUTO_RELEASE", at: t(c.shippedAt, "AUTO_RELEASE"), who: "buyer", consequence: "payment is released to the seller" });
      out.push({ kind: "TRACKING_CHECK", at: (Date.parse(tracking.checkedAt ?? c.shippedAt ?? "") || 0) + RULES.TRACKING_CHECK, who: "handshake", consequence: "Handshake asks the carrier for news" });
    }
  } else if (deal.status === "SHIPPED" && tracking) {
    // With carrier tracking, silence only pays the seller once the carrier says it was delivered, there's
    // positive proof it went to the buyer (the delivery ZIP matches their PayPal address, or the label
    // photo did), and no scam sign shows. The buyer gets 3 days from the delivery scan.
    const provenAddress = tracking.addressCheck === "match" || Boolean(deal.shipment?.labelCheck?.match);
    if (tracking.status === "delivered" && tracking.deliveredAt && provenAddress && !blocksRelease(tracking)) {
      out.push({ kind: "AUTO_RELEASE", at: Date.parse(tracking.deliveredAt) + RULES.DELIVERED_WINDOW * scale, who: "buyer", consequence: "payment is released to the seller" });
    }
    if (tracking.status === "return_to_sender") {
      out.push({ kind: "RETURNED", at: Date.parse(tracking.checkedAt ?? c.shippedAt ?? "") || 0, who: "handshake", consequence: "the hold is released to the buyer" });
    }
    if (!["delivered", "return_to_sender", "cancelled"].includes(tracking.status)) {
      out.push({ kind: "TRACKING_CHECK", at: (Date.parse(tracking.checkedAt ?? c.shippedAt ?? "") || 0) + RULES.TRACKING_CHECK, who: "handshake", consequence: "Handshake asks the carrier for news" });
    }
  } else if (deal.status === "SHIPPED" && deal.shipment?.labelCheck?.match) {
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
