import "server-only";
import { DAY, deadlinesFor, type Deadline, type DeadlineKind } from "../deadlines";
import type { Deal } from "../types";
import { openDeals, withDeal } from "./deals";
import { sendReminder } from "./notify";
import { timerScale } from "./timers";

// A day before a deadline the timer would act on, the person who has to act gets one reminder email:
// the seller to ship, both sides to meet, the buyer to check the item, both to answer a refund proposal.
// Deadlines Handshake handles itself (renewing a hold, retrying a payout) send nothing.
export const REMIND_BEFORE = DAY;
export const REMINDED: DeadlineKind[] = ["SHIP_BY", "MEET_BY", "AUTO_RELEASE", "CLAIM_SETTLE"];

// A deadline that moves (a new delivery scan, say) is a new deadline, so it gets its own reminder.
export const reminderKey = (d: Deadline) => `${d.kind}@${d.at}`;

export function remindersDue(deal: Deal, now: number, scale = 1): Deadline[] {
  return deadlinesFor(deal, scale).filter(
    (d) => REMINDED.includes(d.kind) && d.at > now && d.at - now <= REMIND_BEFORE * scale && !deal.reminded?.includes(reminderKey(d)),
  );
}

// Run by every timer sweep (every 5 minutes). Each reminder is marked sent inside the deal's lock before
// the email goes out, so two servers sweeping at once can't both send it. Returns how many were sent.
export async function sendDueReminders(now = Date.now()) {
  const scale = timerScale();
  let sent = 0;
  for (const deal of await openDeals()) {
    if (!remindersDue(deal, now, scale).length) continue;
    const marked = await withDeal(deal.id, async (d) => {
      const due = remindersDue(d, now, scale);
      d.reminded = [...(d.reminded ?? []), ...due.map(reminderKey)];
      return { snapshot: structuredClone(d), due };
    }).catch((e) => {
      console.error("reminder", deal.id, (e as Error).message);
      return null;
    });
    if (!marked) continue;
    for (const d of marked.due) await sendReminder(marked.snapshot, d, now);
    sent += marked.due.length;
  }
  return sent;
}
