import { z } from "zod";
import { HttpError } from "@/lib/server/deals";
import { scanDeal } from "@/lib/server/checks";
import { handle } from "@/lib/server/http";
import { assertPublicHost, linkOnly, listingUrl, readListing } from "@/lib/server/kernel";
import { visitorOf } from "@/lib/server/visitor";

const Body = z.object({
  text: z.string().max(8000).optional(),
  image: z.string().startsWith("data:image/").max(4_000_000).optional(),
  url: z.string().max(2000).optional(),
});

// Each link opens a paid cloud browser, so links are limited per visitor, across all visitors, and in flight.
const LINKS_PER_VISITOR = 8;
const LINKS_PER_WINDOW = 120;
const MAX_OPEN = 4;
const WINDOW_MS = 10 * 60_000;
const recent = new Map<string, number[]>();
let everyone: number[] = [];
let open = 0;

function takeLinkSlot(req: Request) {
  const now = Date.now();
  const fresh = (ts: number[]) => ts.filter((t) => now - t < WINDOW_MS);
  const who = visitorOf(req);
  const hits = fresh(recent.get(who) ?? []);
  everyone = fresh(everyone);
  if (hits.length >= LINKS_PER_VISITOR) throw new HttpError(429, "That's a lot of links in a few minutes. Wait a little, or paste the listing text instead.");
  if (everyone.length >= LINKS_PER_WINDOW || open >= MAX_OPEN) throw new HttpError(503, "Link checks are busy right now. Paste the listing text or a screenshot instead.");
  recent.set(who, [...hits, now]);
  everyone.push(now);
  open++;
  // Forget visitors whose window has passed, rather than resetting everyone's limit.
  if (recent.size > 5000) for (const [k, ts] of recent) if (!fresh(ts).length) recent.delete(k);
  let closed = false;
  const release = () => {
    if (!closed) open--;
    closed = true;
  };
  // A link refused before any browser opened gives back the site-wide budget, so junk can't exhaust it
  // for everyone, but it still counts against the visitor who sent it.
  const refund = () => {
    release();
    everyone.splice(everyone.indexOf(now), 1);
  };
  return { release, refund };
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    // A message that is only a link means "open this listing".
    const url = body.url?.trim() || linkOnly(body.text);
    if (url) {
      // Cheap checks first; the DNS check runs inside the limit and refunds the slot if it refuses.
      const parsed = listingUrl(url);
      if (!process.env.KERNEL_API_KEY) throw new HttpError(503, "Reading links isn't set up on this server. Paste the listing text instead.");
      const slot = takeLinkSlot(req);
      try {
        await assertPublicHost(parsed.hostname);
      } catch (e) {
        slot.refund();
        throw e;
      }
      try {
        const listing = await readListing(url);
        return await scanDeal({ listing, imageDataUrl: body.image, text: body.url ? body.text : undefined, visitor: visitorOf(req) });
      } finally {
        slot.release();
      }
    }
    if (!body.text?.trim() && !body.image) throw new z.ZodError([]);
    return scanDeal({ text: body.text, imageDataUrl: body.image, visitor: visitorOf(req) });
  });
}
