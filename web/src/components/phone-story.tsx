"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { EASE } from "./motion";

const STEPS = [
  { key: "catch", label: "Scam caught" },
  { key: "hold", label: "Money held" },
  { key: "ship", label: "Label checked" },
  { key: "claim", label: "Damage priced" },
  { key: "settle", label: "Settled" },
] as const;

const DURATION = 3600;

export function PhoneStory() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), DURATION);
    return () => clearTimeout(t);
  }, [step, paused]);

  const k = STEPS[step].key;
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex items-end justify-center gap-4 md:gap-8">
        <Phone who="Maya" role="Buyer" tilt={-4}>
          <AnimatePresence mode="wait">
            <Screen key={k}>{BUYER[k]}</Screen>
          </AnimatePresence>
        </Phone>
        <Phone who="Sam" role="Seller" tilt={4} offset>
          <AnimatePresence mode="wait">
            <Screen key={k}>{SELLER[k]}</Screen>
          </AnimatePresence>
        </Phone>
      </div>

      <div className="mx-auto mt-10 flex max-w-[560px] gap-2">
        {STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setStep(i)} className="group flex-1 text-left" aria-label={`Show step: ${s.label}`}>
            <div className="h-[3px] overflow-hidden rounded-full bg-ink/10">
              {i === step ? (
                <motion.div
                  key={`${step}-${paused}`}
                  className="h-full bg-ink"
                  initial={{ width: "0%" }}
                  animate={{ width: paused ? "100%" : "100%" }}
                  transition={{ duration: paused ? 0.2 : DURATION / 1000, ease: "linear" }}
                />
              ) : (
                <div className={`h-full bg-ink ${i < step ? "w-full" : "w-0"}`} />
              )}
            </div>
            <p className={`label mt-2 transition-colors ${i === step ? "text-ink" : "text-muted/70 group-hover:text-muted"}`}>{s.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Phone({ who, role, children, tilt, offset }: { who: string; role: string; children: ReactNode; tilt: number; offset?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 80, rotate: tilt * 2 }}
      animate={{ opacity: 1, y: offset ? -28 : 0, rotate: tilt }}
      transition={{ duration: 1.2, ease: EASE, delay: offset ? 0.5 : 0.35 }}
      className="relative w-[46%] max-w-[290px]"
    >
      <div className="rounded-[44px] bg-night p-[9px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)]">
        <div className="relative aspect-[9/19] overflow-hidden rounded-[36px] bg-paper">
          <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[90px] -translate-x-1/2 rounded-full bg-night" />
          <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-semibold">
            <span>9:41</span>
            <span className="flex gap-1">
              <span className="h-2 w-3 rounded-sm bg-ink/80" />
            </span>
          </div>
          <div className="flex items-center gap-2 border-b border-line px-4 pb-2.5 pt-5">
            <div className="flex size-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">{who[0]}</div>
            <div className="leading-tight">
              <p className="text-[13px] font-semibold">{who}</p>
              <p className="text-[10px] text-muted">{role}</p>
            </div>
          </div>
          <div className="relative h-full px-3.5 pt-3">{children}</div>
        </div>
      </div>
    </motion.div>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="flex flex-col gap-2"
    >
      {children}
    </motion.div>
  );
}

const pop = (delay: number) => ({
  initial: { opacity: 0, y: 10, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.5, ease: EASE, delay },
});

function Bubble({ me, children, delay = 0 }: { me?: boolean; children: ReactNode; delay?: number }) {
  return (
    <motion.div {...pop(delay)} className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11.5px] leading-snug ${me ? "self-end bg-ink text-paper" : "self-start bg-white"}`}>
      {children}
    </motion.div>
  );
}

function Card({ tone, title, children, delay = 0 }: { tone: "alert" | "safe" | "held" | "plain"; title: string; children?: ReactNode; delay?: number }) {
  const tones = {
    alert: "bg-alert-soft text-alert",
    safe: "bg-safe-soft text-safe",
    held: "bg-held-soft text-held",
    plain: "bg-white text-ink",
  };
  return (
    <motion.div {...pop(delay)} className={`rounded-2xl p-3 ${tones[tone]}`}>
      <p className="text-[12.5px] font-semibold">{title}</p>
      {children && <div className="mt-1 text-[11px] leading-snug text-ink/75">{children}</div>}
    </motion.div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted">{k}</span>
      <span className={strong ? "font-semibold" : ""}>{v}</span>
    </div>
  );
}

const BUYER: Record<(typeof STEPS)[number]["key"], ReactNode> = {
  catch: (
    <>
      <Bubble>iPhone 13, like new. $90 🙏</Bubble>
      <Bubble delay={0.2}>Send Friends &amp; Family, I&apos;m moving tomorrow</Bubble>
      <Card tone="alert" title="High risk. Don't send money." delay={0.7}>
        <ul className="space-y-0.5">
          <li>• Asks for Friends &amp; Family</li>
          <li>• 64% under the $248 retail price</li>
          <li>• Pressure: &ldquo;moving tomorrow&rdquo;</li>
        </ul>
      </Card>
    </>
  ),
  hold: (
    <>
      <Card tone="plain" title="iPhone 13 · 128GB · $200">
        <span className="text-safe">● Fair price. No red flags.</span>
      </Card>
      <motion.div {...pop(0.3)} className="rounded-full bg-[#ffc439] py-2.5 text-center text-[12px] font-bold text-[#003087]">
        PayPal
      </motion.div>
      <Card tone="held" title="$200 held by PayPal" delay={0.9}>
        Sam can see it&apos;s real. Nothing is charged until it arrives.
      </Card>
    </>
  ),
  ship: (
    <>
      <Card tone="held" title="On its way">UPS · 1Z999AA10123</Card>
      <Card tone="safe" title="Shipping to your PayPal address" delay={0.4}>
        2211 N First St, San Jose ✓
      </Card>
    </>
  ),
  claim: (
    <>
      <motion.div {...pop(0)} className="relative h-24 overflow-hidden rounded-2xl bg-night">
        <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="30" y="6" width="40" height="48" rx="6" fill="#222" stroke="#444" />
          <path d="M38 14 L52 30 L46 34 L60 48" stroke="#ddd" strokeWidth="0.8" fill="none" />
        </svg>
        <motion.div className="absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-white/30 to-transparent" style={{ animation: "scan 1.6s ease-in-out infinite" }} />
      </motion.div>
      <Card tone="plain" title="Crack across the screen" delay={0.5}>
        Not in the listing. Replacement screen: <b>$40</b> (median of 6 stores)
      </Card>
      <Card tone="safe" title="Keep it, get $40 back?" delay={1}>
        <div className="mt-1 flex gap-1.5">
          <span className="rounded-full bg-ink px-3 py-1 text-[10px] text-paper">Accept</span>
          <span className="rounded-full border border-ink/20 px-3 py-1 text-[10px]">Return it</span>
        </div>
      </Card>
    </>
  ),
  settle: (
    <>
      <Card tone="safe" title="$40 back to you">Released automatically. No refund wait, no dispute.</Card>
      <motion.div {...pop(0.4)} className="space-y-1 rounded-2xl bg-white p-3">
        <Row k="Held" v="$200.00" />
        <Row k="Released" v="−$40.00" />
        <Row k="You paid" v="$160.00" strong />
      </motion.div>
    </>
  ),
};

const SELLER: typeof BUYER = {
  catch: (
    <>
      <Card tone="plain" title="Handshake">
        Scammers hate one thing: a payment they can&apos;t pull back.
      </Card>
      <Bubble me delay={0.3}>Selling my iPhone 13, $200</Bubble>
      <Card tone="safe" title="Deal link ready" delay={0.8}>handshake.app/d/4tosanc</Card>
    </>
  ),
  hold: (
    <>
      <Card tone="held" title="Maya paid. $200 is held." delay={0.9}>
        Real money, held by PayPal. Not a screenshot.
      </Card>
      <Card tone="plain" title="Ship within 3 days" delay={1.2}>
        Only to her PayPal address.
      </Card>
    </>
  ),
  ship: (
    <>
      <motion.div {...pop(0)} className="rounded-2xl border border-dashed border-ink/25 bg-white p-3 font-mono text-[9.5px] leading-tight">
        UPS GROUND
        <br />
        MAYA CHEN
        <br />
        2211 N FIRST ST
        <br />
        SAN JOSE CA 95131
      </motion.div>
      <Card tone="safe" title="Label matches PayPal" delay={0.6}>
        Seller Protection stays on.
      </Card>
    </>
  ),
  claim: (
    <>
      <Card tone="plain" title="Maya reported a crack">With a photo taken on delivery.</Card>
      <Card tone="held" title="Fair fix: $40" delay={0.5}>
        Priced from real replacement screens, not a guess.
      </Card>
      <motion.div {...pop(1)} className="self-start rounded-full bg-ink px-3 py-1.5 text-[10px] text-paper">
        Accept
      </motion.div>
    </>
  ),
  settle: (
    <>
      <Card tone="safe" title="You've been paid">Sent to your PayPal.</Card>
      <motion.div {...pop(0.4)} className="space-y-1 rounded-2xl bg-white p-3">
        <Row k="Captured" v="$160.00" />
        <Row k="PayPal fee" v="−$4.63" />
        <Row k="Paid to you" v="$155.37" strong />
      </motion.div>
      <Card tone="plain" title="No dispute. No $15 fee." delay={0.8} />
    </>
  ),
};
