import "server-only";
import type { Deal } from "../types";
import { usd } from "../types";
import { labelMatches, marketFor, readLabel, reviewClaim } from "./checks";
import { HttpError, log, withDeal } from "./deals";
import * as pp from "./paypal";

const dollars = (v?: string) => Math.round(Number(v ?? 0) * 100);
const addressLine = (a?: pp.Address) =>
  a ? [a.address_line_1, a.admin_area_2, [a.admin_area_1, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";

// PayPal's tracking API wants carrier codes, while labels say things like "UPS GROUND" or "FedEx Express".
function carrierCode(raw: string) {
  const s = raw.toUpperCase();
  return ["USPS", "UPS", "FEDEX", "DHL"].find((c) => s.replace(/\s/g, "").includes(c)) ?? "OTHER";
}

function expect(deal: Deal, ...statuses: Deal["status"][]) {
  if (!statuses.includes(deal.status)) throw new HttpError(409, "This step isn't available right now. Refresh to see the latest.");
}

// Buyer clicked the PayPal button: create an AUTHORIZE order for the deal.
const CHECKOUT_WINDOW_MS = 10 * 60_000;

// One browser owns checkout for 10 minutes from when it FIRST opened it. Reopening keeps the
// original window (it can't be extended), so nobody can lock a deal indefinitely.
export const startPayment = (
  id: string,
  browser: { ownsCheckout: (deal: Deal) => Promise<boolean>; claimCheckout: (deal: Deal) => Promise<void> },
) =>
  withDeal(id, async (deal) => {
    expect(deal, "AWAITING_PAYMENT");
    const started = deal.paypal.payStartedAt ? Date.parse(deal.paypal.payStartedAt) : 0;
    const pending = Date.now() - started < CHECKOUT_WINDOW_MS;
    const mine = pending && (await browser.ownsCheckout(deal));
    if (pending && !mine) throw new HttpError(409, "Someone is already paying for this deal. Try again in a few minutes.");
    const order = await pp.createHoldOrder(deal.id, deal.title, deal.priceCents);
    deal.paypal.orderId = order.id;
    if (!mine) {
      deal.paypal.payStartedAt = new Date().toISOString();
      await browser.claimCheckout(deal);
    }
    return { orderId: order.id };
  });

function recordHold(deal: Deal, order: Awaited<ReturnType<typeof pp.authorizeOrder>>) {
  const hold = pp.holdFrom(order);
  if (!hold.authorizationId) throw new HttpError(502, "PayPal didn't confirm the hold. Try again.");
  deal.paypal.orderId = order.id;
  deal.paypal.authorizationId = hold.authorizationId;
  deal.paypal.buyerEmail = hold.buyerEmail;
  deal.shipTo = hold.shipTo ? { name: hold.shipTo.name, line: addressLine(hold.shipTo.address), address: hold.shipTo.address } : undefined;
  deal.status = "HELD";
  log(deal, "paypal", `${usd(deal.priceCents)} is held by PayPal. Nothing has been charged yet.`, hold.authorizationId);
}

// becomeBuyer runs inside the deal lock, so exactly one browser ends up holding the buyer credential.
type BecomeBuyer = (deal: Deal) => Promise<void>;

export const confirmPayment = (id: string, orderId: string, becomeBuyer: BecomeBuyer) =>
  withDeal(id, async (deal) => {
    expect(deal, "AWAITING_PAYMENT");
    if (deal.paypal.orderId !== orderId) throw new HttpError(400, "That payment belongs to a different deal.");
    recordHold(deal, await pp.authorizeOrder(orderId));
    await becomeBuyer(deal);
    return deal;
  });

// Judge mode: fund with PayPal's sandbox test card so the flow runs without a login.
export const fundWithTestCard = (id: string, becomeBuyer: BecomeBuyer) =>
  withDeal(id, async (deal) => {
    expect(deal, "AWAITING_PAYMENT");
    recordHold(deal, await pp.createTestCardHold(deal.id, deal.title, deal.priceCents));
    await becomeBuyer(deal);
    return deal;
  });

export const ship = (id: string, input: { label?: string; carrier: string; trackingNumber: string }) =>
  withDeal(id, async (deal) => {
    expect(deal, "HELD");
    let labelCheck: NonNullable<Deal["shipment"]>["labelCheck"] = null;
    if (input.label) {
      const label = await readLabel(input.label);
      const result = labelMatches(label, deal.shipTo?.address);
      labelCheck = { match: result.match, read: [label.recipient_name, label.street, label.city, label.state, label.postal_code].filter(Boolean).join(", "), reason: result.reason };
      if (!result.match) {
        log(deal, "handshake", "Stopped a shipment to an address that isn't the buyer's PayPal-verified address.");
        deal.shipment = { carrier: input.carrier || label.carrier, trackingNumber: input.trackingNumber || label.tracking_number, labelCheck };
        return { blocked: true, labelCheck };
      }
      input.carrier ||= label.carrier;
      input.trackingNumber ||= label.tracking_number;
    }
    if (!input.trackingNumber) throw new HttpError(400, "Add a tracking number or a photo of the label.");
    deal.shipment = { carrier: carrierCode(input.carrier), trackingNumber: input.trackingNumber.replace(/\s/g, ""), labelCheck };
    deal.status = "SHIPPED";
    log(deal, "seller", `Shipped with ${deal.shipment.carrier}, tracking ${deal.shipment.trackingNumber}.`);
    return { blocked: false, labelCheck };
  });

async function settle(deal: Deal, captureCents: number, note: string) {
  const { paypal } = deal;
  if (!paypal.authorizationId || !paypal.orderId) throw new HttpError(409, "There's no PayPal hold on this deal.");
  const capture = await pp.captureHold(paypal.authorizationId, captureCents, `HS-${deal.id}`, note);
  const b = capture.seller_receivable_breakdown;
  paypal.captureId = capture.id;
  paypal.capturedCents = dollars(b?.gross_amount.value) || captureCents;
  paypal.feeCents = dollars(b?.paypal_fee?.value);
  paypal.netCents = dollars(b?.net_amount.value) || captureCents;
  const released = deal.priceCents - captureCents;
  log(deal, "paypal", released > 0 ? `Captured ${usd(captureCents)}. The other ${usd(released)} went back to the buyer automatically.` : `Captured ${usd(captureCents)}.`, capture.id);

  // Tracking can only attach to a capture, so it goes on now.
  if (deal.shipment?.trackingNumber) {
    await pp.addTracking(paypal.orderId, capture.id, deal.shipment.trackingNumber, deal.shipment.carrier).then(
      () => log(deal, "paypal", "Tracking attached to the payment for Seller Protection."),
      () => log(deal, "handshake", "Couldn't attach tracking to PayPal; the payout continues."),
    );
  }

  const payout = await pp.payoutSeller(deal.id, deal.sellerEmail, paypal.netCents, `Payment for ${deal.title}`);
  paypal.payoutBatchId = payout.batch_header.payout_batch_id;
  paypal.payoutCents = paypal.netCents;
  deal.status = "SETTLED";
  log(deal, "paypal", `Paid ${deal.sellerName} ${usd(paypal.netCents)} after PayPal's ${usd(paypal.feeCents ?? 0)} fee.`, paypal.payoutBatchId);
}

export const confirmDelivery = (id: string) =>
  withDeal(id, async (deal) => {
    expect(deal, "SHIPPED");
    log(deal, "buyer", "Confirmed the item arrived as described.");
    await settle(deal, deal.priceCents, "Handshake: delivered as described");
    return deal;
  });

export const openClaim = (id: string, input: { note: string; photo: string }) =>
  withDeal(id, async (deal) => {
    expect(deal, "SHIPPED");
    const review = await reviewClaim({ listing: `${deal.title}, ${deal.condition}`, checklist: deal.checklist, note: input.note, photo: input.photo, listingPhoto: deal.photo });

    let partPriceCents: number | null = null;
    let partComp: NonNullable<Deal["claim"]>["partComp"];
    if (review.verdict !== "MATCHES_LISTING" && review.replacement_query) {
      const m = await marketFor(review.replacement_query, null).catch(() => null);
      if (m) {
        partPriceCents = m.medianCents;
        const c = m.comps[0];
        partComp = c && { title: c.title, url: c.url, merchant: c.merchant };
      }
    }

    // Money math lives here, in code: grounded in the real part price and capped per verdict.
    const cap = review.verdict === "NOT_AS_DESCRIBED" ? 0.6 : review.verdict === "MINOR_ISSUE" ? 0.35 : 0;
    const fallback = review.verdict === "NOT_AS_DESCRIBED" ? 0.3 : 0.15;
    const raw = review.verdict === "MATCHES_LISTING" ? 0 : (partPriceCents ?? Math.round(deal.priceCents * fallback));
    const refundCents = Math.min(raw, Math.round(deal.priceCents * cap));

    deal.claim = {
      photo: input.photo,
      note: input.note,
      finding: review.photo_shows_item ? review.finding : "The photo doesn't appear to show the item from this deal.",
      damagedPart: review.damaged_part,
      verdict: review.photo_shows_item ? review.verdict : "MATCHES_LISTING",
      partQuery: review.replacement_query,
      partPriceCents,
      partComp,
      refundCents: review.photo_shows_item ? refundCents : 0,
      captureCents: deal.priceCents - (review.photo_shows_item ? refundCents : 0),
      buyerAccepted: false,
      sellerAccepted: false,
    };
    deal.status = "CLAIM_OPEN";
    log(deal, "buyer", "Reported a problem with a delivery photo.");
    log(deal, "handshake", deal.claim.refundCents ? `Proposed a ${usd(deal.claim.refundCents)} partial refund based on the replacement cost of the ${deal.claim.damagedPart}.` : "Found no difference from the listing. Proposed releasing full payment.");
    return deal;
  });

export const respondToClaim = (id: string, role: "buyer" | "seller", accept: boolean) =>
  withDeal(id, async (deal) => {
    expect(deal, "CLAIM_OPEN");
    const claim = deal.claim!;
    if (!accept) {
      log(deal, role, "Declined the proposal. The case can go to PayPal Resolution Center.");
      return deal;
    }
    if (role === "buyer") claim.buyerAccepted = true;
    else claim.sellerAccepted = true;
    log(deal, role, `Accepted the ${claim.refundCents ? usd(claim.refundCents) + " partial refund" : "outcome"}.`);
    if (claim.buyerAccepted && claim.sellerAccepted) {
      await settle(deal, claim.captureCents, claim.refundCents ? `Handshake settlement: ${usd(claim.refundCents)} released for ${claim.damagedPart}` : "Handshake: delivered as described");
    }
    return deal;
  });

export const cancel = (id: string, role: "buyer" | "seller") =>
  withDeal(id, async (deal) => {
    expect(deal, "HELD", "AWAITING_PAYMENT");
    if (deal.paypal.authorizationId) {
      await pp.voidHold(deal.paypal.authorizationId);
      log(deal, "paypal", `Released the full ${usd(deal.priceCents)} hold. The buyer paid nothing.`);
    }
    deal.status = "RELEASED";
    log(deal, role, "Cancelled the deal before shipping.");
    return deal;
  });
