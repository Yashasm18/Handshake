import "server-only";
import type { Deal, ParcelStatus, Tracking, TrackingFlag } from "../types";
export { blocksRelease } from "../deadlines";
import type { EasyPostTracker } from "./easypost";

const STATUSES: ParcelStatus[] = ["unknown", "pre_transit", "in_transit", "out_for_delivery", "delivered", "available_for_pickup", "return_to_sender", "failure", "cancelled", "error"];
const asStatus = (s?: string): ParcelStatus => (STATUSES.includes(s as ParcelStatus) ? (s as ParcelStatus) : "unknown");

const HOUR = 60 * 60 * 1000;
// A number the carrier still doesn't know a day after "shipping" was probably made up.
export const UNKNOWN_AFTER_MS = 24 * HOUR;

const zip5 = (z?: string | null) => (z ?? "").replace(/\D/g, "").slice(0, 5);
const place = (l?: { city?: string | null; state?: string | null; zip?: string | null }) =>
  l ? [l.city, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined : undefined;

// Milestones worth an email, in the order a parcel reaches them.
export type Milestone = "out_for_delivery" | "delivered" | "failure";

export function newTracking(test: boolean): Tracking {
  return { provider: "easypost", test, status: "unknown", events: [], flags: [] };
}

// Reads a tracker into the deal and returns any milestones not emailed yet. Pure apart from mutating
// `deal`, so it's the same whether the update came from a webhook or the polling timer.
export function applyTracker(deal: Deal, tracker: EasyPostTracker, now = Date.now()): Milestone[] {
  const s = deal.shipment;
  if (!s) return [];
  const t: Tracking = s.tracking ?? newTracking(tracker.mode === "test");
  t.trackerId = tracker.id;
  t.test = tracker.mode ? tracker.mode === "test" : t.test;
  t.status = asStatus(tracker.status);
  t.statusDetail = tracker.status_detail ?? undefined;
  t.estDelivery = tracker.est_delivery_date ?? undefined;
  t.checkedAt = new Date(now).toISOString();

  let details = [...(tracker.tracking_details ?? [])]
    .filter((d) => d.datetime)
    .sort((a, b) => Date.parse(a.datetime!) - Date.parse(b.datetime!));
  // EasyPost's test parcels carry fixed dates from the past. Shift the whole timeline (keeping the gaps
  // between scans) so its last scan lands now: a demo deal isn't "delivered a month ago", and the
  // buyer's window starts today. Real parcels keep their real times.
  if (t.test && details.length) {
    const shift = now - Date.parse(details[details.length - 1].datetime!);
    details = details.map((d) => ({ ...d, datetime: new Date(Date.parse(d.datetime!) + shift).toISOString() }));
  }
  t.events = details.slice(-20).map((d) => ({ at: d.datetime!, status: asStatus(d.status), message: (d.message ?? "").slice(0, 160), place: place(d.tracking_location) }));

  const delivered = [...details].reverse().find((d) => d.status === "delivered");
  if (t.status === "delivered") {
    t.deliveredAt = delivered?.datetime ?? tracker.updated_at ?? t.deliveredAt ?? new Date(now).toISOString();
    t.deliveredPlace = place(delivered?.tracking_location);
    // Test parcels carry made-up locations, so their ZIP proves nothing either way.
    const got = zip5(delivered?.tracking_location?.zip);
    const want = zip5(deal.shipTo?.address?.postal_code);
    t.addressCheck = t.test || !got || !want ? "unknown" : got === want ? "match" : "mismatch";
  }

  const flags = new Set<TrackingFlag>(t.flags.filter((f) => f === "REUSED_NUMBER"));
  const shippedAt = Date.parse(deal.clock?.shippedAt ?? "");
  if ((t.status === "unknown" || t.status === "error") && (t.test || (Number.isFinite(shippedAt) && now - shippedAt > UNKNOWN_AFTER_MS))) flags.add("UNKNOWN_NUMBER");
  if (t.addressCheck === "mismatch") flags.add("WRONG_ZIP");
  // Only a real delivery scan's time counts here, never a stand-in.
  if (!t.test && delivered?.datetime && Number.isFinite(shippedAt) && Date.parse(delivered.datetime) < shippedAt - HOUR) flags.add("DELIVERED_BEFORE_SHIPPED");
  if (t.status === "failure" || t.statusDetail === "lost") flags.add("LOST");
  t.flags = [...flags];

  const reached: Milestone[] = [];
  if (t.status === "out_for_delivery") reached.push("out_for_delivery");
  if (t.status === "delivered") reached.push("delivered");
  if (t.status === "failure") reached.push("failure");
  const fresh = reached.filter((m) => !t.notified?.includes(m));
  t.notified = [...(t.notified ?? []), ...fresh];

  s.tracking = t;
  return fresh;
}

// EasyPost rejected the number outright: treat it as made up, so payout needs the buyer's confirmation.
export function markRejected(deal: Deal, now = Date.now()) {
  const t = deal.shipment?.tracking;
  if (!t) return;
  t.status = "error";
  t.checkedAt = new Date(now).toISOString();
  if (!t.flags.includes("UNKNOWN_NUMBER")) t.flags.push("UNKNOWN_NUMBER");
}

// The same tracking number on another live deal: one parcel can't be delivered twice.
// Compared without spaces, dashes or case, so "1Z 999-AA1" and "1z999aa1" are the same parcel.
const normalize = (n?: string) => (n ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
// The first deal to ship a number owns it: only a live deal that shipped it EARLIER counts as reuse.
// So copying an honest seller's number into a later deal can't stall that seller's payout.
export function reusedElsewhere(deal: Deal, all: Deal[]) {
  const n = normalize(deal.shipment?.trackingNumber);
  if (!n) return false;
  const mine = Date.parse(deal.clock?.shippedAt ?? "") || Infinity;
  return all.some((d) => {
    if (d.id === deal.id || d.status === "RELEASED" || normalize(d.shipment?.trackingNumber) !== n) return false;
    const theirs = Date.parse(d.clock?.shippedAt ?? "") || Infinity;
    return theirs < mine || (theirs === mine && d.id < deal.id);
  });
}

// What a stranger with the link may see: how far along it is, not where or the number.
export function publicTracking(t: Tracking): Tracking {
  return { provider: t.provider, test: t.test, status: t.status, estDelivery: t.estDelivery, deliveredAt: t.deliveredAt, events: [], flags: [] };
}
