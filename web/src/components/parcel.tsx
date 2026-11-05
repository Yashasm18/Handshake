"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { DealView as Deal, ParcelStatus, Tracking, TrackingFlag } from "@/lib/types";
import { EASE } from "./motion";

type Role = "buyer" | "seller";

// The four steps every parcel goes through, and how far each carrier status gets.
const STEPS = ["Label created", "In transit", "Out for delivery", "Delivered"] as const;
const REACHED: Record<ParcelStatus, number> = {
  unknown: 0,
  error: 0,
  cancelled: 0,
  pre_transit: 1,
  in_transit: 2,
  available_for_pickup: 3,
  out_for_delivery: 3,
  delivered: 4,
  return_to_sender: 2,
  failure: 2,
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function ago(iso: string | undefined, now: number) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// A "delivered" scan that doesn't fit this deal is the empty-box scam's signature: lead with that.
export const suspiciousDelivery = (t?: Tracking) => Boolean(t?.flags.some((f) => f === "WRONG_ZIP" || f === "DELIVERED_BEFORE_SHIPPED" || f === "REUSED_NUMBER"));

function headline(t: Tracking, lastPlace?: string): { title: string; tone: "plain" | "safe" | "alert" } {
  if (t.status === "delivered" && t.flags.includes("WRONG_ZIP")) return { title: "Marked delivered, but to a different address", tone: "alert" };
  if (t.status === "delivered" && t.flags.includes("DELIVERED_BEFORE_SHIPPED")) return { title: "Marked delivered before it was shipped", tone: "alert" };
  switch (t.status) {
    case "delivered":
      return { title: t.deliveredAt ? `Delivered ${time(t.deliveredAt)}` : "Delivered", tone: "safe" };
    case "out_for_delivery":
      return { title: "Out for delivery today", tone: "plain" };
    case "available_for_pickup":
      return { title: "Ready to collect from the carrier", tone: "plain" };
    case "in_transit":
      return { title: lastPlace ? `In transit · ${lastPlace}` : "In transit", tone: "plain" };
    case "pre_transit":
      return { title: "Label created · waiting for pickup", tone: "plain" };
    case "return_to_sender":
      return { title: "Returned to the seller", tone: "alert" };
    case "failure":
      return { title: "The carrier reports a problem", tone: "alert" };
    default:
      return { title: "Waiting for the carrier's first scan", tone: "plain" };
  }
}

// Each warning in plain words, for each side of the deal.
function flagText(f: TrackingFlag, role: Role): string {
  switch (f) {
    case "UNKNOWN_NUMBER":
      return role === "buyer" ? "The carrier doesn't recognise this tracking number. It may be made up." : "The carrier doesn't recognise this tracking number yet. Check you entered it correctly.";
    case "WRONG_ZIP":
      return "It was delivered to a different ZIP code than the buyer's PayPal address.";
    case "REUSED_NUMBER":
      return "This tracking number is already used on another Handshake deal.";
    case "DELIVERED_BEFORE_SHIPPED":
      return "The carrier shows it delivered before it was marked shipped: an old tracking number.";
    case "LOST":
      return "The carrier reports the parcel lost or undeliverable.";
  }
}

export function ParcelCard({ deal, role }: { deal: Deal; role: Role }) {
  const s = deal.shipment;
  const t = s?.tracking;
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!s) return null;

  // Tracking off (no EasyPost key): the plain carrier chip, as before.
  if (!t) {
    return (
      <div className="mt-6 inline-flex flex-wrap items-center gap-3 rounded-full bg-paper px-4 py-2 text-[14px]">
        <span className="label text-muted">{s.carrier}</span>
        <span className="font-mono">{s.trackingNumber}</span>
        {s.labelCheck?.match && <span className="text-safe">● Address verified</span>}
      </div>
    );
  }

  const events = [...t.events].reverse();
  const lastPlace = events.find((e) => e.place)?.place;
  const h = headline(t, lastPlace);
  const reached = REACHED[t.status];
  const broken = t.status === "return_to_sender" || t.status === "failure";
  const suspicious = suspiciousDelivery(t);
  const warnings = t.flags.map((f) => flagText(f, role));
  const shown = open ? events : events.slice(0, 3);

  return (
    <div className="mt-6 overflow-hidden rounded-[24px] bg-paper">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="label text-muted">Parcel</span>
            <span className="label text-muted">·</span>
            <span className="label">{s.carrier}</span>
            {s.trackingNumber && <span className="font-mono text-[13px] text-muted">{s.trackingNumber}</span>}
            {t.test && <span className="label rounded-full bg-held-soft px-2.5 py-1 text-held">Test parcel</span>}
          </div>
          <span className="label flex items-center gap-1.5 text-muted" title="Updates come straight from the carrier through EasyPost">
            <span className="relative flex size-2">
              {!["delivered", "return_to_sender"].includes(t.status) && <span className="absolute inline-flex size-full animate-ping rounded-full bg-safe opacity-60" />}
              <span className="relative inline-flex size-2 rounded-full bg-safe" />
            </span>
            Live from carrier{t.checkedAt ? ` · ${ago(t.checkedAt, now)}` : ""}
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={h.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.45, ease: EASE }}
            className={`mt-4 font-display text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px] ${h.tone === "safe" ? "text-safe" : h.tone === "alert" ? "text-alert" : ""}`}
          >
            {h.title}
          </motion.p>
        </AnimatePresence>
        {t.estDelivery && t.status !== "delivered" && !broken && <p className="mt-1 text-[15px] text-muted">Expected {day(t.estDelivery)}</p>}

        {/* Four steps, filled as the carrier scans it. */}
        <div className="mt-5 grid grid-cols-4 gap-1.5" aria-label={`Parcel progress: ${STEPS[Math.max(0, reached - 1)] ?? "not scanned yet"}`}>
          {STEPS.map((step, i) => (
            <div key={step}>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                <motion.div
                  className={`h-full rounded-full ${(broken || suspicious) && i === reached - 1 ? "bg-alert" : t.status === "delivered" && !suspicious ? "bg-safe" : "bg-ink"}`}
                  initial={{ width: 0 }}
                  animate={{ width: i < reached ? "100%" : "0%" }}
                  transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }}
                />
              </div>
              <p className={`mt-2 text-[12px] leading-tight sm:text-[13px] ${i < reached ? "text-ink" : "text-muted"}`}>{step}</p>
            </div>
          ))}
        </div>

        {t.status === "delivered" && (
          <p className="mt-4 text-[14px] text-muted">
            {t.addressCheck === "match" && <span className="text-safe">● Delivered to the buyer&apos;s PayPal ZIP code</span>}
            {t.addressCheck === "mismatch" && <span className="text-alert">● Delivered to a different ZIP code</span>}
            {t.addressCheck !== "match" && t.addressCheck !== "mismatch" && (t.test ? "Test parcel: its location is simulated, so the address check is skipped." : "The carrier didn't share where it was delivered.")}
          </p>
        )}

        {warnings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-2xl bg-alert-soft p-4">
            <p className="label text-alert">Check this</p>
            <ul className="mt-2 space-y-1.5 text-[15px]">
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
            <p className="mt-2 text-[14px] text-muted">
              {role === "buyer" ? "Your payment won't be released on its own. If you don't have the item, report a problem." : "Payment won't be released on its own; the buyer has to confirm it arrived."}
            </p>
          </motion.div>
        )}
      </div>

      {events.length > 0 && (
        <div className="border-t hairline px-5 py-4 sm:px-6">
          <ol className="space-y-3">
            {shown.map((e, i) => (
              <li key={`${e.at}-${i}`} className="grid grid-cols-[14px_1fr] gap-3">
                <span className={`mt-1.5 size-2 rounded-full ${i === 0 ? (e.status === "delivered" ? (suspicious ? "bg-alert" : "bg-safe") : broken ? "bg-alert" : "bg-ink") : "bg-ink/25"}`} />
                <div>
                  <p className={`text-[15px] ${i === 0 ? "font-medium" : "text-ink/80"}`}>{e.message || e.status.replace(/_/g, " ")}</p>
                  <p className="text-[13px] text-muted">
                    {time(e.at)}
                    {e.place ? ` · ${e.place}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {events.length > 3 && (
            <button onClick={() => setOpen((o) => !o)} className="label mt-3 text-muted transition-colors hover:text-ink">
              {open ? "Show less" : `Show all ${events.length} updates`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Seller side, test mode only: pick one of EasyPost's simulated parcels to see each story play out.
export const TEST_PARCELS = [
  { code: "EZ4000000004", story: "Delivered" },
  { code: "EZ2000000002", story: "In transit" },
  { code: "EZ3000000003", story: "Out for delivery" },
  { code: "EZ5000000005", story: "Returned" },
  { code: "EZ6000000006", story: "Lost" },
  { code: "EZ7000000007", story: "Fake number" },
] as const;

export function TestParcelPicker({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/20 p-4">
      <p className="label text-muted">Try a test parcel</p>
      <p className="mt-1 text-[14px] text-muted">EasyPost&apos;s simulated parcels act out real carrier updates. Pick a story:</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {TEST_PARCELS.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => onPick(p.code)}
            className={`rounded-full border px-3.5 py-1.5 text-[14px] transition-colors ${value === p.code ? "border-ink bg-ink text-paper" : "hairline hover:border-ink/40"}`}
          >
            {p.story}
          </button>
        ))}
      </div>
    </div>
  );
}
