import { z } from "zod";
import { applyEmailLink } from "@/lib/server/contacts";
import { handle } from "@/lib/server/http";

// The confirm and stop-emails buttons on /email. The token from the email link proves inbox ownership.
export async function POST(req: Request) {
  return handle(async () => {
    const b = z.object({ d: z.string().min(10).max(40), r: z.enum(["seller", "buyer"]), t: z.string().min(10).max(80), a: z.enum(["confirm", "mute"]) }).parse(await req.json());
    return applyEmailLink(b.d, b.r, b.t, b.a);
  });
}
