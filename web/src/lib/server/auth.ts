import "server-only";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { deadlinesFor } from "../deadlines";
import type { Deal, DealView, Viewer } from "../types";
import { timerScale } from "./timers";
import { HttpError, newToken } from "./deals";

type Party = "seller" | "buyer";

const cookieName = (party: Party, dealId: string) => `hs_${party[0]}_${dealId}`;

function same(a?: string, b?: string) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// The party is proven by an HttpOnly cookie issued to that browser, never by anything in the request body.
export async function viewerOf(deal: Deal): Promise<Viewer> {
  const jar = await cookies();
  return {
    seller: same(jar.get(cookieName("seller", deal.id))?.value, deal.sellerToken),
    buyer: same(jar.get(cookieName("buyer", deal.id))?.value, deal.buyerToken),
  };
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
  const rest: Partial<Deal> & Omit<Deal, "sellerToken" | "buyerToken" | "sellerEmail" | "pendingOfferCents"> = { ...deal };
  delete rest.pendingOfferCents;
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
    shipTo: party ? rest.shipTo : undefined,
    shipment: party ? rest.shipment : rest.shipment && { ...rest.shipment, labelCheck: null },
    claim: party ? rest.claim : rest.claim && { ...rest.claim, photo: undefined, note: "" },
    // Log entries cite PayPal ids (authorization, capture, payout batch); like the ids above, only the parties see them.
    events: party ? rest.events : rest.events.map((e) => ({ ...e, ref: undefined })),
    viewer,
  };
}
