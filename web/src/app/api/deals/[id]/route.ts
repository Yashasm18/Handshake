import { publicDeal, viewerOf } from "@/lib/server/auth";
import { getDeal, HttpError } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";
import { resumeIfStalled } from "@/lib/server/negotiate";
import { dueNow } from "@/lib/deadlines";
import { runTimer, timerScale } from "@/lib/server/timers";

export async function GET(_req: Request, ctx: RouteContext<"/api/deals/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const deal = await getDeal(id);
    if (!deal) throw new HttpError(404, "This deal doesn't exist.");
    resumeIfStalled(deal);
    // On Render the timer workflow enforces deadlines. Without it (local dev), looking at a deal does.
    if (!process.env.TIMERS_SECRET) {
      for (const t of dueNow(deal, Date.now(), timerScale())) runTimer(deal.id, t.kind).catch((e) => console.error("timer", deal.id, t.kind, e));
    }
    return publicDeal(deal, await viewerOf(deal));
  });
}
