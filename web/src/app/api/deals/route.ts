import { z } from "zod";
import { issueToken, publicDeal } from "@/lib/server/auth";
import { HttpError, log, newId, saveDeal } from "@/lib/server/deals";
import { handle } from "@/lib/server/http";
import type { Deal, Scan } from "@/lib/types";
import { usd } from "@/lib/types";

// The scan travels through the browser, so it's re-validated here with tight limits before it's stored and shown to buyers.
const str = (max: number) => z.string().max(max);
const cents = z.number().int().min(0).max(100_000_000);
const ScanSchema: z.ZodType<Scan> = z.strictObject({
  item: str(160),
  priceCents: cents.nullable(),
  condition: str(200),
  checklist: z.array(str(160)).max(6),
  flags: z
    .array(
      z.strictObject({
        type: z.enum(["FRIENDS_AND_FAMILY", "URGENCY", "OFF_PLATFORM", "OVERPAYMENT", "ADDRESS_CHANGE", "PHISHING_LINK", "FAKE_INVOICE", "MANIPULATION", "PRICE_TOO_LOW", "STOCK_PHOTO", "KNOWN_SCAM", "SIMILAR_SCAM"]),
        quote: str(400),
        explanation: str(400),
      }),
    )
    .max(12),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  summary: str(500),
  market: z
    .strictObject({
      query: str(200),
      medianCents: cents,
      lowCents: cents,
      highCents: cents,
      belowMarketPct: z.number().int().min(-1000).max(100).nullable(),
      comps: z
        .array(
          z.strictObject({
            title: str(300),
            priceCents: cents,
            image: z.url({ protocol: /^https$/ }).max(1000).optional(),
            url: z.url({ protocol: /^https$/ }).max(2000).optional(),
            merchant: str(120).optional(),
          }),
        )
        .max(8),
    })
    .nullable(),
  id: str(40).optional(),
  memory: z
    .strictObject({
      size: z.number().int().min(0),
      matches: z
        .array(
          z.strictObject({
            id: str(64),
            kinds: z.array(z.enum(["SAME_DETAILS", "SIMILAR_WORDING", "SAME_PHOTO"])).max(3),
            details: z.array(str(200)).max(10),
            flags: z.array(str(40)).max(12),
            seen: z.number().int().min(0),
            lastSeen: str(40),
            reported: z.boolean(),
            confirmed: z.boolean(),
          }),
        )
        .max(5),
    })
    .nullable()
    .optional(),
  source: z
    .strictObject({
      url: z.url({ protocol: /^https?$/ }).max(2000),
      host: str(200),
      photos: z
        .array(z.strictObject({ src: z.url({ protocol: /^https$/ }).max(2000), kind: z.enum(["SELLER_PHOTO", "STORE_PHOTO", "UNCLEAR"]), reason: str(200) }))
        .max(3),
    })
    .nullable()
    .optional(),
});

const Body = z.object({
  title: z.string().min(2).max(120),
  priceCents: z.number().int().min(100).max(1_000_000),
  condition: z.string().max(200).default(""),
  checklist: z.array(z.string().max(160)).max(6).default([]),
  photo: z.string().startsWith("data:image/").max(2_000_000).optional(),
  sellerName: z.string().min(1).max(60),
  scan: ScanSchema.nullable().default(null),
  // Optional and private: the lowest price the seller's agent may accept. Setting it opens the deal to offers.
  floorCents: z.number().int().min(100).max(1_000_000).optional(),
  handoff: z.enum(["ship", "meet"]).default("ship"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const b = Body.parse(await req.json());
    if (b.floorCents != null && b.floorCents > b.priceCents) throw new HttpError(400, "Your lowest price can't be above the asking price.");
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
    log(deal, "seller", `Created a protected deal for ${b.title} at ${usd(b.priceCents)}${b.floorCents != null ? ". Open to PayPal-backed offers" : ""}${b.handoff === "meet" ? ". To be handed over in person" : ""}.`);
    await issueToken(deal, "seller");
    await saveDeal(deal);
    return publicDeal(deal, { seller: true, buyer: false });
  });
}
