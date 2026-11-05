import { dealByTracker, withDeal } from "@/lib/server/deals";
import { type EasyPostTracker, testMode, verifyWebhook } from "@/lib/server/easypost";
import { announceTracking } from "@/lib/server/notify";
import { applyTracker } from "@/lib/server/tracking";

// EasyPost calls this whenever a parcel Handshake follows changes. Every call must carry a valid
// signature made with our webhook secret, so nobody can fake a "delivered" scan. A delivery only ever
// moves deadlines; money still moves under the deal's own rules.
export async function POST(req: Request) {
  const secret = process.env.EASYPOST_WEBHOOK_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });
  const raw = await req.text();
  if (raw.length > 512_000 || !verifyWebhook(raw, req.headers.get("x-hmac-signature"), secret)) return new Response("Invalid signature", { status: 401 });

  let event: { description?: string; mode?: string; result?: EasyPostTracker };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const tracker = event.result;
  // Only tracker events, and only from the mode our key is in (a test event can't touch a real deal).
  if (!event.description?.startsWith("tracker.") || !tracker?.id || (event.mode && (event.mode === "test") !== testMode())) return new Response("Ignored", { status: 200 });

  const deal = await dealByTracker(tracker.id, tracker.tracking_code ?? "");
  // Unknown parcels are acknowledged, so EasyPost doesn't keep retrying.
  if (!deal) return new Response("Not ours", { status: 200 });
  await withDeal(deal.id, async (d) => {
    if (d.status !== "SHIPPED" || !d.shipment) return;
    announceTracking(d, applyTracker(d, tracker));
  });
  return new Response("OK", { status: 200 });
}
