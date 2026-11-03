import "server-only";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import type { Deal, DealView, Viewer } from "../types";
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
  const rest: Partial<Deal> & Omit<Deal, "sellerToken" | "buyerToken" | "sellerEmail"> = { ...deal };
  delete rest.sellerToken;
  delete rest.buyerToken;
  delete rest.sellerEmail;
  const party = viewer.seller || viewer.buyer;
  return {
    ...rest,
    paypal: { ...rest.paypal, buyerEmail: party ? rest.paypal.buyerEmail : undefined },
    shipTo: party ? rest.shipTo : undefined,
    shipment: party ? rest.shipment : rest.shipment && { ...rest.shipment, labelCheck: null },
    claim: party ? rest.claim : rest.claim && { ...rest.claim, photo: undefined },
    viewer,
  };
}
