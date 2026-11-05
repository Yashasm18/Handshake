import { z } from "zod";
import * as flows from "@/lib/server/flows";
import { holdsPayNonce, issuePayNonce, issueToken, publicDeal, refuseOwnDeal, requireParty, requirePayNonce, viewerOf } from "@/lib/server/auth";
import { currentAccount } from "@/lib/server/session";
import { adoptPayPalEmail } from "@/lib/server/notify";
import { setContactEmail, setMuted } from "@/lib/server/contacts";
import { visitorOf, windowLimiter } from "@/lib/server/visitor";
import { getDeal, HttpError } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";
import type { Deal } from "@/lib/types";

const Role = z.enum(["buyer", "seller"]);
const emailLimiter = windowLimiter(10, 60 * 60_000);
const Photo = z.string().startsWith("data:image/").max(4_000_000);
// The paying browser gets the buyer cookie. A buyer signed in with PayPal is also linked by account,
// unless PayPal checkout already linked the account that actually paid.
const asBuyer = async (deal: Deal) => {
  await issueToken(deal, "buyer");
  const a = await currentAccount();
  if (a && !deal.buyer) deal.buyer = { payerId: a.payerId, name: a.name, email: a.email, verified: a.verified };
  if (a) adoptPayPalEmail(deal, "buyer", a.email);
};
const Offer = z.object({ offerCents: z.number().int().min(100).max(1_000_000).optional() });

// The no-login test card exists for judging on the sandbox only.
const testCardEnabled = () =>
  process.env.ENABLE_TEST_CARD === "true" || (process.env.ENABLE_TEST_CARD !== "false" && (process.env.PAYPAL_API_BASE ?? "").includes("sandbox"));

// Each action states who may run it. The role always comes from the caller's cookie, not the body;
// where a body names a role (respond, cancel) the caller must actually hold it.
const actions: Record<string, (deal: Deal, body: unknown, req: Request) => Promise<unknown>> = {
  // Anyone with the link may start paying; the browser that starts checkout is the only one that can finish it.
  // offerCents makes it a backed offer: the hold is at the buyer's max and the agents negotiate the price.
  pay: async (d, b) => {
    await refuseOwnDeal(d);
    return flows.startPayment(d.id, { ownsCheckout: holdsPayNonce, claimCheckout: issuePayNonce }, Offer.parse(b).offerCents);
  },
  "confirm-payment": async (d, b) => {
    await requirePayNonce(d);
    return flows.confirmPayment(d.id, z.object({ orderId: z.string().min(5) }).parse(b).orderId, asBuyer);
  },
  "test-card": async (d, b) => {
    if (!testCardEnabled()) throw new HttpError(404, "Unknown action.");
    await refuseOwnDeal(d);
    return flows.fundWithTestCard(d.id, asBuyer, Offer.parse(b).offerCents);
  },
  ship: async (d, b) => {
    await requireParty(d, "seller");
    return flows.ship(d.id, z.object({ label: Photo.optional(), carrier: z.string().max(30).default(""), trackingNumber: z.string().max(60).default("") }).parse(b));
  },
  deliver: async (d) => {
    await requireParty(d, "buyer");
    return flows.confirmDelivery(d.id);
  },
  // A claim needs a delivery photo: words alone can't move money.
  claim: async (d, b) => {
    await requireParty(d, "buyer");
    return flows.openClaim(d.id, z.object({ note: z.string().min(3).max(1000), photo: Photo }).parse(b));
  },
  respond: async (d, b) => {
    const { role, accept } = z.object({ role: Role, accept: z.boolean() }).parse(b);
    await requireParty(d, role);
    return flows.respondToClaim(d.id, role, accept);
  },
  // In-person handover: only the seller can show a code, only the buyer who paid can use it.
  "meet-code": async (d) => {
    await requireParty(d, "seller");
    return flows.startHandover(d.id);
  },
  "meet-confirm": async (d, b) => {
    await requireParty(d, "buyer");
    const input = z.object({ code: z.string().regex(/^\d{6}$/).optional(), token: z.string().min(16).max(64).optional() }).refine((x) => x.code || x.token).parse(b);
    return flows.confirmHandover(d.id, input);
  },
  // Email updates: each side manages only its own address.
  email: async (d, b, req) => {
    const { role, email } = z.object({ role: Role, email: z.string().max(254) }).parse(b);
    await requireParty(d, role);
    if (!emailLimiter.take(visitorOf(req))) throw new HttpError(429, "Too many email changes. Try again in a while.");
    return setContactEmail(d.id, role, email);
  },
  "email-mute": async (d, b) => {
    const { role, muted } = z.object({ role: Role, muted: z.boolean() }).parse(b);
    await requireParty(d, role);
    return setMuted(d.id, role, muted);
  },
  cancel: async (d, b) => {
    const { role } = z.object({ role: Role }).parse(b);
    await requireParty(d, role);
    return flows.cancel(d.id, role);
  },
};

export async function POST(req: Request, ctx: RouteContext<"/api/deals/[id]/[action]">) {
  return handle(async () => {
    const { id, action } = await ctx.params;
    const run = actions[action];
    if (!run) throw new HttpError(404, "Unknown action.");
    const deal = await getDeal(id);
    if (!deal) throw new HttpError(404, "This deal doesn't exist.");
    const body = await req.json().catch(() => ({}));
    const result = await run(deal, body, req);
    // Flows return the full deal; only ever send the public view back.
    if (result && typeof result === "object" && "events" in result) {
      const fresh = (await getDeal(id))!;
      return publicDeal(fresh, await viewerOf(fresh));
    }
    return result;
  });
}
