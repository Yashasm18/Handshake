import { z } from "zod";
import { issueToken, publicDeal } from "@/lib/server/auth";
import { log, newId, saveDeal } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";
import type { Deal, Scan } from "@/lib/types";
import { usd } from "@/lib/types";

const Body = z.object({
  title: z.string().min(2).max(120),
  priceCents: z.number().int().min(100).max(1_000_000),
  condition: z.string().max(200).default(""),
  checklist: z.array(z.string().max(160)).max(6).default([]),
  photo: z.string().startsWith("data:image/").max(2_000_000).optional(),
  sellerName: z.string().min(1).max(60),
  scan: z.custom<Scan>().nullable().default(null),
});

export async function POST(req: Request) {
  return handle(async () => {
    const b = Body.parse(await req.json());
    const now = new Date().toISOString();
    const deal: Deal = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      ...b,
      // Payouts go to the sandbox seller account; in production this is the seller's verified PayPal email.
      sellerEmail: process.env.SELLER_EMAIL ?? "",
      status: "AWAITING_PAYMENT",
      demo: false,
      paypal: {},
      events: [],
    };
    log(deal, "seller", `Created a protected deal for ${b.title} at ${usd(b.priceCents)}.`);
    await issueToken(deal, "seller");
    await saveDeal(deal);
    return publicDeal(deal, { seller: true, buyer: false });
  });
}
