import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { refundFor } from "../refund";
import type { Deal } from "../types";
import { usd } from "../types";
import { median, partComps, searchComps } from "./channel3";
import { labelMatches, readLabel, reviewClaim } from "./checks";
import { HttpError, log, saveDeal, withDeal } from "./deals";
import { runNegotiation, startNegotiation } from "./negotiate";
import { adoptPayPalEmail } from "./notify";
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

// Once money is captured, the amount is final: no new claim can change it and the hold can't be voided.
// Only the settlement that captured it may finish (see settle).
function notCaptured(deal: Deal) {
  if (deal.paypal.captureId) throw new HttpError(409, "Payment is already being settled. Refresh to see the latest.");
}

// Buyer clicked the PayPal button: create an AUTHORIZE order for the deal.
const CHECKOUT_WINDOW_MS = 10 * 60_000;

// A backed offer holds the buyer's max; it only makes sense below the asking price and on a deal that takes offers.
function offerAmount(deal: Deal, offerCents?: number) {
  if (offerCents == null) return undefined;
  if (deal.floorCents == null) throw new HttpError(400, "This seller isn't taking offers.");
  if (offerCents >= deal.priceCents) throw new HttpError(400, `That's at or above the asking price. Just pay ${usd(deal.priceCents)}.`);
  if (offerCents < deal.priceCents * 0.3) throw new HttpError(400, "That offer is too low to send. Try something closer to the asking price.");
  return Math.round(offerCents / 100) * 100;
}

// One browser owns checkout for 10 minutes from when it FIRST opened it. Reopening keeps the
// original window (it can't be extended), so nobody can lock a deal indefinitely.
export const startPayment = (
  id: string,
  browser: { ownsCheckout: (deal: Deal) => Promise<boolean>; claimCheckout: (deal: Deal) => Promise<void> },
  offerCents?: number,
) =>
  withDeal(id, async (deal) => {
    expect(deal, "AWAITING_PAYMENT");
    const started = deal.paypal.payStartedAt ? Date.parse(deal.paypal.payStartedAt) : 0;
    const pending = Date.now() - started < CHECKOUT_WINDOW_MS;
    const mine = pending && (await browser.ownsCheckout(deal));
    if (pending && !mine) throw new HttpError(409, "Someone is already paying for this deal. Try again in a few minutes.");
    const offer = offerAmount(deal, offerCents);
    const order = await pp.createHoldOrder(deal.id, deal.title, offer ?? deal.priceCents);
    deal.paypal.orderId = order.id;
    deal.pendingOfferCents = offer;
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
  // A new hold means a new buyer: nothing of a previous buyer (a released offer) carries over.
  deal.buyer = undefined;
  if (deal.contacts?.buyer) deal.contacts = { ...deal.contacts, buyer: undefined };
  // Paid by logging in to PayPal: link the deal to that account, so signing in with it later finds the deal.
  if (hold.buyer) deal.buyer = { ...hold.buyer, verified: false };
  // PayPal checkout's email is the buyer's PayPal-verified address; updates go there unless they choose another.
  if (hold.buyer) adoptPayPalEmail(deal, "buyer", hold.buyerEmail);
  deal.shipTo = hold.shipTo ? { name: hold.shipTo.name, line: addressLine(hold.shipTo.address), address: hold.shipTo.address } : undefined;
  const now = new Date().toISOString();
  deal.clock = { heldAt: now, authorizedAt: now };
  // A backed offer goes to the agents first; its amount is the buyer's secret, so the log never says it.
  if (deal.pendingOfferCents != null) {
    log(deal, "paypal", "The buyer's offer is backed by a PayPal hold. Nothing has been charged yet.", hold.authorizationId);
    startNegotiation(deal);
    return;
  }
  deal.status = "HELD";
  log(deal, "paypal", `${usd(deal.priceCents)} is held by PayPal. Nothing has been charged yet.`, hold.authorizationId);
}

const kickOff = (deal: Deal) => {
  if (deal.status === "NEGOTIATING") runNegotiation(deal.id);
  return deal;
};

// becomeBuyer runs inside the deal lock, so exactly one browser ends up holding the buyer credential.
type BecomeBuyer = (deal: Deal) => Promise<void>;

export const confirmPayment = (id: string, orderId: string, becomeBuyer: BecomeBuyer) =>
  withDeal(id, async (deal) => {
    expect(deal, "AWAITING_PAYMENT");
    if (deal.paypal.orderId !== orderId) throw new HttpError(400, "That payment belongs to a different deal.");
    const order = await pp.authorizeOrder(orderId);
    // The seller's own PayPal account can't fund their own deal: release the hold straight away.
    const payer = order.payer?.payer_id;
    if (payer && deal.seller && payer === deal.seller.payerId) {
      const auth = pp.holdFrom(order).authorizationId;
      if (auth) await pp.voidHold(auth).catch(() => {});
      throw new HttpError(400, "That's the seller's own PayPal account. A deal has to be paid by someone else.");
    }
    recordHold(deal, order);
    await becomeBuyer(deal);
    return deal;
  }).then(kickOff);

// Judge mode: fund with PayPal's sandbox test card so the flow runs without a login.
export const fundWithTestCard = (id: string, becomeBuyer: BecomeBuyer, offerCents?: number) =>
  withDeal(id, async (deal) => {
    expect(deal, "AWAITING_PAYMENT");
    const offer = offerAmount(deal, offerCents);
    deal.pendingOfferCents = offer;
    recordHold(deal, await pp.createTestCardHold(deal.id, deal.title, offer ?? deal.priceCents));
    await becomeBuyer(deal);
    return deal;
  }).then(kickOff);

export const ship = (id: string, input: { label?: string; carrier: string; trackingNumber: string }) =>
  withDeal(id, async (deal) => {
    expect(deal, "HELD");
    // An in-person deal is only ever completed with the buyer's handover code.
    if (deal.handoff === "meet") throw new HttpError(400, "This deal is handed over in person, not shipped.");
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
    deal.clock = { ...deal.clock, shippedAt: new Date().toISOString() };
    log(deal, "seller", `Shipped with ${deal.shipment.carrier}, tracking ${deal.shipment.trackingNumber}.`);
    return { blocked: false, labelCheck };
  });

// 1, 2, 4, 8 … minutes, capped at an hour.
export const payoutBackoff = (attempts: number) => Math.min(60, 2 ** (attempts - 1)) * 60_000;

// Capture, attach tracking, pay the seller. Resumable: each finished step is recorded and saved, so a
// retry after a failure (say, the payout) picks up where it stopped instead of capturing twice.
export async function settle(deal: Deal, captureCents: number, note: string) {
  const { paypal } = deal;
  if (!paypal.authorizationId || !paypal.orderId) throw new HttpError(409, "There's no PayPal hold on this deal.");
  // Resuming is only allowed for the same amount; a different outcome can't reuse an existing capture.
  if (paypal.captureId && paypal.capturedCents !== captureCents) {
    throw new HttpError(409, "This payment was already captured for a different amount. Refresh to see the latest.");
  }

  if (!paypal.captureId) {
    const capture = await pp.captureHold(paypal.authorizationId, captureCents, `HS-${deal.id}`, note);
    const b = capture.seller_receivable_breakdown;
    paypal.captureId = capture.id;
    paypal.capturedCents = dollars(b?.gross_amount.value) || captureCents;
    paypal.feeCents = dollars(b?.paypal_fee?.value);
    paypal.netCents = dollars(b?.net_amount.value) || captureCents;
    const released = deal.priceCents - captureCents;
    log(deal, "paypal", released > 0 ? `Captured ${usd(captureCents)}. The other ${usd(released)} went back to the buyer automatically.` : `Captured ${usd(captureCents)}.`, capture.id);
    await saveDeal(deal); // money moved: record it before anything else can fail
  }

  // Tracking can only attach to a capture, so it goes on now.
  if (deal.shipment?.trackingNumber && !paypal.trackingAttached) {
    await pp.addTracking(paypal.orderId, paypal.captureId, deal.shipment.trackingNumber, deal.shipment.carrier).then(
      () => log(deal, "paypal", "Tracking attached to the payment for Seller Protection."),
      () => log(deal, "handshake", "Couldn't attach tracking to PayPal; the payout continues."),
    );
    paypal.trackingAttached = true;
  }

  if (!paypal.payoutBatchId) {
    const net = paypal.netCents!;
    const payee: pp.Payee = deal.seller ? { type: "PAYER_ID", payerId: deal.seller.payerId } : { type: "EMAIL", email: deal.sellerEmail };
    let payout: Awaited<ReturnType<typeof pp.payoutSeller>>;
    try {
      payout = await pp.payoutSeller(deal.id, payee, net, `Payment for ${deal.title}`, paypal.payoutRefusals ?? 0);
    } catch (e) {
      // A 4xx is PayPal's definite "no": nothing was created, so the next try may use a new key.
      // Anything else (timeout, 5xx) keeps the key, in case the payout went through after all.
      if (e instanceof pp.PayPalError && e.status >= 400 && e.status < 500) paypal.payoutRefusals = (paypal.payoutRefusals ?? 0) + 1;
      // The money is captured and recorded; only the payout is left. Queue it rather than failing the
      // buyer's confirmation: the timer retries with backoff until PayPal accepts it.
      const attempts = (paypal.payoutAttempts ?? 0) + 1;
      paypal.payoutAttempts = attempts;
      paypal.payoutRetryAt = new Date(Date.now() + payoutBackoff(attempts)).toISOString();
      if (attempts === 1) log(deal, "handshake", `Payment captured. PayPal didn't accept the payout to ${deal.sellerName} yet, so Handshake will keep retrying it automatically.`);
      console.error("payout queued", deal.id, attempts, e instanceof pp.PayPalError ? `${e.issue} ${e.debugId}` : e);
      await saveDeal(deal);
      return;
    }
    paypal.payoutRetryAt = undefined;
    paypal.payoutBatchId = payout.batch_header.payout_batch_id;
    paypal.payoutCents = net;
    const where = deal.seller ? " into their own PayPal account" : "";
    log(deal, "paypal", `Paid ${deal.sellerName} ${usd(net)}${where} after PayPal's ${usd(paypal.feeCents ?? 0)} fee.`, paypal.payoutBatchId);
  }
  deal.status = "SETTLED";
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
    notCaptured(deal);
    const review = await reviewClaim({ listing: `${deal.title}, ${deal.condition}`, checklist: deal.checklist, note: input.note, photo: input.photo, listingPhoto: deal.photo });

    let partPriceCents: number | null = null;
    let partComp: NonNullable<Deal["claim"]>["partComp"];
    if (review.verdict !== "MATCHES_LISTING" && review.replacement_query) {
      const comps = partComps(review.damaged_part, await searchComps(review.replacement_query).catch(() => []), deal.priceCents);
      if (comps.length) {
        partPriceCents = median(comps.map((c) => c.priceCents));
        // Show the listing closest to the price we used, so "see one" backs up the number.
        const c = [...comps].sort((x, y) => Math.abs(x.priceCents - partPriceCents!) - Math.abs(y.priceCents - partPriceCents!))[0];
        partComp = { title: c.title, url: c.url, merchant: c.merchant };
      }
    }

    const verdict = review.photo_shows_item ? review.verdict : "MATCHES_LISTING";
    const { refundCents, captureCents } = refundFor(verdict, partPriceCents, deal.priceCents);

    deal.claim = {
      photo: input.photo,
      note: input.note,
      finding: review.photo_shows_item ? review.finding : "The photo doesn't appear to show the item from this deal.",
      damagedPart: review.damaged_part,
      verdict,
      partQuery: review.replacement_query,
      partPriceCents,
      partComp,
      refundCents,
      captureCents,
      buyerAccepted: false,
      sellerAccepted: false,
    };
    deal.status = "CLAIM_OPEN";
    deal.clock = { ...deal.clock, claimAt: new Date().toISOString() };
    log(deal, "buyer", "Reported a problem with a delivery photo.");
    log(deal, "handshake", deal.claim.refundCents ? `Proposed a ${usd(deal.claim.refundCents)} partial refund based on the replacement cost of the ${deal.claim.damagedPart}.` : "Found no difference from the listing. Proposed releasing full payment.");
    return deal;
  });

export const respondToClaim = (id: string, role: "buyer" | "seller", accept: boolean) =>
  withDeal(id, async (deal) => {
    expect(deal, "CLAIM_OPEN");
    const claim = deal.claim!;
    if (!accept) {
      claim.declinedBy ??= role;
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

// ---------- In-person handover ----------
// At a meetup the buyer checks the item, then confirms with a code only the seller's screen shows: a QR
// (scanned with the buyer's phone camera) or the same handover as 6 digits. PayPal captures and pays the
// seller there and then, so the seller sees "Paid" before letting go of the item. The code is short-lived
// and single-use, wrong guesses are capped per code, and only the buyer who paid can use it.
export const HANDOVER_MS = 5 * 60_000;
export const HANDOVER_TRIES = 5;
const handoverHash = (dealId: string, secret: string) => createHash("sha256").update(`${dealId}:handover:${secret}`).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function expectMeetup(deal: Deal) {
  expect(deal, "HELD");
  if (deal.handoff !== "meet") throw new HttpError(400, "This deal is shipped, not handed over in person.");
}

// The buyer already confirmed and PayPal captured, but the payout didn't finish (a PayPal hiccup).
// Either party's next step finishes it: settle skips the capture it already recorded, so money never
// moves twice, and the amount can't change.
const capturedAtMeetup = (deal: Deal) => !!deal.paypal.captureId;
const finishHandover = (deal: Deal) => settle(deal, deal.priceCents, "Handshake: handed over in person");

// Seller: show a fresh handover code. Each new code replaces the last one.
// A fresh code, or, after an interrupted payout, the finished settlement.
export type HandoverStart = { code: string; token: string; expiresAt: string } | { settled: true };

export const startHandover = (id: string) =>
  withDeal(id, async (deal): Promise<HandoverStart> => {
    expectMeetup(deal);
    if (capturedAtMeetup(deal)) {
      await finishHandover(deal);
      return { settled: true };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const token = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + HANDOVER_MS).toISOString();
    deal.meetup = { codeHash: handoverHash(deal.id, code), tokenHash: handoverHash(deal.id, token), expiresAt, attempts: 0 };
    if (!deal.events.some((e) => e.actor === "seller" && e.text.startsWith("Showed the handover code"))) {
      log(deal, "seller", "Showed the handover code at the meetup.");
    }
    return { code, token, expiresAt };
  });

// Buyer: confirm the handover with the scanned token or the typed code. Captures the full price.
export const confirmHandover = (id: string, input: { code?: string; token?: string }) =>
  withDeal(id, async (deal) => {
    expectMeetup(deal);
    if (capturedAtMeetup(deal)) {
      await finishHandover(deal);
      return deal;
    }
    const m = deal.meetup;
    if (!m) throw new HttpError(409, `Ask ${deal.sellerName} to show the handover code first.`);
    if (Date.parse(m.expiresAt) <= Date.now()) throw new HttpError(409, `That code has expired. Ask ${deal.sellerName} to show a new one.`);
    if (m.attempts >= HANDOVER_TRIES) throw new HttpError(429, `Too many wrong codes. Ask ${deal.sellerName} to show a new one.`);
    const given = input.token ? handoverHash(deal.id, input.token) : input.code ? handoverHash(deal.id, input.code) : "";
    const ok = !!given && (sameHash(given, m.tokenHash) || sameHash(given, m.codeHash));
    if (!ok) {
      // The lock only saves on success, so record the wrong guess before refusing it.
      m.attempts += 1;
      await saveDeal(deal);
      const left = HANDOVER_TRIES - m.attempts;
      throw new HttpError(400, left > 0 ? `That code doesn't match. ${left} ${left === 1 ? "try" : "tries"} left.` : `That code doesn't match. Ask ${deal.sellerName} to show a new one.`);
    }
    deal.meetup = undefined;
    log(deal, "buyer", `Checked the item in person and confirmed the handover with ${deal.sellerName}'s code.`);
    await finishHandover(deal);
    return deal;
  });

export const cancel = (id: string, role: "buyer" | "seller") =>
  withDeal(id, async (deal) => {
    expect(deal, "HELD", "AWAITING_PAYMENT", "NEGOTIATING");
    notCaptured(deal);
    if (deal.paypal.authorizationId) {
      await pp.voidHold(deal.paypal.authorizationId);
      log(deal, "paypal", "Released the full hold. The buyer paid nothing.");
    }
    if (deal.negotiation?.status === "RUNNING") deal.negotiation.status = "NO_DEAL";
    deal.meetup = undefined;
    deal.status = "RELEASED";
    log(deal, role, "Cancelled the deal before shipping.");
    return deal;
  });
