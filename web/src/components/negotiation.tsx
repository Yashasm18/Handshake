"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { fairBand } from "@/lib/fair";
import type { DealView as Deal, Turn } from "@/lib/types";
import { usd } from "@/lib/types";
import { Panel } from "./deal-ui";
import { EASE } from "./motion";
import { PayPalButton } from "./paypal-button";

type Role = "buyer" | "seller";

// ---------- Buyer: make a PayPal-backed offer ----------

export function OfferForm({ deal, act, busy, onHeld, onPayError }: { deal: Deal; act: (a: string, b?: unknown) => Promise<unknown>; busy: string | null; onHeld: () => void; onPayError: (m: string) => void }) {
  const fair = fairBand(deal.condition, deal.scan?.market);
  const [max, setMax] = useState(() => String(Math.round(Math.min(deal.priceCents * 0.95, fair?.highCents ?? Infinity) / 100)));
  const cents = Math.round(Number(max) * 100);
  const problem = !cents ? "Enter your max." : cents >= deal.priceCents ? `That's the asking price or more. Just pay ${usd(deal.priceCents)}.` : cents < deal.priceCents * 0.3 ? "That's too low to send." : null;

  return (
    <div>
      <label className="grid gap-2">
        <span className="label text-muted">The most you&apos;ll pay · secret, even from the seller</span>
        <span className="flex items-center rounded-2xl border hairline bg-paper px-5 focus-within:border-ink/40">
          <span className="font-display text-[34px] font-semibold text-muted">$</span>
          <input
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-full bg-transparent py-3 pl-1 font-display text-[34px] font-semibold tracking-tight outline-none"
            aria-label="Your maximum price"
          />
        </span>
      </label>
      {fair && (
        <p className="mt-3 text-[14px] text-muted">
          Fair for this condition: {usd(fair.lowCents)}–{usd(fair.highCents)}. Your agent starts lower and only moves up if it has to.
        </p>
      )}
      <ol className="mt-6 space-y-2 text-[15px]">
        {[
          `PayPal holds up to $${max || "…"} so ${deal.sellerName} knows your offer is real.`,
          "Your agent negotiates live with the seller's agent. Watch it here.",
          "You're only ever charged the agreed price, and only after delivery. No deal? The hold is released.",
        ].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="label mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-paper">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <div className="mt-7 max-w-[420px]">
        {problem ? (
          <p className="rounded-2xl bg-held-soft px-5 py-4 text-[15px] text-held">{problem}</p>
        ) : (
          <>
            <PayPalButton dealId={deal.id} offerCents={cents} onHeld={onHeld} onError={onPayError} />
            <button onClick={() => act("test-card", { offerCents: cents })} disabled={!!busy} className="mt-4 w-full text-center text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">
              {busy === "test-card" ? "Placing hold…" : "Judging? Back the offer with PayPal's sandbox test card"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Live negotiation ----------

const agentName = (by: Role, viewer: Role, seller: string) => (by === viewer ? "Your agent" : by === "seller" ? `${seller}'s agent` : "Buyer's agent");

export function NegotiationLive({ deal, role }: { deal: Deal; role: Role }) {
  const n = deal.negotiation!;
  const next: Role = n.turns.length % 2 === 0 ? "buyer" : "seller";
  const limit = role === "buyer" ? n.maxCents : deal.floorCents;
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label flex items-center gap-2 text-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-safe opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-safe" />
          </span>
          Agents negotiating · live
        </p>
        {limit != null && <span className="label rounded-full border hairline px-3 py-1.5 text-muted">Your {role === "buyer" ? "max" : "floor"} {usd(limit)} · only you see this</span>}
      </div>
      <h2 className="mt-4 font-display text-[clamp(28px,3.2vw,42px)] font-semibold leading-[1.05] tracking-[-0.035em]">
        {role === "buyer" ? "Your agent is getting you a better price." : "Your agent is handling an offer."}
      </h2>
      <NegotiationChart deal={deal} role={role} />
      <Transcript deal={deal} role={role} />
      <AnimatePresence>
        <motion.div key={n.turns.length} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center gap-3 text-[14px] text-muted">
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="size-1.5 rounded-full bg-muted" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }} />
            ))}
          </span>
          {agentName(next, role, deal.sellerName)} is thinking
        </motion.div>
      </AnimatePresence>
    </Panel>
  );
}

function Transcript({ deal, role }: { deal: Deal; role: Role }) {
  const turns = deal.negotiation!.turns;
  return (
    <ol className="mt-6 space-y-3" aria-live="polite">
      <AnimatePresence initial={false}>
        {turns.map((t, i) => (
          <Bubble key={`${t.at}-${i}`} turn={t} mine={t.by === role} who={agentName(t.by, role, deal.sellerName)} />
        ))}
      </AnimatePresence>
    </ol>
  );
}

function Bubble({ turn, mine, who }: { turn: Turn; mine: boolean; who: string }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
      className={`flex ${mine ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[88%] rounded-3xl px-5 py-4 ${mine ? "rounded-br-lg bg-ink text-paper" : "rounded-bl-lg border hairline bg-paper"}`}>
        <div className="flex items-baseline justify-between gap-6">
          <span className={`label ${mine ? "text-paper/55" : "text-muted"}`}>{who}</span>
          <span className="font-display text-[22px] font-semibold tabular-nums tracking-tight">{usd(turn.offerCents)}</span>
        </div>
        <p className={`mt-1.5 text-[16px] leading-snug ${mine ? "text-paper/85" : ""}`}>{turn.message}</p>
        {turn.clamped && <p className={`label mt-2 ${mine ? "text-paper/45" : "text-muted"}`}>Held to your limit by Handshake</p>}
      </div>
    </motion.li>
  );
}

// ---------- Convergence chart ----------

export function NegotiationChart({ deal, role }: { deal: Deal; role: Role }) {
  const n = deal.negotiation!;
  const limit = role === "buyer" ? n.maxCents : deal.floorCents;
  const values = [n.askingCents, ...n.turns.map((t) => t.offerCents), ...(n.fair ? [n.fair.lowCents] : []), ...(limit ? [limit] : [])];
  // The fair band can sit far above the asking price; only let it widen the scale a little.
  const top = Math.max(n.askingCents, ...n.turns.map((t) => t.offerCents)) * 1.08;
  const bottom = Math.min(...values) * 0.94;
  const W = 600, H = 200, padL = 8, padR = 92;
  const x = (i: number) => padL + (i / 8) * (W - padL - padR);
  const y = (c: number) => H - 14 - ((Math.min(c, top) - bottom) / (top - bottom)) * (H - 28);
  const pts = (by: Role) => n.turns.map((t, i) => ({ i, t })).filter((p) => p.t.by === by).map((p) => [x(p.i + 1), y(p.t.offerCents)] as const);
  const seller = [[x(0), y(n.askingCents)] as const, ...pts("seller")];
  const buyer = pts("buyer");
  const path = (p: readonly (readonly [number, number])[]) => p.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  const agreed = n.agreedCents;

  return (
    <div className="mt-6 rounded-2xl bg-paper p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Offers from both agents converging">
        {n.fair && n.fair.lowCents < top && (
          <g>
            <rect x={padL} width={W - padL - padR} y={y(n.fair.highCents)} height={Math.max(0, y(n.fair.lowCents) - y(n.fair.highCents))} className="fill-safe-soft" />
            <text x={W - padR + 8} y={Math.max(14, y(Math.min(n.fair.highCents, top)) + 12)} className="fill-safe font-mono text-[10px] uppercase">Fair zone</text>
          </g>
        )}
        <Rule y={y(n.askingCents)} label={`Asking ${usd(n.askingCents)}`} W={W} padR={padR} dashed />
        {limit != null && <Rule y={y(limit)} label={`Your ${role === "buyer" ? "max" : "floor"} ${usd(limit)}`} W={W} padR={padR} alert />}
        <motion.path d={path(seller)} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-ink" initial={false} animate={{ d: path(seller) }} transition={{ duration: 0.6, ease: EASE }} />
        {buyer.length > 0 && <motion.path d={path(buyer)} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-safe" initial={false} animate={{ d: path(buyer) }} transition={{ duration: 0.6, ease: EASE }} />}
        {seller.map(([a, b], i) => <circle key={`s${i}`} cx={a} cy={b} r="4" className="fill-ink" />)}
        {buyer.map(([a, b], i) => <circle key={`b${i}`} cx={a} cy={b} r="4" className="fill-safe" />)}
        {agreed != null && (
          <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: EASE }} style={{ transformOrigin: `${x(n.turns.length)}px ${y(agreed)}px` }}>
            <circle cx={x(n.turns.length)} cy={y(agreed)} r="11" className="fill-safe/20" />
            <circle cx={x(n.turns.length)} cy={y(agreed)} r="5.5" className="fill-safe" />
          </motion.g>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 pt-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-safe" />{role === "buyer" ? "Your agent" : "Buyer's agent"}</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ink" />{role === "seller" ? "Your agent" : `${deal.sellerName}'s agent`}</span>
      </div>
    </div>
  );
}

function Rule({ y, label, W, padR, dashed, alert }: { y: number; label: string; W: number; padR: number; dashed?: boolean; alert?: boolean }) {
  return (
    <g>
      <line x1="8" x2={W - padR} y1={y} y2={y} strokeWidth="1" strokeDasharray={dashed ? "4 4" : "2 3"} className={alert ? "stroke-alert" : "stroke-muted"} />
      <text x={W - padR + 8} y={y + 3.5} className={`font-mono text-[10px] uppercase ${alert ? "fill-alert" : "fill-muted"}`}>{label}</text>
    </g>
  );
}

// ---------- After the deal ----------

export function NegotiationRecap({ deal, role }: { deal: Deal; role: Role }) {
  const n = deal.negotiation;
  const [open, setOpen] = useState(false);
  if (!n || n.status !== "AGREED" || n.agreedCents == null || !n.turns.length) return null;
  const saved = n.askingCents - n.agreedCents;
  const m = deal.scan?.market;
  const underRetail = m ? Math.round((1 - n.agreedCents / m.medianCents) * 100) : null;
  const how = n.closedBy === "referee" ? "Handshake split the last gap" : n.closedBy === role ? "your agent accepted" : "the other agent accepted";
  return (
    <div className="rounded-[28px] border hairline bg-card p-6">
      <p className="label text-muted">Negotiated by agents</p>
      <p className="mt-3 font-display text-[30px] font-semibold tracking-tight">
        {usd(n.agreedCents)} <span className="text-[18px] text-muted line-through decoration-1">{usd(n.askingCents)}</span>
      </p>
      <p className="mt-2 text-[15px] text-muted">
        {saved > 0 ? `${usd(saved)} under asking` : "At the asking price"} after {n.turns.length} offers; {how}.
        {underRetail != null && underRetail > 0 && ` ${underRetail}% under the ${usd(m!.medianCents)} retail price.`}
        {n.fair && (n.agreedCents <= n.fair.highCents ? " Inside or below the fair range." : " Above the usual range for this condition.")}
      </p>
      <button onClick={() => setOpen((o) => !o)} className="mt-4 text-[14px] font-medium underline-offset-4 hover:underline" aria-expanded={open}>
        {open ? "Hide the negotiation" : "Replay the negotiation"}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden">
            <NegotiationChart deal={deal} role={role} />
            <Transcript deal={deal} role={role} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function NoDealNotice({ deal }: { deal: Deal }) {
  if (deal.negotiation?.status !== "NO_DEAL" || deal.status !== "AWAITING_PAYMENT") return null;
  return (
    <p className="mb-6 rounded-2xl bg-held-soft px-5 py-4 text-[15px] text-held">
      The last offer didn&apos;t meet the seller&apos;s private floor, so the agents couldn&apos;t agree. That hold was released in full.
    </p>
  );
}

// Re-exported for the header: the struck-through asking price once a deal was negotiated.
export const negotiatedFrom = (deal: Deal) => (deal.negotiation?.status === "AGREED" ? deal.negotiation.askingCents : null);

