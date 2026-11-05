"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE } from "./motion";

type Check = { id: string; name: string; role: string; status: "up" | "slow" | "down" | "off"; ms?: number; checkedAt: string; note?: string };
type Status = { overall: "up" | "degraded" | "down"; checks: Check[]; errorsLastHour: number; at: string };

const DOT = { up: "bg-safe", slow: "bg-held", down: "bg-alert", off: "bg-ink/25" };
const WORD = { up: "Working", slow: "Slow", down: "Down", off: "Not set up" };
const TONE = { up: "text-safe", slow: "text-held", down: "text-alert", off: "text-muted" };

const BANNER = {
  up: { title: "Everything is working", body: "All services answered normally.", cls: "bg-safe-soft", dot: "bg-safe" },
  degraded: { title: "Some services are slow or down", body: "Deals keep working. Anything that needs the affected service waits and retries on its own.", cls: "bg-held-soft", dot: "bg-held" },
  down: { title: "Payments are down", body: "No money moves until PayPal answers again. Holds stay held; nothing is lost.", cls: "bg-alert-soft", dot: "bg-alert" },
};

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
}

export function StatusBoard() {
  const [data, setData] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  // Set when data arrives (never during the prerender, where reading the clock isn't allowed).
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/status", { cache: "no-store" })
        .then((r) => r.json() as Promise<Status>)
        .then((d) => alive && (setData(d), setFailed(false), setNow(Date.now())))
        .catch(() => alive && setFailed(true));
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(tick);
    };
  }, []);

  if (failed && !data) return <p className="mt-12 rounded-2xl bg-alert-soft p-6 text-[17px] text-alert">The status check itself didn&apos;t answer. Try again in a minute.</p>;
  if (!data) {
    return (
      <div className="mt-12 space-y-3" aria-busy>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-ink/[0.05]" />)}
      </div>
    );
  }

  const b = BANNER[data.overall];
  return (
    <div className="mt-12">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className={`flex items-start gap-4 rounded-[24px] p-6 ${b.cls}`}>
        <span className="relative mt-2 flex size-3 shrink-0">
          <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-50 ${b.dot}`} />
          <span className={`relative inline-flex size-3 rounded-full ${b.dot}`} />
        </span>
        <div>
          <p className="font-display text-[24px] font-semibold tracking-tight md:text-[28px]">{b.title}</p>
          <p className="mt-1 text-[16px] text-muted">{b.body}</p>
        </div>
      </motion.div>

      <ul className="mt-8 border-b hairline">
        {data.checks.map((c, i) => (
          <motion.li
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.05 * i }}
            className="grid grid-cols-[14px_1fr_auto] items-start gap-x-4 gap-y-1 border-t hairline py-5"
          >
            <span className={`mt-2 size-2.5 rounded-full ${DOT[c.status]}`} />
            <div className="min-w-0">
              <p className="font-display text-[19px] font-semibold tracking-tight">{c.name}</p>
              <p className="text-[15px] text-muted">{c.role}</p>
              {c.note && <p className={`mt-1 text-[14px] ${c.status === "up" ? "text-muted" : TONE[c.status]}`}>{c.note}</p>}
            </div>
            <div className="text-right">
              <p className={`label ${TONE[c.status]}`}>{WORD[c.status]}</p>
              <p className="mt-1 text-[13px] text-muted">
                {c.ms != null && c.status !== "off" ? `${c.ms} ms · ` : ""}
                {ago(c.checkedAt, now)}
              </p>
            </div>
          </motion.li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[14px] text-muted">
        <p>Unexpected server errors in the last hour: <span className={data.errorsLastHour ? "text-alert" : "text-ink"}>{data.errorsLastHour}</span></p>
        <p>Checked live with real requests · refreshes every minute</p>
      </div>
    </div>
  );
}
