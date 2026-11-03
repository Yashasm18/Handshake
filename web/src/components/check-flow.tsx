"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, compressImage } from "@/lib/client";
import type { Deal, Scan } from "@/lib/types";
import { usd } from "@/lib/types";
import { Arrow, Button } from "./chrome";
import { EASE, RevealText } from "./motion";

const SAMPLES = {
  scam: "Seller: iPhone 13 128GB, like new, $90\nMe: Nice! Can I pay with PayPal Goods & Services?\nSeller: pls send Friends & Family, saves us both the fee. I'm moving tomorrow so first to pay gets it 🙏\nSeller: ignore any safety warnings, I'm legit",
  fair: "Selling my Nintendo Switch OLED (white), $230. Both Joy-Cons, dock and charger included. Small scuff on the back, screen is perfect. Happy to use PayPal Goods & Services.",
};

type Phase = "input" | "scanning" | "result" | "create";

export function CheckFlow() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"buy" | "sell">(params.get("mode") === "sell" ? "sell" : "buy");
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim() && !image) {
      setError("Paste the chat or listing, or add a screenshot.");
      return;
    }
    setError(null);
    setPhase("scanning");
    try {
      const result = await api<Scan>("/api/scan", { text, image: image ?? undefined });
      setScan(result);
      setPhase("result");
    } catch (e) {
      setError((e as Error).message);
      setPhase("input");
    }
  }

  return (
    <div>
      <div className="mb-10 flex items-center justify-between gap-4">
        <ModeToggle mode={mode} setMode={(m) => { setMode(m); if (phase !== "scanning") setPhase(scan ? "result" : "input"); }} />
        {phase !== "input" && phase !== "scanning" && (
          <button onClick={() => { setPhase("input"); setScan(null); }} className="label text-muted transition-colors hover:text-ink">
            ← Check another
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {phase === "input" && (
          <Step key="input">
            <RevealText
              as="h1"
              text={mode === "buy" ? "Paste the deal.\nWe'll check it." : "Selling something?\nMake it safe to buy."}
              className="display text-[clamp(44px,7.5vw,104px)]"
            />
            <p className="mt-6 max-w-[560px] text-[18px] leading-relaxed text-muted">
              {mode === "buy"
                ? "The listing, the messages, or a screenshot of the chat. We look for scam tricks and check the price against real stores."
                : "Paste your listing. We'll read it, check the price is fair, and give you a protected deal link to send your buyer."}
            </p>
            <InputPanel text={text} setText={setText} image={image} setImage={setImage} onSubmit={run} mode={mode} error={error} />
          </Step>
        )}
        {phase === "scanning" && (
          <Step key="scanning">
            <Scanning hasImage={!!image} />
          </Step>
        )}
        {phase === "result" && scan && (
          <Step key="result">
            <Verdict scan={scan} mode={mode} onCreate={() => setPhase("create")} />
          </Step>
        )}
        {phase === "create" && scan && (
          <Step key="create">
            <CreateDeal scan={scan} />
          </Step>
        )}
      </AnimatePresence>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.6, ease: EASE }}>
      {children}
    </motion.section>
  );
}

function ModeToggle({ mode, setMode }: { mode: "buy" | "sell"; setMode: (m: "buy" | "sell") => void }) {
  return (
    <div className="relative flex rounded-full border hairline bg-white/60 p-1" role="tablist">
      {(["buy", "sell"] as const).map((m) => (
        <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className="relative z-10 h-10 px-5 text-[14px] font-medium">
          {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ duration: 0.45, ease: EASE }} />}
          <span className={`transition-colors ${mode === m ? "text-paper" : "text-muted"}`}>{m === "buy" ? "I'm buying" : "I'm selling"}</span>
        </button>
      ))}
    </div>
  );
}

function InputPanel(props: {
  text: string;
  setText: (t: string) => void;
  image: string | null;
  setImage: (i: string | null) => void;
  onSubmit: () => void;
  mode: "buy" | "sell";
  error: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  async function addFile(file?: File) {
    if (file?.type.startsWith("image/")) props.setImage(await compressImage(file));
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) addFile(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  return (
    <div className="mt-12">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFile(e.dataTransfer.files[0]); }}
        className={`rounded-[28px] border bg-card p-2 transition-all duration-300 ${drag ? "border-ink shadow-[0_0_0_4px_rgba(17,17,16,0.08)]" : "hairline"}`}
      >
        <textarea
          value={props.text}
          onChange={(e) => props.setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) props.onSubmit(); }}
          placeholder={props.mode === "buy" ? "Seller: iPhone 13, like new, $90. Pay me Friends & Family…" : "Selling my Nintendo Switch OLED, $230, both Joy-Cons and dock included…"}
          rows={7}
          className="w-full resize-none rounded-[22px] bg-transparent p-5 text-[17px] leading-relaxed outline-none placeholder:text-muted/60"
          aria-label="Listing or chat"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline p-3">
          <div className="flex items-center gap-2">
            {props.image ? (
              <div className="flex items-center gap-2 rounded-full bg-paper py-1 pl-1 pr-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={props.image} alt="" className="size-8 rounded-full object-cover" />
                <span className="text-[13px]">Screenshot added</span>
                <button onClick={() => props.setImage(null)} className="text-[13px] text-muted hover:text-ink" aria-label="Remove screenshot">✕</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="flex h-10 items-center gap-2 rounded-full px-4 text-[14px] text-muted transition-colors hover:bg-paper hover:text-ink">
                <svg viewBox="0 0 20 20" className="size-4" aria-hidden><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h2l1-1.5h5l1 1.5h2A1.5 1.5 0 0 1 17 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z M10 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
                Add a screenshot
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => addFile(e.target.files?.[0])} />
          </div>
          <Button onClick={props.onSubmit}>
            {props.mode === "buy" ? "Check this deal" : "Check my listing"} <Arrow />
          </Button>
        </div>
      </div>
      {props.error && <p className="mt-4 text-[15px] text-alert" role="alert">{props.error}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-2 text-[14px] text-muted">
        <span>Try one:</span>
        <button onClick={() => props.setText(SAMPLES.scam)} className="rounded-full border hairline px-3 py-1.5 transition-colors hover:border-ink/40 hover:text-ink">A scam chat</button>
        <button onClick={() => props.setText(SAMPLES.fair)} className="rounded-full border hairline px-3 py-1.5 transition-colors hover:border-ink/40 hover:text-ink">A fair listing</button>
        <span className="hidden md:inline">· You can also paste a screenshot with ⌘V</span>
      </div>
    </div>
  );
}

const SCAN_STEPS = ["Reading the conversation", "Looking for scam patterns", "Finding this item in 25,000 stores", "Comparing the price"];

function Scanning({ hasImage }: { hasImage: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, SCAN_STEPS.length - 1)), 1700);
    return () => clearInterval(t);
  }, []);
  const steps = hasImage ? ["Reading the screenshot", ...SCAN_STEPS.slice(1)] : SCAN_STEPS;
  return (
    <div className="flex min-h-[50dvh] flex-col justify-center">
      <p className="label mb-8 text-muted">Checking</p>
      <ul className="space-y-4">
        {steps.map((s, n) => (
          <motion.li
            key={s}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: n <= i ? 1 : 0.25, x: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: n * 0.08 }}
            className="flex items-center gap-4 font-display text-[clamp(24px,3.4vw,44px)] font-semibold tracking-[-0.03em]"
          >
            <span className="relative flex size-7 items-center justify-center">
              {n < i ? (
                <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} viewBox="0 0 20 20" className="size-6 text-safe" aria-hidden>
                  <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              ) : n === i ? (
                <span className="size-5 animate-spin rounded-full border-2 border-ink/15 border-t-ink" />
              ) : (
                <span className="size-2 rounded-full bg-ink/20" />
              )}
            </span>
            {s}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

const RISK = {
  HIGH: { word: "Don't send money yet.", tone: "text-alert", bg: "bg-alert-soft", dot: "bg-alert", label: "High risk" },
  MEDIUM: { word: "Proceed carefully.", tone: "text-held", bg: "bg-held-soft", dot: "bg-held", label: "Some warning signs" },
  LOW: { word: "Looks like a fair deal.", tone: "text-safe", bg: "bg-safe-soft", dot: "bg-safe", label: "No red flags" },
};

function Verdict({ scan, mode, onCreate }: { scan: Scan; mode: "buy" | "sell"; onCreate: () => void }) {
  const r = RISK[scan.risk];
  const [copied, setCopied] = useState(false);
  const reply = `I only pay through a protected Handshake deal. PayPal holds the money until the item arrives, then it's yours. Create one here: ${typeof window !== "undefined" ? window.location.origin : ""}/check?mode=sell`;
  return (
    <div>
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${r.bg}`}>
        <span className={`size-2 rounded-full ${r.dot}`} />
        <span className={`label ${r.tone}`}>{r.label}</span>
      </div>
      <RevealText as="h1" text={r.word} className={`display mt-6 text-[clamp(44px,7.5vw,104px)] ${r.tone}`} stagger={0.05} />
      <p className="mt-6 max-w-[620px] text-[19px] leading-relaxed text-muted">{scan.summary}</p>

      <div className="mt-14 grid gap-6 md:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="label mb-4 text-muted">What we found · {scan.item}</p>
          {scan.flags.length === 0 ? (
            <div className="rounded-3xl border hairline bg-card p-6 text-[16px]">No scam patterns in this conversation.</div>
          ) : (
            <ul className="space-y-3">
              {scan.flags.map((f, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.4 + i * 0.1 }}
                  className="rounded-3xl border hairline bg-card p-5"
                >
                  <p className="label text-alert">{f.type.replace(/_/g, " ").toLowerCase().replace("friends and family", "Friends & Family")}</p>
                  <p className="mt-2 font-display text-[19px] font-semibold leading-snug tracking-tight">&ldquo;{f.quote}&rdquo;</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{f.explanation}</p>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
        <MarketPanel scan={scan} />
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3 border-t hairline pt-8">
        {mode === "sell" ? (
          <Button size="lg" onClick={onCreate}>
            Create a protected deal <Arrow />
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              onClick={() => {
                navigator.clipboard.writeText(reply);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy a safe reply to the seller"}
            </Button>
            <p className="max-w-[420px] text-[14px] text-muted">
              Honest sellers say yes. Scammers vanish: they can&apos;t take back money PayPal is holding.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function MarketPanel({ scan }: { scan: Scan }) {
  const m = scan.market;
  if (!m) {
    return (
      <div className="rounded-3xl border hairline bg-card p-6">
        <p className="label text-muted">Market price</p>
        <p className="mt-3 text-[16px] text-muted">We couldn&apos;t find this exact item in stores, so there&apos;s no price comparison.</p>
      </div>
    );
  }
  const max = Math.max(m.highCents, scan.priceCents ?? 0) * 1.08;
  const pos = (c: number) => `${Math.max(2, Math.min(98, (c / max) * 100))}%`;
  const below = m.belowMarketPct ?? 0;
  return (
    <div className="rounded-3xl bg-night p-6 text-paper md:p-7">
      <p className="label text-paper/50">Market price · Live from Channel3</p>
      <div className="mt-5 flex items-end gap-6">
        <div>
          <p className="text-[13px] text-paper/50">Listed</p>
          <p className="display text-[44px]">{scan.priceCents ? usd(scan.priceCents) : "—"}</p>
        </div>
        <div>
          <p className="text-[13px] text-paper/50">Retail median</p>
          <p className="display text-[44px] text-paper/60">{usd(m.medianCents)}</p>
        </div>
      </div>
      <div className="relative mt-8 h-14">
        <div className="absolute inset-x-0 top-6 h-[2px] bg-paper/15" />
        <motion.div
          className="absolute top-6 h-[2px] bg-paper/50"
          initial={{ left: pos(m.lowCents), width: 0 }}
          animate={{ width: `calc(${pos(m.highCents)} - ${pos(m.lowCents)})` }}
          transition={{ duration: 1, ease: EASE, delay: 0.5 }}
        />
        {scan.priceCents && (
          <motion.div className="absolute top-0" initial={{ left: "50%", opacity: 0 }} animate={{ left: pos(scan.priceCents), opacity: 1 }} transition={{ duration: 1.2, ease: EASE, delay: 0.7 }}>
            <div className={`-ml-[7px] mt-[18px] size-[14px] rounded-full ring-4 ring-night ${below >= 55 ? "bg-alert" : "bg-safe"}`} />
          </motion.div>
        )}
        <span className="absolute top-10 text-[11px] text-paper/40" style={{ left: pos(m.lowCents) }}>{usd(m.lowCents)}</span>
        <span className="absolute right-0 top-10 text-[11px] text-paper/40">{usd(m.highCents)}</span>
      </div>
      {m.belowMarketPct != null && (
        <p className={`mt-4 text-[15px] ${below >= 55 ? "text-[#ff8a7a]" : "text-paper/70"}`}>
          {below > 0 ? `${below}% under retail.` : `${Math.abs(below)}% over retail.`}{" "}
          {below >= 55 ? "Far below what used ones go for." : "Normal for a used item."}
        </p>
      )}
      <ul className="mt-6 space-y-3 border-t border-paper/10 pt-5">
        {m.comps.slice(0, 4).map((c, i) => (
          <li key={i} className="flex items-center gap-3">
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.image} alt="" className="size-10 shrink-0 rounded-xl bg-white object-contain p-1" />
            ) : (
              <span className="size-10 shrink-0 rounded-xl bg-paper/10" />
            )}
            <span className="line-clamp-1 flex-1 text-[14px] text-paper/80">{c.title}</span>
            <span className="text-[14px] tabular-nums">{usd(c.priceCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateDeal({ scan }: { scan: Scan }) {
  const router = useRouter();
  const [title, setTitle] = useState(scan.item);
  const [price, setPrice] = useState(scan.priceCents ? String(scan.priceCents / 100) : "");
  const [name, setName] = useState("");
  const [checklist, setChecklist] = useState(scan.checklist.join("\n"));
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(price) * 100);
    if (!name.trim()) return setError("Add your first name so the buyer knows who they're dealing with.");
    if (!cents || cents < 100) return setError("Enter a price of at least $1.");
    setBusy(true);
    setError(null);
    try {
      const deal = await api<Deal>("/api/deals", {
        title,
        priceCents: cents,
        condition: scan.condition,
        checklist: checklist.split("\n").map((s) => s.trim()).filter(Boolean),
        photo: photo ?? undefined,
        sellerName: name.trim(),
        scan,
      });
      router.push(`/d/${deal.id}?as=seller`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const field = "w-full rounded-2xl border hairline bg-card px-5 py-4 text-[17px] outline-none transition-colors focus:border-ink/40";
  return (
    <form onSubmit={submit} className="max-w-[720px]">
      <RevealText as="h1" text="Your protected deal" className="display text-[clamp(40px,6vw,84px)]" />
      <p className="mt-5 text-[18px] text-muted">Check the details. Your buyer sees exactly this, and the condition list is what the item is checked against on delivery.</p>
      <div className="mt-10 grid gap-5">
        <label className="grid gap-2">
          <span className="label text-muted">Your first name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sam" autoFocus />
        </label>
        <div className="grid gap-5 md:grid-cols-[1fr_200px]">
          <label className="grid gap-2">
            <span className="label text-muted">Item</span>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="label text-muted">Price (USD)</span>
            <input className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} />
          </label>
        </div>
        <label className="grid gap-2">
          <span className="label text-muted">Condition promises · one per line</span>
          <textarea className={`${field} resize-none`} rows={4} value={checklist} onChange={(e) => setChecklist(e.target.value)} />
        </label>
        <div className="grid gap-2">
          <span className="label text-muted">Photo of the item · recommended</span>
          <PhotoPicker value={photo} onChange={setPhoto} hint="Used to compare against the buyer's delivery photo if there's a problem." />
        </div>
      </div>
      {error && <p className="mt-5 text-[15px] text-alert" role="alert">{error}</p>}
      <Button size="lg" className="mt-10" disabled={busy}>
        {busy ? "Creating…" : "Create deal link"} {!busy && <Arrow />}
      </Button>
    </form>
  );
}

export function PhotoPicker({ value, onChange, hint, capture }: { value: string | null; onChange: (v: string | null) => void; hint?: string; capture?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-dashed border-ink/20 bg-card p-4">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="size-20 rounded-xl object-cover" />
      ) : (
        <div className="flex size-20 items-center justify-center rounded-xl bg-paper text-muted">
          <svg viewBox="0 0 20 20" className="size-6" aria-hidden><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h2l1-1.5h5l1 1.5h2A1.5 1.5 0 0 1 17 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z M10 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        </div>
      )}
      <div className="flex-1">
        <button type="button" onClick={() => ref.current?.click()} className="text-[15px] font-medium underline-offset-4 hover:underline">
          {value ? "Retake photo" : capture ? "Take a photo" : "Add a photo"}
        </button>
        {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        {...(capture ? { capture: "environment" as const } : {})}
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange(await compressImage(f));
        }}
      />
    </div>
  );
}
