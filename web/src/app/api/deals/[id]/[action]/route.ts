import { z } from "zod";
import * as flows from "@/lib/server/flows";
import { issueToken, publicDeal, requireParty, viewerOf } from "@/lib/server/auth";
import { getDeal, HttpError } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";
import type { Deal } from "@/lib/types";

const Role = z.enum(["buyer", "seller"]);
const Photo = z.string().startsWith("data:image/").max(4_000_000);
const asBuyer = (deal: Deal) => issueToken(deal, "buyer");

// Each action states who may run it. The role always comes from the caller's cookie, not the body;
// where a body names a role (respond, cancel) the caller must actually hold it.
const actions: Record<string, (deal: Deal, body: unknown) => Promise<unknown>> = {
  // Anyone with the link may pay; paying is what makes them the buyer.
  pay: (d) => flows.startPayment(d.id),
  "confirm-payment": (d, b) => flows.confirmPayment(d.id, z.object({ orderId: z.string().min(5) }).parse(b).orderId, asBuyer),
  "test-card": (d) => flows.fundWithTestCard(d.id, asBuyer),
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
    const result = await run(deal, body);
    // Flows return the full deal; only ever send the public view back.
    if (result && typeof result === "object" && "events" in result) {
      const fresh = (await getDeal(id))!;
      return publicDeal(fresh, await viewerOf(fresh));
    }
    return result;
  });
}
