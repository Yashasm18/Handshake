import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DEADLINE_KINDS } from "@/lib/deadlines";
import { HttpError } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";
import { dueTimers, runTimer } from "@/lib/server/timers";
import { checkAll, recordTimerSweep } from "@/lib/server/status";
import { sendDueReminders } from "@/lib/server/reminders";

// Called only by the Render Workflow that enforces deadlines (see /workflows). A shared secret from
// the Blueprint's env group proves the caller; without TIMERS_SECRET set, these routes don't exist.
function authorize(req: Request) {
  const secret = process.env.TIMERS_SECRET;
  if (!secret) throw new HttpError(404, "Not found.");
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) throw new HttpError(401, "Unauthorized.");
}

export async function GET(req: Request) {
  return handle(async () => {
    authorize(req);
    // Every sweep (every 5 minutes) also refreshes the health checks, so alerts go out even when nobody
    // has /status open. In the background: the sweep itself never waits on it.
    recordTimerSweep();
    checkAll().catch((e) => console.error("status", e));
    // Reminder emails a day before a deadline: in the background too, so they never slow the sweep.
    sendDueReminders().catch((e) => console.error("reminders", e));
    return { now: Date.now(), due: await dueTimers() };
  });
}

const Run = z.object({ dealId: z.string().min(10).max(40), kind: z.enum(DEADLINE_KINDS as [string, ...string[]]).transform((k) => k as (typeof DEADLINE_KINDS)[number]) });

export async function POST(req: Request) {
  return handle(async () => {
    authorize(req);
    const { dealId, kind } = Run.parse(await req.json());
    return runTimer(dealId, kind);
  });
}
