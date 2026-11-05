import "server-only";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { deadlinesFor } from "../deadlines";
import type { Deal, DealView, Viewer } from "../types";
import { timerScale } from "./timers";
import { HttpError, newToken } from "./deals";
import { currentAccount, type Account } from "./session";
import { contactView, notifyEnabled } from "./notify";
import { testMode, trackingEnabled } from "./easypost";
import { publicTracking } from "./tracking";

type Party = "seller" | "buyer";

const cookieName = (party: Party, dealId: string) => `hs_${party[0]}_${dealId}`;

function same(a?: string, b?: string) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// The party is proven by an HttpOnly cookie issued to that browser, or by being signed in with the PayPal
// account linked to that side of the deal. Never by anything in the request body.
export function viewerFor(deal: Deal, cookie: { seller?: string; buyer?: string }, account: Account | null): Viewer {
  const owns = (side?: { payerId: string }) => Boolean(account && side && same(account.payerId, side.payerId));
  return {
    seller: same(cookie.seller, deal.sellerToken) || owns(deal.seller),
    buyer: same(cookie.buyer, deal.buyerToken) || owns(deal.buyer),
  };
}

export async function viewerOf(deal: Deal): Promise<Viewer> {
  const jar = await cookies();
  return viewerFor(deal, { seller: jar.get(cookieName("seller", deal.id))?.value, buyer: jar.get(cookieName("buyer", deal.id))?.value }, await currentAccount());
}

// A seller signed in with PayPal can't also be the buyer of their own deal.
export async function refuseOwnDeal(deal: Deal) {
  const account = await currentAccount();
  if (account && deal.seller && same(account.payerId, deal.seller.payerId)) {
    throw new HttpError(400, "This is your own deal. To try the buyer side, open the link in another browser or sign out first.");
  }
}

export async function requireParty(deal: Deal, party: Party) {
  const v = await viewerOf(deal);
  if (!v[party]) throw new HttpError(403, party === "seller" ? "Only the seller can do this." : "Only the buyer who paid can do this.");
}

const payCookie = (dealId: string) => `hs_pay_${dealId}`;

// Starting checkout pins the payment to this browser; only it can later turn the approval into a hold.
export async function issuePayNonce(deal: Deal) {
  const nonce = newToken();
  deal.paypal.payNonce = nonce;
  (await cookies()).set(payCookie(deal.id), nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 3,
  });
}

export async function holdsPayNonce(deal: Deal) {
  return same((await cookies()).get(payCookie(deal.id))?.value, deal.paypal.payNonce);
}

export async function requirePayNonce(deal: Deal) {
  if (!(await holdsPayNonce(deal))) {
    throw new HttpError(403, "Finish the payment in the same browser you started it in.");
  }
}

export async function issueToken(deal: Deal, party: Party) {
  const token = newToken();
  if (party === "seller") deal.sellerToken = token;
  else deal.buyerToken = token;
  (await cookies()).set(cookieName(party, deal.id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
}

// Strangers holding the link see the item and its status, not who is involved or where it ships.
export function publicDeal(deal: Deal, viewer: Viewer): DealView {
  const rest: Partial<Deal> & Omit<Deal, "sellerToken" | "buyerToken" | "sellerEmail" | "pendingOfferCents" | "meetup" | "seller" | "buyer" | "contacts"> = { ...deal };
  delete rest.contacts;
  delete rest.seller;
  delete rest.buyer;
  delete rest.pendingOfferCents;
  delete rest.meetup;
  delete rest.sellerToken;
  delete rest.buyerToken;
  delete rest.sellerEmail;
  const party = viewer.seller || viewer.buyer;
  // Each side's limit is visible only to that side: the floor to the seller, the max to the buyer.
  // "Clamped" means an offer sits exactly at its owner's limit, so only that owner may see it.
  const negotiation = rest.negotiation && {
    ...rest.negotiation,
    maxCents: viewer.buyer ? rest.negotiation.maxCents : undefined,
    turns: rest.negotiation.turns.map((t) => (viewer[t.by] ? t : { ...t, clamped: undefined })),
  };
  return {
    ...rest,
    floorCents: viewer.seller ? rest.floorCents : undefined,
    acceptsOffers: rest.floorCents != null,
    deadlines: deadlinesFor(deal, timerScale()),
    demoClock: timerScale() < 1,
    negotiation: party ? negotiation : negotiation && { ...negotiation, turns: [] },
    // PayPal ids are only for the two parties; an outsider holding an order id could try to race the buyer.
    paypal: party ? { ...rest.paypal, payNonce: undefined } : {},
    // An in-person deal needs no address: the seller never sees where the buyer lives.
    shipTo: viewer.buyer || (viewer.seller && deal.handoff !== "meet") ? rest.shipTo : undefined,
    // The tracker id stays on the server. Strangers see how far the parcel is, not the number or places.
    shipment: rest.shipment && (party
      ? { ...rest.shipment, tracking: rest.shipment.tracking && { ...rest.shipment.tracking, trackerId: undefined, notified: undefined } }
      : { ...rest.shipment, trackingNumber: "", labelCheck: null, tracking: rest.shipment.tracking && publicTracking(rest.shipment.tracking) }),
    parcels: { tracked: trackingEnabled(), test: testMode() },
    claim: party ? rest.claim : rest.claim && { ...rest.claim, photo: undefined, note: "" },
    // Log entries cite PayPal ids (authorization, capture, payout batch); like the ids above, only the parties see them.
    events: party ? rest.events : rest.events.map((e) => ({ ...e, ref: undefined })),
    viewer,
    sellerPayPal: { signedIn: Boolean(deal.seller), verified: Boolean(deal.seller?.verified) },
    // Each person sees only their own (masked) email settings.
    notify: {
      enabled: notifyEnabled(),
      seller: viewer.seller ? contactView(deal.contacts?.seller) : undefined,
      buyer: viewer.buyer ? contactView(deal.contacts?.buyer) : undefined,
    },
  };
}
