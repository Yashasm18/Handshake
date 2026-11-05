"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { BACKSTAGE, countdown, type Deadline } from "@/lib/deadlines";
import type { DealView as Deal } from "@/lib/types";
import { EASE } from "./motion";

type Role = "buyer" | "seller";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// What this person should know about the next deadline, in their words.
function sentence(d: Deadline, role: Role, seller: string, left: string) {
  switch (d.kind) {
    case "SHIP_BY":
      return role === "seller"
        ? `Ship within ${left}, or the hold is released and the buyer pays nothing.`
        : `${seller} has ${left} to ship. If they don't, your money is released automatically.`;
    case "MEET_BY":
      return role === "seller"
        ? `Meet and hand it over within ${left}, or the hold is released and the buyer pays nothing.`
        : `If you and ${seller} don't meet within ${left}, your money is released automatically.`;
    case "AUTO_RELEASE":
      return role === "buyer"
        ? `Confirm or report a problem within ${left}. After that, payment releases to ${seller} automatically.`
        : `If the buyer doesn't respond within ${left}, you're paid automatically.`;
    case "CLAIM_SETTLE":
      return `If nobody declines within ${left}, this proposal settles automatically.`;
    case "REAUTHORIZE":
      return `In ${left}, Handshake renews the PayPal hold so the money stays reserved.`;
  }
}

// Under the action card: the one deadline that matters to this person right now.
export function DeadlineNotice({ deal, role }: { deal: Deal; role: Role }) {
  const now = useNow();
  const d = deal.deadlines.find((x) => !BACKSTAGE.includes(x.kind));
  if (!d) return null;
  const left = d.at - now;
  const urgent = left < (deal.demoClock ? 30_000 : 12 * 3600_000);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className={`mt-4 flex items-start gap-3 rounded-2xl border px-5 py-4 text-[15px] ${urgent ? "border-alert/30 bg-alert-soft text-alert" : "hairline bg-card"}`}
      role="status"
    >
      <Clock className="mt-0.5 shrink-0" />
      <span>
        {left > 0 ? sentence(d, role, deal.sellerName, countdown(left)) : "Deadline reached. Handshake is enforcing it now."}
        {deal.demoClock && <span className="label ml-2 opacity-60">Demo speed</span>}
      </span>
    </motion.div>
  );
}

const TITLES: Record<Deadline["kind"], string> = {
  SHIP_BY: "Ship by",
  MEET_BY: "Meet by",
  REAUTHORIZE: "Renew PayPal hold",
  AUTO_RELEASE: "Buyer responds by",
  CLAIM_SETTLE: "Claim settles",
  RETURNED: "Release to buyer",
  TRACKING_CHECK: "Next carrier check",
  PAYOUT: "Paying the seller",
};

// Sidebar: every running timer on the deal, and who enforces them.
export function DealClock({ deal }: { deal: Deal }) {
  const now = useNow();
  if (!deal.deadlines.some((d) => d.kind !== "TRACKING_CHECK")) return null;
  return (
    <div className="rounded-[28px] border hairline bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="label text-muted">Deal clock</p>
        {deal.demoClock && <span className="label rounded-full bg-held-soft px-2.5 py-1 text-held">Demo speed</span>}
      </div>
      <ul className="mt-4 space-y-4">
        {deal.deadlines.filter((d) => d.kind !== "TRACKING_CHECK").map((d) => (
          <li key={d.kind} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1">
            <span className="font-medium">{TITLES[d.kind]}</span>
            <span className="font-mono text-[14px] tabular-nums">{countdown(d.at - now)}</span>
            <span className="col-span-2 text-[14px] text-muted">If it passes, {d.consequence}.</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t hairline pt-4 text-[13px] text-muted">Enforced automatically by a Render Workflow, even if nobody opens this page.</p>
    </div>
  );
}

function Clock({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 ${className}`} aria-hidden>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
