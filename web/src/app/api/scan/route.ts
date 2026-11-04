import { z } from "zod";
import { HttpError } from "@/lib/server/deals";
import { scanDeal } from "@/lib/server/checks";
import { handle } from "@/lib/server/http";
import { linkOnly, readListing } from "@/lib/server/kernel";

const Body = z.object({
  text: z.string().max(8000).optional(),
  image: z.string().startsWith("data:image/").max(4_000_000).optional(),
  url: z.string().max(2000).optional(),
});

// Each link opens a cloud browser, so one visitor gets a handful per window, not an unlimited supply.
const LINKS_PER_WINDOW = 8;
const WINDOW_MS = 10 * 60_000;
const recent = new Map<string, number[]>();

function allowLink(req: Request) {
  const who = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const hits = (recent.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LINKS_PER_WINDOW) throw new HttpError(429, "That's a lot of links in a few minutes. Wait a little, or paste the listing text instead.");
  recent.set(who, [...hits, now]);
  if (recent.size > 5000) recent.clear();
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    // A message that is only a link means "open this listing".
    const url = body.url?.trim() || linkOnly(body.text);
    if (url) {
      allowLink(req);
      const listing = await readListing(url);
      return scanDeal({ listing, imageDataUrl: body.image, text: body.url ? body.text : undefined });
    }
    if (!body.text?.trim() && !body.image) throw new z.ZodError([]);
    return scanDeal({ text: body.text, imageDataUrl: body.image });
  });
}
