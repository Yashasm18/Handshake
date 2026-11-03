"use client";

import { AnimatePresence, motion } from "motion/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { DealView as Deal } from "@/lib/types";
import { usd } from "@/lib/types";
import { Arrow, Button } from "./chrome";
import { PhotoPicker } from "./check-flow";
import { EASE } from "./motion";
import { PayPalButton } from "./paypal-button";
import { DealClock, DeadlineNotice } from "./deadline";
import { Headline, Panel } from "./deal-ui";
import { negotiatedFrom, NegotiationLive, NegotiationRecap, NoDealNotice, OfferForm } from "./negotiation";

type Role = "buyer" | "seller";

const STAGES = [
  { key: "held", label: "Paid into hold" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Checked on arrival" },
  { key: "settled", label: "Settled" },
] as const;

function stageIndex(d: Deal) {
  switch (d.status) {
    case "AWAITING_PAYMENT":
      return -1;
    case "NEGOTIATING":
    case "HELD":
      return 0;
    case "SHIPPED":
      return 1;
    case "CLAIM_OPEN":
      return 2;
    case "SETTLED":
    case "RELEASED":
      return 3;
  }
}

export function DealRoom() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const wanted = search.get("as") === "seller" ? "seller" : "buyer";
  const [deal, setDeal] = useState<Deal | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDeal(await api<Deal>(`/api/deals/${id}`));
    } catch {
      setMissing(true);
    }
  }, [id]);

  // Light polling keeps buyer and seller screens in sync without websockets; faster while agents talk.
  const live = deal?.status === "NEGOTIATING";
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, live ? 900 : 2500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, live]);

  const act = useCallback(
    async (action: string, body: unknown = {}) => {
      setBusy(action);
      setError(null);
      try {
        const res = await api<Deal | { blocked: boolean }>(`/api/deals/${id}/${action}`, body);
        await refresh();
        return res;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [id, refresh],
  );

  const onHeld = useCallback(() => { refresh(); }, [refresh]);
  const onPayError = useCallback((m: string) => setError(m), []);

  if (missing) {
    return (
      <div className="py-24">
        <h1 className="display text-[64px]">Deal not found.</h1>
        <p className="mt-4 text-muted">The link may be wrong, or the demo server restarted.</p>
        <Button href="/check" className="mt-8">Start a new deal</Button>
      </div>
    );
  }
  if (!deal) return <Skeleton />;

  // Roles come from the server's cookie check. A visitor can become the buyer only while the deal is unpaid.
  const held: Role[] = [...(deal.viewer.buyer ? ["buyer" as const] : []), ...(deal.viewer.seller ? ["seller" as const] : [])];
  const canPay = deal.status === "AWAITING_PAYMENT" && !deal.viewer.seller;
  const role: Role | null = held.includes(wanted) ? wanted : (held[0] ?? (canPay || deal.status === "AWAITING_PAYMENT" ? "buyer" : null));
  const stage = stageIndex(deal);
  const counterpart = role === "seller" ? "your buyer" : deal.sellerName;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="label text-muted">
          Protected deal · {deal.id} {deal.demo && "· Demo"}
        </p>
        {held.length > 1 && role && <RoleSwitch role={role} onChange={(r) => router.replace(`/d/${deal.id}?as=${r}`, { scroll: false })} />}
        {held.length === 1 && <span className="label rounded-full border hairline px-3 py-1.5 text-muted">You&apos;re the {held[0]}</span>}
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE }} className="display text-[clamp(40px,6.5vw,96px)]">
          {deal.title}
        </motion.h1>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.1 }} className="md:text-right">
          {negotiatedFrom(deal) != null && <p className="text-[18px] text-muted line-through decoration-1 md:text-right">{usd(negotiatedFrom(deal)!)}</p>}
          <p className="display text-[clamp(40px,5vw,72px)]">{usd(deal.priceCents)}</p>
          <p className="text-[15px] text-muted">Sold by {deal.sellerName}</p>
        </motion.div>
      </div>

      <Progress stage={stage} released={deal.status === "RELEASED"} />

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <AnimatePresence mode="wait">
            <motion.div key={`${deal.status}-${role}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.5, ease: EASE }}>
              {role ? (
                <ActionCard deal={deal} role={role} counterpart={counterpart} act={act} busy={busy} onHeld={onHeld} onPayError={onPayError} />
              ) : (
                <Panel>
                  <Headline eyebrow="Private deal" title={`This deal is between ${deal.sellerName} and a buyer.`} body="Only the two of them can take action here. If it's yours, open it in the browser you used to create it or pay for it." />
                </Panel>
              )}
            </motion.div>
          </AnimatePresence>
          {role && <DeadlineNotice deal={deal} role={role} />}
          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 rounded-2xl bg-alert-soft px-5 py-4 text-[15px] text-alert" role="alert">
              {error}
            </motion.p>
          )}
        </div>
        <aside className="space-y-6">
          {role && <NegotiationRecap deal={deal} role={role} />}
          {role && <DealClock deal={deal} />}
          <DealFacts deal={deal} />
          <Ledger deal={deal} />
          <Activity deal={deal} />
        </aside>
      </div>
    </div>
  );
}

function RoleSwitch({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="label hidden text-muted sm:inline">Viewing as</span>
      <div className="relative flex rounded-full border hairline bg-card/60 p-1">
        {(["buyer", "seller"] as const).map((r) => (
          <button key={r} onClick={() => onChange(r)} className="relative z-10 h-9 px-4 text-[13px] font-medium capitalize">
            {role === r && <motion.span layoutId="role-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ duration: 0.4, ease: EASE }} />}
            <span className={role === r ? "text-paper" : "text-muted"}>{r}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Progress({ stage, released }: { stage: number; released: boolean }) {
  return (
    <div className="mt-12 grid grid-cols-4 gap-2 md:gap-3">
      {STAGES.map((s, i) => {
        const done = !released && i <= stage;
        return (
          <div key={s.key}>
            <div className="h-1 overflow-hidden rounded-full bg-ink/10">
              <motion.div className={`h-full ${released ? "bg-muted" : "bg-ink"}`} initial={false} animate={{ width: done ? "100%" : "0%" }} transition={{ duration: 0.9, ease: EASE, delay: i * 0.08 }} />
            </div>
            <p className={`label mt-3 hidden transition-colors sm:block ${done ? "text-ink" : "text-muted/70"}`}>{s.label}</p>
          </div>
        );
      })}
    </div>
  );
}

type ActProps = {
  deal: Deal;
  role: Role;
  counterpart: string;
  act: (action: string, body?: unknown) => Promise<unknown>;
  busy: string | null;
  onHeld: () => void;
  onPayError: (m: string) => void;
};

function ActionCard(p: ActProps) {
  const { deal, role } = p;
  switch (deal.status) {
    case "AWAITING_PAYMENT":
      return role === "buyer" ? <BuyerPay {...p} /> : <SellerWaitingPayment {...p} />;
    case "NEGOTIATING":
      return <NegotiationLive deal={deal} role={role} />;
    case "HELD":
      return role === "seller" ? <SellerShip {...p} /> : <BuyerWaitingShip {...p} />;
    case "SHIPPED":
      return role === "buyer" ? <BuyerInspect {...p} /> : (
        <Panel>
          <Headline eyebrow="On its way" title={`Shipped. ${usd(deal.priceCents)} is still held for you.`} body={`Once ${deal.paypal.buyerEmail ? "the buyer" : "your buyer"} confirms it arrived as described, the money is captured and paid straight to your PayPal.`} />
          <TrackingChip deal={deal} />
        </Panel>
      );
    case "CLAIM_OPEN":
      return <ClaimCard {...p} />;
    case "SETTLED":
      return <Settled {...p} />;
    case "RELEASED":
      return (
        <Panel>
          <Headline eyebrow="Cancelled" title="Deal cancelled. Nobody paid." body={`The ${usd(deal.priceCents)} hold was released back to the buyer in full. No fees on either side.`} />
        </Panel>
      );
  }
}

function BuyerPay(p: ActProps) {
  const { deal, act, busy, onHeld, onPayError } = p;
  const [mode, setMode] = useState<"pay" | "offer">("pay");
  const offer = deal.acceptsOffers && mode === "offer";
  return (
    <Panel>
      <NoDealNotice deal={deal} />
      {deal.acceptsOffers && (
        <div className="mb-7 inline-flex rounded-full border hairline bg-paper p-1" role="tablist">
          {(["pay", "offer"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className="relative z-10 h-10 px-5 text-[14px] font-medium">
              {mode === m && <motion.span layoutId="pay-mode" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ duration: 0.4, ease: EASE }} />}
              <span className={mode === m ? "text-paper" : "text-muted"}>{m === "pay" ? `Pay ${usd(deal.priceCents)}` : "Make an offer"}</span>
            </button>
          ))}
        </div>
      )}
      <Headline
        eyebrow={offer ? "Agent negotiation" : "Pay safely"}
        title={offer ? "Let your agent negotiate" : `Pay ${usd(deal.priceCents)} into a PayPal hold`}
        body={
          offer ? (
            <>Set your secret max. Your AI agent haggles with {deal.sellerName}&apos;s agent using real market prices, and it can never go above your number.</>
          ) : (
            <>PayPal reserves the money but doesn&apos;t send it. {deal.sellerName} can see it&apos;s real, and you&apos;re only charged once the item arrives as described.</>
          )
        }
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={offer ? "offer" : "pay"} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }} className="mt-6">
          {offer ? (
            <OfferForm deal={deal} act={act} busy={busy} onHeld={onHeld} onPayError={onPayError} />
          ) : (
            <>
              <ul className="space-y-2 text-[15px]">
                {["Not charged until delivery is confirmed", "Damaged? Settle with a partial refund in minutes", "Seller never ships? The hold is released in full"].map((t) => (
                  <li key={t} className="flex items-center gap-3">
                    <span className="flex size-5 items-center justify-center rounded-full bg-safe-soft text-safe">
                      <svg viewBox="0 0 12 12" className="size-3" aria-hidden><path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 max-w-[420px]">
                <PayPalButton dealId={deal.id} onHeld={onHeld} onError={onPayError} />
                <button onClick={() => act("test-card")} disabled={!!busy} className="mt-4 w-full text-center text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">
                  {busy === "test-card" ? "Placing hold…" : "Judging? Skip login and pay with PayPal's sandbox test card"}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Panel>
  );
}

function SellerWaitingPayment({ deal, act, busy }: ActProps) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/d/${deal.id}` : `/d/${deal.id}`;
  return (
    <Panel tone="dark">
      <Headline eyebrow="Step 1 · Share" title="Send this link to your buyer" body="They'll pay into a PayPal hold. You'll see it here the moment the money is reserved, and only then should you ship." />
      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl bg-paper/10 p-2 pl-5">
        <span className="flex-1 truncate font-mono text-[14px] text-paper/80">{link}</span>
        <Button
          variant="light"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {deal.floorCents != null && (
        <p className="mt-6 text-[15px] text-paper/70">
          Open to offers. Your agent negotiates for you and never accepts less than <span className="font-semibold text-paper">{usd(deal.floorCents)}</span>. Only you can see that number.
        </p>
      )}
      <p className="mt-6 flex items-center gap-3 text-[15px] text-paper/60">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-held opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-held" />
        </span>
        Waiting for payment
      </p>
      <button onClick={() => act("cancel", { role: "seller" })} disabled={!!busy} className="mt-8 text-[14px] text-paper/50 hover:text-paper">
        Cancel this deal
      </button>
    </Panel>
  );
}

function BuyerWaitingShip({ deal, act, busy }: ActProps) {
  return (
    <Panel tone="held">
      <Headline eyebrow="Held by PayPal" title={`${usd(deal.priceCents)} is held. You haven't been charged.`} body={`${deal.sellerName} has been told to ship to your PayPal address${deal.shipTo?.line ? `: ${deal.shipTo.line}` : ""}.`} />
      <Button variant="ghost" className="mt-8" disabled={!!busy} onClick={() => act("cancel", { role: "buyer" })}>
        {busy === "cancel" ? "Releasing…" : "Cancel and release my money"}
      </Button>
    </Panel>
  );
}

const CARRIERS = ["USPS", "UPS", "FEDEX", "DHL"];

function SellerShip({ deal, act, busy }: ActProps) {
  const [label, setLabel] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("UPS");
  const [tracking, setTracking] = useState("");
  const blocked = deal.shipment?.labelCheck && !deal.shipment.labelCheck.match;
  return (
    <Panel>
      <Headline eyebrow="Step 2 · Ship" title={`${usd(deal.priceCents)} is held for you. Ship it.`} body="Snap the shipping label before you drop it off. We check it against the buyer's PayPal-verified address, because shipping anywhere else voids Seller Protection." />
      {deal.shipTo && (
        <div className="mt-6 rounded-2xl bg-paper p-5">
          <p className="label text-muted">Ship only to</p>
          <p className="mt-2 text-[17px] font-medium">{deal.shipTo.name}</p>
          <p className="text-[16px] text-muted">{deal.shipTo.line}</p>
        </div>
      )}
      {blocked && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-2xl bg-alert-soft p-5">
          <p className="label text-alert">Stopped</p>
          <p className="mt-2 text-[16px] font-medium">{deal.shipment!.labelCheck!.reason}</p>
          <p className="mt-1 text-[14px] text-muted">Label reads: {deal.shipment!.labelCheck!.read}</p>
        </motion.div>
      )}
      <div className="mt-6 space-y-4">
        <PhotoPicker value={label} onChange={setLabel} capture hint="We read the address and tracking number for you. A matching label also lets you be paid automatically if the buyer goes quiet." />
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="h-14 rounded-2xl border hairline bg-card px-4 text-[16px] outline-none" aria-label="Carrier">
            {CARRIERS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number (optional with a label photo)" className="h-14 rounded-2xl border hairline bg-card px-5 text-[16px] outline-none focus:border-ink/40" />
        </div>
      </div>
      <Button size="lg" className="mt-8" disabled={!!busy || (!label && !tracking)} onClick={() => act("ship", { label: label ?? undefined, carrier, trackingNumber: tracking })}>
        {busy === "ship" ? (label ? "Reading the label…" : "Saving…") : "Mark as shipped"} {!busy && <Arrow />}
      </Button>
    </Panel>
  );
}

function TrackingChip({ deal }: { deal: Deal }) {
  if (!deal.shipment) return null;
  return (
    <div className="mt-6 inline-flex flex-wrap items-center gap-3 rounded-full bg-paper px-4 py-2 text-[14px]">
      <span className="label text-muted">{deal.shipment.carrier}</span>
      <span className="font-mono">{deal.shipment.trackingNumber}</span>
      {deal.shipment.labelCheck?.match && <span className="text-safe">● Address verified</span>}
    </div>
  );
}

function BuyerInspect({ deal, act, busy }: ActProps) {
  const [reporting, setReporting] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  if (reporting) {
    return (
      <Panel>
        <Headline eyebrow="Report a problem" title="Show us what's wrong" body="Take a photo now, on delivery. We compare it with the listing and price the fix from real replacement parts. Your money stays held while you decide." />
        <div className="mt-6 space-y-4">
          <PhotoPicker value={photo} onChange={setPhoto} capture hint="A clear photo of the damage or the missing part." />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What's different from the listing?" className="w-full resize-none rounded-2xl border hairline bg-card p-5 text-[16px] outline-none focus:border-ink/40" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" disabled={!!busy || !photo || note.trim().length < 3} onClick={() => act("claim", { photo, note })}>
            {busy === "claim" ? "Reviewing the photo…" : "Get a fair outcome"} {!busy && <Arrow />}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setReporting(false)}>Back</Button>
        </div>
      </Panel>
    );
  }
  return (
    <Panel>
      <Headline eyebrow="Step 3 · Check it" title="Did it arrive as described?" body={`${usd(deal.priceCents)} is still held. Check it against what ${deal.sellerName} promised:`} />
      {deal.checklist.length > 0 && (
        <ul className="mt-6 space-y-2">
          {deal.checklist.map((c) => (
            <li key={c} className="flex gap-3 rounded-2xl bg-paper px-5 py-3.5 text-[16px]">
              <span className="text-muted">□</span>
              {c}
            </li>
          ))}
        </ul>
      )}
      <TrackingChip deal={deal} />
      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" disabled={!!busy} onClick={() => act("deliver")}>
          {busy === "deliver" ? "Releasing payment…" : "Yes, release payment"}
        </Button>
        <Button size="lg" variant="ghost" onClick={() => setReporting(true)}>Report a problem</Button>
      </div>
    </Panel>
  );
}

function ClaimCard({ deal, role, act, busy }: ActProps) {
  const c = deal.claim!;
  const mine = role === "buyer" ? c.buyerAccepted : c.sellerAccepted;
  const theirs = role === "buyer" ? c.sellerAccepted : c.buyerAccepted;
  const other = role === "buyer" ? deal.sellerName : "the buyer";
  return (
    <Panel>
      <Headline
        eyebrow="Fair outcome · Proposed by Handshake"
        title={c.refundCents ? `${usd(c.refundCents)} back to the buyer. ${usd(c.captureCents)} to ${deal.sellerName}.` : "No difference found. Full payment goes to the seller."}
        body={c.finding}
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-[160px_1fr]">
        {c.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo} alt="Buyer's delivery photo" className="aspect-square w-full rounded-2xl object-cover" />
        )}
        <div className="space-y-3 rounded-2xl bg-paper p-5 text-[15px]">
          <p className="label text-muted">How we priced it</p>
          <p>
            Affected: <b>{c.damagedPart}</b>
          </p>
          {c.partPriceCents ? (
            <p>
              Replacement: <b>{usd(c.partPriceCents)}</b> median across stores
              {c.partComp?.url && (
                <>
                  {" · "}
                  <a href={c.partComp.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">see one</a>
                </>
              )}
            </p>
          ) : (
            <p className="text-muted">No replacement part found, so a capped share of the price is used.</p>
          )}
          <p className="text-muted">Refunds are capped by severity and can never exceed what was paid. The amount is calculated in code, never by the AI.</p>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {mine ? (
          <p className="flex items-center gap-3 text-[16px]">
            <span className="size-2.5 animate-pulse rounded-full bg-held" /> You accepted. Waiting for {other}.
          </p>
        ) : (
          <>
            <Button size="lg" disabled={!!busy} onClick={() => act("respond", { role, accept: true })}>
              {busy === "respond" ? "Settling with PayPal…" : "Accept"}
            </Button>
            <Button size="lg" variant="ghost" disabled={!!busy} onClick={() => act("respond", { role, accept: false })}>
              Decline
            </Button>
          </>
        )}
        {theirs && !mine && <p className="text-[15px] text-safe">● {other[0].toUpperCase() + other.slice(1)} already accepted</p>}
      </div>
    </Panel>
  );
}

function Settled({ deal, role }: ActProps) {
  const pp = deal.paypal;
  const released = deal.priceCents - (pp.capturedCents ?? deal.priceCents);
  return (
    <Panel tone="safe">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: EASE }} className="flex size-14 items-center justify-center rounded-full bg-safe text-paper">
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden><motion.path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, delay: 0.3 }} /></svg>
      </motion.div>
      <Headline
        eyebrow="Settled"
        tone="text-safe"
        title={role === "buyer" ? (released > 0 ? `Done. ${usd(released)} came back to you.` : "Done. Enjoy it.") : `You've been paid ${usd(pp.payoutCents ?? 0)}.`}
        body={role === "buyer" ? "No dispute, no waiting. The unused part of the hold was released automatically." : "Sent to your PayPal account. Tracking is attached to the payment for Seller Protection."}
      />
      <dl className="mt-8 space-y-3 rounded-2xl bg-card p-6 text-[16px]">
        <Line k="Held" v={usd(deal.priceCents)} />
        {released > 0 && <Line k="Released to buyer" v={`−${usd(released)}`} />}
        <Line k="Captured" v={usd(pp.capturedCents ?? 0)} />
        <Line k="PayPal fee" v={`−${usd(pp.feeCents ?? 0)}`} />
        <div className="border-t hairline pt-3">
          <Line k={`Paid to ${deal.sellerName}`} v={usd(pp.payoutCents ?? 0)} strong />
        </div>
      </dl>
    </Panel>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

function DealFacts({ deal }: { deal: Deal }) {
  const m = deal.scan?.market;
  return (
    <div className="rounded-[28px] border hairline bg-card p-6">
      <p className="label text-muted">The deal</p>
      {deal.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={deal.photo} alt={deal.title} className="mt-4 aspect-[4/3] w-full rounded-2xl object-cover" />
      )}
      {deal.checklist.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-[15px]">
          {deal.checklist.map((c) => <li key={c}>— {c}</li>)}
        </ul>
      )}
      {m && (
        <p className="mt-5 border-t hairline pt-4 text-[14px] text-muted">
          Retail median {usd(m.medianCents)} across {m.comps.length} stores. This deal is{" "}
          {m.belowMarketPct != null && m.belowMarketPct > 0 ? `${m.belowMarketPct}% under retail` : "at or above retail"}.
        </p>
      )}
      {deal.scan && (
        <p className={`mt-3 text-[14px] ${deal.scan.risk === "LOW" ? "text-safe" : deal.scan.risk === "MEDIUM" ? "text-held" : "text-alert"}`}>
          ● Scam check: {deal.scan.risk === "LOW" ? "no red flags" : `${deal.scan.flags.length} warning${deal.scan.flags.length === 1 ? "" : "s"}`}
        </p>
      )}
    </div>
  );
}

function Ledger({ deal }: { deal: Deal }) {
  const pp = deal.paypal;
  const rows = [
    ["Order", pp.orderId],
    ["Authorization (hold)", pp.authorizationId],
    ["Capture", pp.captureId],
    ["Payout batch", pp.payoutBatchId],
  ].filter(([, v]) => v) as [string, string][];
  if (!rows.length) return null;
  return (
    <div className="island rounded-[28px] bg-night p-6 text-paper">
      <p className="label text-paper/50">PayPal sandbox record</p>
      <dl className="mt-4 space-y-3">
        {rows.map(([k, v]) => (
          <motion.div key={k} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex justify-between gap-4 text-[13px]">
            <dt className="text-paper/50">{k}</dt>
            <dd className="truncate font-mono">{v}</dd>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}

function Activity({ deal }: { deal: Deal }) {
  const who = { buyer: "Buyer", seller: deal.sellerName, handshake: "Handshake", paypal: "PayPal" };
  return (
    <div className="rounded-[28px] border hairline bg-card p-6">
      <p className="label text-muted">Activity</p>
      <ol className="mt-4 space-y-4">
        {[...deal.events].reverse().map((e, i) => (
          <motion.li key={`${e.at}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="grid grid-cols-[76px_1fr] gap-3 text-[14px]">
            <span className="label pt-0.5 text-muted">{who[e.actor]}</span>
            <span className="font-serif leading-snug [font-size-adjust:0.52]">{e.text}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-48 rounded bg-ink/10" />
      <div className="mt-8 h-20 w-2/3 rounded-2xl bg-ink/10" />
      <div className="mt-12 h-72 rounded-[28px] bg-ink/5" />
    </div>
  );
}
