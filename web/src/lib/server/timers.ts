import "server-only";
import { DAY, RULES, dueNow, type DeadlineKind } from "../deadlines";
import type { Deal } from "../types";
import { usd } from "../types";
import { allDeals, log, withDeal } from "./deals";
import { settle } from "./flows";
import { PayPalError, reauthorizeHold, voidHold } from "./paypal";

// TIMER_SCALE shrinks every deadline for demos (e.g. 0.0007 ≈ a day per minute). Real deals use 1.
export const timerScale = () => {
  const v = Number(process.env.TIMER_SCALE);
  return v > 0 && v <= 1 ? v : 1;
};

// "3 days", or "3 minutes (demo speed)" when the clock is scaled.
function span(kind: DeadlineKind) {
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
    logOnce(deal, `The buyer didn't confirm or report a problem within ${span("AUTO_RELEASE")} of a verified shipment, so payment was released automatically.`);
    await settle(deal, deal.priceCents, "Handshake: released after the inspection window");
    return { outcome: "done", detail: `Captured ${usd(deal.priceCents)}` };
  },

  async CLAIM_SETTLE(deal) {
    const claim = deal.claim!;
    logOnce(deal, `Nobody declined the proposal within ${span("CLAIM_SETTLE")}, so it settled automatically.`);
    await settle(deal, claim.captureCents, claim.refundCents ? `Handshake settlement: ${usd(claim.refundCents)} released for ${claim.damagedPart}` : "Handshake: delivered as described");
    return { outcome: "done", detail: `Captured ${usd(claim.captureCents)}` };
  },
};
