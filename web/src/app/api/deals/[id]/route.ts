import { publicDeal, viewerOf } from "@/lib/server/auth";
import { getDeal, HttpError } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/deals/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const deal = await getDeal(id);
    if (!deal) throw new HttpError(404, "This deal doesn't exist.");
    return publicDeal(deal, await viewerOf(deal));
  });
}
