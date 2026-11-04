import { z } from "zod";
import { HttpError } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";
import { memoryEnabled, reportScan, witnessOf } from "@/lib/server/memory";
import { visitorOf, windowLimiter } from "@/lib/server/visitor";

const Body = z.object({ scanId: z.string().min(8).max(40) });
const limiter = windowLimiter(10, 10 * 60_000);

// A buyer marks a scan they just ran as a scam. The report refers to Handshake's own copy of that scan,
// so only words Handshake read, from a scan that already found warning signs, can enter memory.
export async function POST(req: Request) {
  return handle(async () => {
    if (!memoryEnabled()) throw new HttpError(503, "Scam memory isn't set up on this server.");
    const { scanId } = Body.parse(await req.json());
    const who = visitorOf(req);
    if (!limiter.take(who)) throw new HttpError(429, "That's a lot of reports in a few minutes. Try again later.");
    const result = await reportScan(scanId, witnessOf(who));
    if (result === "expired") throw new HttpError(404, "That check is too old to report. Run it again, then report it.");
    if (result === "nothing-suspicious") throw new HttpError(400, "This check found no warning signs, so there's nothing to report.");
    if (result === "nothing-to-keep") throw new HttpError(400, "There's nothing in this message Handshake could recognize next time.");
    return { reported: true, already: result === "already" };
  });
}
