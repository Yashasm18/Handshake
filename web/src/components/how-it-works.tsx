"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE } from "./motion";

const STEPS = [
  {
    t: "Paste the chat",
    d: "Drop in the listing, the messages or a screenshot. We read it for the tricks scammers use: Friends & Family, fake urgency, overpayment, address swaps.",
    tag: "AI · Vision",
  },
  {
    t: "See the real price",
    d: "We look up the item across 25,000 stores. A phone listed at 64% under retail isn't a bargain. It's bait.",
    tag: "Channel3 · 100M products",
  },
  {
    t: "PayPal holds the money",
    d: "The buyer pays into a PayPal hold. The seller can see it's real, and nothing is charged until the item shows up as described.",
    tag: "PayPal · Authorize",
  },
  {
    t: "Ship to the right place",
    d: "Sellers snap the label. If it doesn't match the buyer's PayPal-verified address, we stop it before Seller Protection is lost.",
    tag: "AI · Label check",
  },
  {
    t: "Settle in a minute, not a month",
    d: "Arrived damaged? Take a photo. We price the fix from real replacement parts, and PayPal releases the difference back. No 30-day dispute.",
    tag: "PayPal · Partial capture",
  },
];

export function HowItWorks() {
  const [open, setOpen] = useState(0);
  return (
    <section id="how" className="mx-auto max-w-[1400px] px-5 pb-4 pt-28 md:px-10 md:pb-8 md:pt-40">
      <div className="mb-14 flex items-end justify-between gap-6">
        <h2 className="display text-[clamp(40px,6vw,88px)]">How it works</h2>
        <p className="label hidden text-muted md:block">Five steps · Under two minutes</p>
      </div>
      <ol className="border-t hairline">
        {STEPS.map((s, i) => {
          const active = open === i;
          return (
            <li key={s.t} className="border-b hairline">
              <button
                onClick={() => setOpen(i)}
                onMouseEnter={() => setOpen(i)}
                className="group grid w-full grid-cols-[48px_1fr_auto] items-center gap-4 py-7 text-left md:grid-cols-[90px_1fr_auto] md:py-9"
                aria-expanded={active}
              >
                <span className="label text-muted">0{i + 1}</span>
                <span className={`font-display text-[clamp(26px,3.6vw,52px)] font-semibold tracking-[-0.035em] transition-colors duration-300 ${active ? "text-ink" : "text-ink/35 group-hover:text-ink/70"}`}>
                  {s.t}
                </span>
                <motion.span
                  animate={{ rotate: active ? 45 : 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className={`flex size-11 items-center justify-center rounded-full border transition-colors ${active ? "border-ink bg-ink text-paper" : "border-ink/15"}`}
                  aria-hidden
                >
                  <svg viewBox="0 0 16 16" className="size-4">
                    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {active && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-4 pb-9 md:grid-cols-[90px_1fr_auto]">
                      <span />
                      <p className="max-w-[620px] text-[18px] leading-relaxed text-muted">{s.d}</p>
                      <span className="label self-start rounded-full border hairline px-3 py-1.5 text-muted">{s.tag}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
