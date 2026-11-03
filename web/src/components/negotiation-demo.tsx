"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/types";
import { EASE } from "./motion";

// A scripted example (numbers shaped like real sandbox runs) that plays when scrolled into view.
const ASK = 23_000;
const FAIR = { lo: 18_500, hi: 22_500 };
const SCRIPT = [
  { by: "buyer", cents: 18_000, text: "The scuff on the back is real. Used OLEDs in this shape go for less, so I'll open here." },
  { by: "seller", cents: 21_500, text: "Both Joy-Cons, dock and charger are included and the screen is flawless." },
  { by: "buyer", cents: 19_800, text: "Fair point on the bundle. I can come up." },
  { by: "seller", cents: 20_800, text: "Retail is $442. Let's meet closer." },
  { by: "buyer", cents: 20_500, text: "Deal at $205 if you can do it." },
  { by: "seller", cents: 20_500, text: "Done. $205 it is.", accept: true },
] as const;

const MIN = 16_000;
const MAX = 24_000;
const pct = (c: number) => `${((c - MIN) / (MAX - MIN)) * 100}%`;

export function NegotiationDemo({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!inView || step >= SCRIPT.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 400 : 1500);
    return () => clearTimeout(t);
  }, [inView, step, run]);

  const shown = SCRIPT.slice(0, step);
  const buyer = [...shown].reverse().find((s) => s.by === "buyer")?.cents;
  const seller = [...shown].reverse().find((s) => s.by === "seller")?.cents ?? ASK;
  const done = step >= SCRIPT.length;

  return (
    <div ref={ref} className="rounded-[28px] border hairline bg-card p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label flex items-center gap-2 text-muted">
          <span className={`size-2 rounded-full ${done ? "bg-safe" : "animate-pulse bg-held"}`} />
          {done ? "Agreed · PayPal holds $205" : "Agents negotiating"}
        </p>
        <p className="label text-muted">Example · Switch OLED · asking {usd(ASK)}</p>
      </div>

      {/* Price track: the two offers close in on each other inside the fair zone. */}
      <div className="relative mt-10 h-14">
        <div className="absolute inset-x-0 top-6 h-1 rounded-full bg-ink/10" />
        <div className="absolute top-4 h-5 rounded-full bg-safe-soft" style={{ left: pct(FAIR.lo), width: `calc(${pct(FAIR.hi)} - ${pct(FAIR.lo)})` }} />
        <span className="label absolute top-11 text-safe" style={{ left: pct(FAIR.lo) }}>Fair zone</span>
        <div className="absolute top-2 h-9 w-px bg-muted/50" style={{ left: pct(ASK) }} />
        <span className="label absolute -top-5 -translate-x-1/2 text-muted" style={{ left: pct(ASK) }}>Asking</span>
        {buyer != null && <Marker cents={buyer} tone="safe" label="Buyer's agent" below={!done} />}
        <Marker cents={seller} tone="ink" label={`Seller's agent`} below={false} hideLabel={done} />
      </div>

      <ol className={`mt-8 space-y-3 ${compact ? "min-h-[300px]" : "min-h-[400px]"}`}>
        <AnimatePresence initial={false}>
          {shown.map((s, i) => (
            <motion.li
              key={`${run}-${i}`}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: EASE }}
              className={`flex ${s.by === "buyer" ? "justify-start" : "justify-end"}`}
            >
              <div className={`max-w-[85%] rounded-3xl px-5 py-3.5 ${s.by === "buyer" ? "rounded-bl-lg bg-safe-soft" : "rounded-br-lg bg-ink text-paper"}`}>
                <div className="flex items-baseline justify-between gap-6">
                  <span className={`label ${s.by === "buyer" ? "text-safe" : "text-paper/55"}`}>{s.by === "buyer" ? "Buyer's agent" : "Seller's agent"}</span>
                  <span className="font-display text-[20px] font-semibold tabular-nums tracking-tight">{"accept" in s ? "✓ " : ""}{usd(s.cents)}</span>
                </div>
                <p className={`mt-1 text-[15.5px] leading-snug ${s.by === "buyer" ? "" : "text-paper/85"}`}>{s.text}</p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      <div className="mt-6 flex items-center justify-between gap-4 border-t hairline pt-5 text-[14px] text-muted">
        <span>Secret limits: buyer max $215 · seller floor $190. Neither side ever sees the other&apos;s.</span>
        {done && (
          <button onClick={() => { setStep(0); setRun((r) => r + 1); }} className="shrink-0 font-medium text-ink underline-offset-4 hover:underline">
            Replay
          </button>
        )}
      </div>
    </div>
  );
}

function Marker({ cents, tone, label, below, hideLabel }: { cents: number; tone: "safe" | "ink"; label: string; below: boolean; hideLabel?: boolean }) {
  return (
    <motion.div className="absolute top-[18px]" initial={false} animate={{ left: pct(cents) }} transition={{ duration: 0.9, ease: EASE }}>
      <span className={`absolute -left-2 block size-4 rounded-full ring-4 ring-card ${tone === "safe" ? "bg-safe" : "bg-ink"}`} />
      {!hideLabel && (
        <span className={`label absolute -translate-x-1/2 whitespace-nowrap ${below ? "top-7" : "-top-6"} ${tone === "safe" ? "text-safe" : "text-ink"}`}>
          {usd(cents)}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </motion.div>
  );
}
