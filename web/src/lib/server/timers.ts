import "server-only";
import { DAY, RULES, dueNow, type DeadlineKind } from "../deadlines";
import type { Deal } from "../types";
import { usd } from "../types";
import { allDeals, log, withDeal } from "./deals";
import { settle } from "./flows";
import { PayPalError, reauthorizeHold, voidHold } from "./paypal";
import { createTracker, getTracker, trackingEnabled } from "./easypost";
import { applyTracker, reusedElsewhere } from "./tracking";
import { announceTracking } from "./notify";

// TIMER_SCALE shrinks every deadline for demos (e.g. 0.0007 ≈ a day per minute). Real deals use 1.
export const timerScale = () => {
  const v = Number(process.env.TIMER_SCALE);
  return v > 0 && v <= 1 ? v : 1;
};

// "3 days", or "3 minutes (demo speed)" when the clock is scaled.
function span(kind: keyof typeof RULES) {
  const ms = RULES[kind] * timerScale();
  if (ms >= DAY) return `${Math.round(ms / DAY)} days`;
  const min = Math.max(1, Math.round(ms / 60_000));
  return `${min} minute${min === 1 ? "" : "s"} (demo speed)`;
}

// Everything past a deadline right now, across all deals. The timer workflow fans these out.
export async function dueTimers(now = Date.now()) {
  return (await allDeals()).flatMap((d) => dueNow(d, now, timerScale()).map((t) => ({ dealId: d.id, kind: t.kind, at: t.at })));
}

export type TimerResult = { dealId: string; kind: DeadlineKind; outcome: "done" | "not-due" | "rescheduled"; detail: string };

// Runs one deadline's action. Safe to call twice or concurrently: it re-checks the deadline inside the
// deal lock, and a deal that already moved on (shipped, settled, cancelled) simply reports "not-due".
export async function runTimer(dealId: string, kind: DeadlineKind, now = Date.now()): Promise<TimerResult> {
  return withDeal(dealId, async (deal) => {
    const due = dueNow(deal, now, timerScale()).some((t) => t.kind === kind);
    if (!due) return { dealId, kind, outcome: "not-due", detail: `Nothing to do; the deal is ${deal.status}.` };
    // A failed PayPal call fails the run so the workflow retries it. Completed steps stay recorded
    // (settle resumes where it stopped), so a retry never repeats a money movement.
    return { dealId, kind, ...(await ACTIONS[kind](deal, now)) };
  });
}

type Action = (deal: Deal, now: number) => Promise<Omit<TimerResult, "dealId" | "kind">>;

// Retries re-enter an action; its explanation should still appear only once.
function logOnce(deal: Deal, text: string) {
  if (!deal.events.some((e) => e.actor === "handshake" && e.text === text)) log(deal, "handshake", text);
}

const ACTIONS: Record<DeadlineKind, Action> = {
  async SHIP_BY(deal) {
    if (deal.paypal.authorizationId) await voidHold(deal.paypal.authorizationId);
    deal.status = "RELEASED";
    log(deal, "handshake", `${deal.sellerName} didn't ship within ${span("SHIP_BY")}, so the hold was released automatically. The buyer paid nothing.`);
    return { outcome: "done", detail: "Hold voided" };
  },

  async MEET_BY(deal) {
    if (deal.paypal.authorizationId) await voidHold(deal.paypal.authorizationId);
    deal.status = "RELEASED";
    deal.meetup = undefined;
    log(deal, "handshake", `The meetup didn't happen within ${span("MEET_BY")}, so the hold was released automatically. The buyer paid nothing.`);
    return { outcome: "done", detail: "Hold voided" };
  },

  async REAUTHORIZE(deal, now) {
    try {
      const fresh = await reauthorizeHold(deal.paypal.authorizationId!);
      deal.paypal.authorizationId = fresh.id;
      deal.clock = { ...deal.clock, reauthorizedAt: new Date(now).toISOString(), reauthorizeAfter: undefined };
      log(deal, "paypal", "Renewed the PayPal hold so the money stays reserved until delivery.", fresh.id);
      return { outcome: "done", detail: `New authorization ${fresh.id}` };
    } catch (e) {
      // PayPal only reauthorizes after its own 3-day honor period; on a demo-speed clock we're early, so try again later.
      if (e instanceof PayPalError && /TOO_SOON|HONOR|REAUTHORI[SZ]E/i.test(`${e.issue} ${e.message}`)) {
        deal.clock = { ...deal.clock, reauthorizeAfter: new Date(now + 6 * 60 * 60 * 1000).toISOString() };
        return { outcome: "rescheduled", detail: "PayPal's honor period isn't over yet; retrying in 6 hours" };
      }
      throw e; // anything else fails the run so the workflow retries it
    }
  },

  async AUTO_RELEASE(deal) {
    // Two deals could ship the same number at the same moment; check again right before paying out.
    const t = deal.shipment?.tracking;
    if (t && reusedElsewhere(deal, await allDeals())) {
      if (!t.flags.includes("REUSED_NUMBER")) t.flags.push("REUSED_NUMBER");
      logOnce(deal, "This tracking number is also used on another Handshake deal, so payment won't be released without the buyer's confirmation.");
      return { outcome: "rescheduled", detail: "Tracking number reused; waiting for the buyer" };
    }
    logOnce(
      deal,
      deal.shipment?.tracking
        ? `The carrier delivered it and the buyer didn't confirm or report a problem within ${span("DELIVERED_WINDOW")}, so payment was released automatically.`
        : `The buyer didn't confirm or report a problem within ${span("AUTO_RELEASE")} of a verified shipment, so payment was released automatically.`,
    );
    await settle(deal, deal.priceCents, "Handshake: released after the inspection window");
    return { outcome: "done", detail: `Captured ${usd(deal.priceCents)}` };
  },

  // The carrier brought the parcel back to the seller: nothing was delivered, so nothing is charged.
  async RETURNED(deal) {
    if (deal.paypal.authorizationId) await voidHold(deal.paypal.authorizationId);
    deal.status = "RELEASED";
    log(deal, "handshake", "The carrier returned the parcel to the seller, so the hold was released. The buyer paid nothing.");
    return { outcome: "done", detail: "Hold voided" };
  },

  // A webhook may go missing; this asks the carrier directly.
  async TRACKING_CHECK(deal, now) {
    const t = deal.shipment?.tracking;
    if (!t || !trackingEnabled()) return { outcome: "rescheduled", detail: "Tracking is off" };
    const tracker = t.trackerId ? await getTracker(t.trackerId) : await createTracker(deal.shipment!.trackingNumber, deal.shipment!.carrier);
    announceTracking(deal, applyTracker(deal, tracker, now));
    return { outcome: "done", detail: `Parcel is ${deal.shipment!.tracking!.status}` };
  },

  async PAYOUT(deal, now) {
    // settle resumes after the recorded capture, so this only ever retries the payout itself.
    await settle(deal, deal.paypal.capturedCents!, "Handshake payout", now);
    if (deal.status === "SETTLED") return { outcome: "done", detail: `Paid out ${usd(deal.paypal.payoutCents ?? 0)}` };
    return { outcome: "rescheduled", detail: `Payout retries at ${deal.paypal.payoutRetryAt}` };
  },

  async CLAIM_SETTLE(deal) {
    const claim = deal.claim!;
    logOnce(deal, `Nobody declined the proposal within ${span("CLAIM_SETTLE")}, so it settled automatically.`);
    await settle(deal, claim.captureCents, claim.refundCents ? `Handshake settlement: ${usd(claim.refundCents)} released for ${claim.damagedPart}` : "Handshake: delivered as described");
    return { outcome: "done", detail: `Captured ${usd(claim.captureCents)}` };
  },
};
