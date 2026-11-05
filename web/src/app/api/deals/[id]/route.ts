import { publicDeal, viewerOf } from "@/lib/server/auth";
import { getDeal, HttpError } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";
import { resumeIfStalled } from "@/lib/server/negotiate";
import { dueNow } from "@/lib/deadlines";
import { runTimer, timerScale } from "@/lib/server/timers";

// One view-triggered run per deal and kind at a time on this server. The deal page polls every few
// seconds; without this, each poll would wait on the deal's lock and hold a database connection.
const g = globalThis as unknown as { __hsViewRuns?: Set<string> };
const running = (g.__hsViewRuns ??= new Set());
function runOnView(dealId: string, kind: Parameters<typeof runTimer>[1]) {
  const key = `${dealId}:${kind}`;
  if (running.has(key)) return;
  running.add(key);
  runTimer(dealId, kind)
    .catch((e) => console.error("timer", dealId, kind, e))
    .finally(() => running.delete(key));
}

export async function GET(_req: Request, ctx: RouteContext<"/api/deals/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const deal = await getDeal(id);
    if (!deal) throw new HttpError(404, "This deal doesn't exist.");
    resumeIfStalled(deal);
    // On Render the timer workflow enforces deadlines. Without it (local dev), looking at a deal does.
    // A payout PayPal is still processing is the exception: while someone is looking at the deal it is
    // checked as soon as its next check is due, not at the next 5-minute sweep. This only ever reads the
    // payout's status (or re-sends under the recorded key), inside the deal's lock, so it can't pay twice.
    const due = dueNow(deal, Date.now(), timerScale()).filter((t) => !process.env.TIMERS_SECRET || t.kind === "PAYOUT");
    for (const t of due) runOnView(deal.id, t.kind);
    return publicDeal(deal, await viewerOf(deal));
  });
}
