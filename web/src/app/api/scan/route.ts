import { z } from "zod";
import { scanDeal } from "@/lib/server/checks";
import { handle } from "@/lib/server/http";

const Body = z.object({
  text: z.string().max(8000).optional(),
  image: z.string().startsWith("data:image/").max(4_000_000).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    if (!body.text?.trim() && !body.image) throw new z.ZodError([]);
    return scanDeal({ text: body.text, imageDataUrl: body.image });
  });
}
