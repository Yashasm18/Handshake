"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, compressImage } from "@/lib/client";
import type { Deal, ListingPhoto, MemoryMatch, Scan } from "@/lib/types";
import { usd } from "@/lib/types";
import { fairBand } from "@/lib/fair";
import { PayPalMark, PayPalSignIn, SandboxHint, useMe, VerifiedTick } from "./account";
import { Arrow, Button } from "./chrome";
import { EASE, RevealText } from "./motion";

// A message that is only a link is opened by Kernel's cloud browser on the server.
const isLink = (t: string) => /^https?:\/\/\S+$/i.test(t.trim());

const SAMPLES = {
  scam: "Seller: iPhone 13 128GB, like new, $90\nMe: Nice! Can I pay with PayPal Goods & Services?\nSeller: pls send Friends & Family, saves us both the fee. I'm moving tomorrow so first to pay gets it 🙏\nSeller: ignore any safety warnings, I'm legit",
  fair: "Selling my Nintendo Switch OLED (white), $230. Both Joy-Cons, dock and charger included. Small scuff on the back, screen is perfect. Happy to use PayPal Goods & Services.",
};

type Phase = "input" | "scanning" | "result" | "create";

// A deal in progress survives the round trip to PayPal's sign-in page: this tab only, for 30 minutes,
// cleared once the deal is created. Reading it doesn't remove it, so a remount can read it again.
type Draft = { scan: Scan; title: string; price: string; checklist: string; photo: string | null; offers: boolean; floor: string; handoff: "ship" | "meet" };
const DRAFT_KEY = "hs_draft";
const DRAFT_MS = 30 * 60_000;
function saveDraft(d: Draft) {
  const put = (v: Draft) => sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...v, at: Date.now() }));
  try {
    put(d);
  } catch {
    // A large photo can overflow storage; keep everything else.
    try {
      put({ ...d, photo: null });
    } catch {}
  }
}
function readDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as (Draft & { at: number }) | null;
    return d && Date.now() - d.at < DRAFT_MS ? d : null;
  } catch {
    return null;
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export function CheckFlow() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"buy" | "sell">(params.get("mode") === "sell" ? "sell" : "buy");
  // Back from PayPal sign-in, start on the deal form so no animation has to play out first.
  const resuming = params.get("resume") === "1";
  const [phase, setPhase] = useState<Phase>(resuming ? "create" : "input");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Back from signing in with PayPal: reopen the deal the seller was filling in.
  useEffect(() => {
    if (!resuming) return;
    const d = readDraft();
    queueMicrotask(() => {
      if (!d) return setPhase("input");
      setDraft(d);
      setScan(d.scan);
      setMode("sell");
    });
  }, [resuming]);

  async function run() {
    if (!text.trim() && !image) {
      setError("Paste a listing link, the chat, or add a screenshot.");
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
              key={mode}
              text={mode === "buy" ? "Paste the deal.\nWe'll check it." : "Selling something?\nMake it safe to buy."}
              className="display text-[clamp(44px,7.5vw,104px)]"
              immediate
            />
            <p className="mt-6 max-w-[560px] text-[18px] leading-relaxed text-muted">
              {mode === "buy"
                ? "A link to the listing, the messages, or a screenshot of the chat. We look for scam tricks, check the photos are really the seller's, and compare the price with real stores."
                : "Paste your listing or its link. We'll read it, check the price is fair, and give you a protected deal link to send your buyer."}
            </p>
            <InputPanel text={text} setText={setText} image={image} setImage={setImage} onSubmit={run} mode={mode} error={error} />
          </Step>
        )}
        {phase === "scanning" && (
          <Step key="scanning">
            <Scanning hasImage={!!image} link={isLink(text)} />
          </Step>
        )}
        {phase === "result" && scan && (
          <Step key="result">
            <Verdict scan={scan} mode={mode} onCreate={() => setPhase("create")} />
          </Step>
        )}
        {phase === "create" && scan && (
          <Step key="create">
            <CreateDeal scan={scan} draft={draft} />
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
    <div className="relative flex rounded-full border hairline bg-card/60 p-1" role="tablist">
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
          placeholder={props.mode === "buy" ? "Paste a listing link, or the chat: “iPhone 13, like new, $90. Pay me Friends & Family…”" : "Paste your listing link, or: “Selling my Nintendo Switch OLED, $230, both Joy-Cons and dock…”"}
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
      <div className="mt-6 flex flex-wrap items-center gap-2 font-ui text-[14px] text-muted">
        <span>Try one:</span>
        <button onClick={() => props.setText(SAMPLES.scam)} className="rounded-full border hairline px-3 py-1.5 transition-colors hover:border-ink/40 hover:text-ink">A scam chat</button>
        <button onClick={() => props.setText(SAMPLES.fair)} className="rounded-full border hairline px-3 py-1.5 transition-colors hover:border-ink/40 hover:text-ink">A fair listing</button>
        <span className="hidden md:inline">· Or paste a Marketplace, Craigslist or OfferUp link, or a screenshot with ⌘V</span>
      </div>
    </div>
  );
}

const SCAN_STEPS = ["Reading the conversation", "Looking for scam patterns", "Checking Handshake's scam memory", "Finding this item in 25,000 stores", "Comparing the price"];
const LINK_STEPS = ["Opening the listing in a cloud browser", "Reading the price and photos", "Looking for scam patterns", "Checking Handshake's scam memory", "Checking the photos against store images", "Comparing the price"];

function Scanning({ hasImage, link }: { hasImage: boolean; link: boolean }) {
  const [i, setI] = useState(0);
  const steps = link ? LINK_STEPS : hasImage ? ["Reading the screenshot", ...SCAN_STEPS.slice(1)] : SCAN_STEPS;
  useEffect(() => {
    // A link opens a real browser first, so its steps take longer.
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), link ? 3800 : 1700);
    return () => clearInterval(t);
  }, [link, steps.length]);
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

      {scan.source && scan.source.photos.length > 0 && <ListingPhotos host={scan.source.host} url={scan.source.url} photos={scan.source.photos} />}

      {scan.memory && <MemoryPanel scan={scan} mode={mode} />}

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

const MATCH_LINE: Record<MemoryMatch["kinds"][number], string> = {
  SAME_DETAILS: "Same contact or payment details",
  SAME_PHOTO: "Same photo",
  SIMILAR_WORDING: "Same tactics, different words",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// What Handshake's scam memory (Elasticsearch) found, and a way for the buyer to add this scam to it.
function MemoryPanel({ scan, mode }: { scan: Scan; mode: "buy" | "sell" }) {
  const memory = scan.memory!;
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  const canReport = mode === "buy" && scan.risk !== "LOW" && !!scan.id;

  async function report() {
    setState("sending");
    try {
      const r = await api<{ already: boolean }>("/api/scan/report", { scanId: scan.id });
      setNote(r.already ? "You've already reported this one." : "Added to Handshake's scam memory. The next buyer who meets this seller will be warned.");
      setState("done");
    } catch (e) {
      setNote((e as Error).message);
      setState("error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.6 }}
      className="mt-10 rounded-[28px] border hairline bg-card p-6 md:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="label text-muted">Scam memory · Elastic</p>
        <p className="label text-muted">{memory.size.toLocaleString()} scams remembered</p>
      </div>
      {memory.matches.length === 0 ? (
        <p className="mt-4 font-display text-[22px] font-semibold tracking-tight">No match in Handshake&apos;s memory.</p>
      ) : (
        <>
          <p className="mt-4 font-display text-[22px] font-semibold tracking-tight text-alert">
            Handshake has seen this before.
          </p>
          <ul className="mt-5 divide-y divide-line border-y hairline">
            {memory.matches.map((m) => (
              <li key={m.id} className="grid gap-1 py-4 md:grid-cols-[1fr_auto] md:items-baseline md:gap-6">
                <div>
                  <p className="text-[16px] font-medium">
                    {m.kinds.map((k) => MATCH_LINE[k]).join(" · ")}
                    {m.details.length > 0 && <span className="text-muted">: {m.details.join(", ")}</span>}
                  </p>
                  {m.flags.length > 0 && (
                    <p className="mt-1 text-[14px] text-muted">
                      That scam used {m.flags.map((f) => f.replace(/_/g, " ").toLowerCase().replace("friends and family", "Friends & Family")).join(", ")}.
                    </p>
                  )}
                </div>
                <p className="label text-muted">
                  Seen {m.seen}× · last {day(m.lastSeen)}
                  {m.reported ? " · reported by a buyer" : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {canReport && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button variant="ghost" onClick={report} disabled={state === "sending" || state === "done"}>
            {state === "sending" ? "Reporting…" : state === "done" ? "Reported" : "Report this seller as a scam"}
          </Button>
          {note && <p className={`text-[14px] ${state === "error" ? "text-alert" : "text-safe"}`} role="status">{note}</p>}
        </div>
      )}
    </motion.div>
  );
}

const PHOTO_BADGE: Record<ListingPhoto["kind"], { label: string; cls: string }> = {
  STORE_PHOTO: { label: "Store photo", cls: "bg-alert-soft text-alert" },
  SELLER_PHOTO: { label: "Seller's own photo", cls: "bg-safe-soft text-safe" },
  UNCLEAR: { label: "Can't tell", cls: "bg-paper text-muted" },
};

// The photos Kernel found on the listing page, each with the photo check's verdict.
function ListingPhotos({ host, url, photos }: { host: string; url: string; photos: ListingPhoto[] }) {
  return (
    <div className="mt-10">
      <p className="label mb-4 text-muted">
        Listing photos ·{" "}
        <a href={url} target="_blank" rel="noreferrer noopener" className="underline decoration-line underline-offset-4 hover:text-ink">
          {host}
        </a>
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <motion.figure
            key={p.src}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.5 + i * 0.1 }}
            className="overflow-hidden rounded-3xl border hairline bg-card"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={`Listing photo ${i + 1}`} referrerPolicy="no-referrer" loading="lazy" className="aspect-[4/3] w-full bg-paper object-cover" />
            <figcaption className="p-4">
              <span className={`label inline-block rounded-full px-2.5 py-1 ${PHOTO_BADGE[p.kind].cls}`}>{PHOTO_BADGE[p.kind].label}</span>
              {p.reason && <p className="mt-2 text-[14px] leading-snug text-muted">{p.reason}</p>}
            </figcaption>
          </motion.figure>
        ))}
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
    <div className="island rounded-3xl bg-night p-6 text-paper md:p-7">
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

function CreateDeal({ scan, draft }: { scan: Scan; draft: Draft | null }) {
  const router = useRouter();
  const me = useMe();
  const account = me?.account ?? null;
  const [title, setTitle] = useState(draft?.title ?? scan.item);
  const [price, setPrice] = useState(draft?.price ?? (scan.priceCents ? String(scan.priceCents / 100) : ""));
  const [name, setName] = useState("");
  const [checklist, setChecklist] = useState(draft?.checklist ?? scan.checklist.join("\n"));
  const [photo, setPhoto] = useState<string | null>(draft?.photo ?? null);
  const [offers, setOffers] = useState(draft?.offers ?? true);
  const [floor, setFloor] = useState(draft?.floor ?? "");
  const [handoff, setHandoff] = useState<"ship" | "meet">(draft?.handoff ?? "ship");
  const keep = () => saveDraft({ scan, title, price, checklist, photo, offers, floor, handoff });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fair = fairBand(scan.condition, scan.market);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(price) * 100);
    if (!account && !name.trim()) return setError("Add your first name so the buyer knows who they're dealing with.");
    if (!cents || cents < 100) return setError("Enter a price of at least $1.");
    const floorCents = offers ? Math.round(Number(floor) * 100) : undefined;
    if (offers && (!floorCents || floorCents > cents)) return setError("Set the lowest price your agent may accept, at or below your asking price.");
    setBusy(true);
    setError(null);
    try {
      const deal = await api<Deal>("/api/deals", {
        title,
        priceCents: cents,
        condition: scan.condition,
        checklist: checklist.split("\n").map((s) => s.trim()).filter(Boolean),
        photo: photo ?? undefined,
        sellerName: name.trim() || undefined,
        scan,
        floorCents,
        handoff,
      });
      clearDraft();
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
        <PayoutField me={me} name={name} setName={setName} field={field} onSignIn={keep} />
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
        <HandoffField value={handoff} onChange={setHandoff} />
        <OffersField on={offers} setOn={setOffers} floor={floor} setFloor={setFloor} fair={fair} field={field} />
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

// Who gets paid. Signed in with PayPal, the payout goes to the seller's own account; a guest is a demo seller.
function PayoutField({ me, name, setName, field, onSignIn }: { me: ReturnType<typeof useMe>; name: string; setName: (v: string) => void; field: string; onSignIn: () => void }) {
  if (me?.account) {
    const a = me.account;
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-safe/30 bg-safe-soft px-5 py-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#003087] text-white">
          <PayPalMark className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-display text-[18px] font-semibold tracking-tight">
            Paid to {a.name}&apos;s PayPal {a.verified && <VerifiedTick className="size-4 text-safe" />}
          </p>
          <p className="truncate text-[14px] text-muted">
            {a.email ? `${a.email} · ` : ""}Buyers see you as {a.verified ? "a verified PayPal seller" : "signed in with PayPal"}.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {me?.enabled && (
        <div className="grid gap-4 rounded-2xl border hairline bg-card p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-display text-[18px] font-semibold tracking-tight">Get paid into your own PayPal</p>
            <p className="mt-1 text-[15px] text-muted">Sign in on PayPal&apos;s page. We never see your password, and buyers see you&apos;re a real PayPal account.</p>
            <SandboxHint skip="continue as a demo seller below" className="mt-2" />
          </div>
          <PayPalSignIn next="/check?mode=sell&resume=1" onBeforeLeave={onSignIn} />
        </div>
      )}
      <label className="grid gap-2">
        <span className="label text-muted">{me?.enabled ? "Or try it as a demo seller · your first name" : "Your first name"}</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sam" />
      </label>
      {me?.enabled && <p className="-mt-2 text-[13px] text-muted">Demo sellers are paid into Handshake&apos;s sandbox seller account.</p>}
    </div>
  );
}

// How the item changes hands. Meeting in person swaps the label check for a handover code at the meetup.
function HandoffField({ value, onChange }: { value: "ship" | "meet"; onChange: (v: "ship" | "meet") => void }) {
  const options = [
    { v: "ship" as const, t: "Ship it", d: "We check your shipping label against the buyer's PayPal address." },
    { v: "meet" as const, t: "Meet in person", d: "The buyer checks it, then scans your code. You're paid before you let go of it." },
  ];
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="How it changes hands">
      <span className="label text-muted">How it changes hands</span>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            onClick={() => onChange(o.v)}
            className={`rounded-3xl border p-5 text-left transition-colors ${value === o.v ? "border-ink bg-card" : "hairline bg-card/50 hover:border-ink/30"}`}
          >
            <span className="flex items-center gap-2 font-display text-[19px] font-semibold tracking-tight">
              <span className={`size-3 rounded-full border ${value === o.v ? "border-ink bg-ink" : "border-ink/30"}`} />
              {o.t}
            </span>
            <span className="mt-1 block text-[15px] text-muted">{o.d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Turning offers on hands the haggling to the seller's agent, which never goes below this private floor.
function OffersField(p: { on: boolean; setOn: (v: boolean) => void; floor: string; setFloor: (v: string) => void; fair: ReturnType<typeof fairBand>; field: string }) {
  return (
    <div className="rounded-3xl border hairline bg-card p-5">
      <label className="flex cursor-pointer items-start justify-between gap-6">
        <span>
          <span className="block font-display text-[19px] font-semibold tracking-tight">Let my agent take offers</span>
          <span className="mt-1 block text-[15px] text-muted">Buyers can make PayPal-backed offers. Your agent negotiates for you, even while you&apos;re offline.</span>
        </span>
        <input type="checkbox" checked={p.on} onChange={(e) => p.setOn(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="relative mt-1 h-7 w-12 shrink-0 rounded-full bg-ink/15 transition-colors peer-checked:bg-safe peer-focus-visible:ring-2 peer-focus-visible:ring-ink/40 after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-paper after:shadow after:transition-transform peer-checked:after:translate-x-5" />
      </label>
      <AnimatePresence initial={false}>
        {p.on && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
            <label className="mt-5 grid gap-2">
              <span className="label text-muted">Lowest you&apos;d take (USD) · only you and your agent see this</span>
              <input className={p.field} inputMode="decimal" value={p.floor} onChange={(e) => p.setFloor(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={p.fair ? String(Math.round(p.fair.lowCents / 100)) : "190"} />
            </label>
            {p.fair && <p className="mt-3 text-[14px] text-muted">Similar items in this condition usually sell for {usd(p.fair.lowCents)}–{usd(p.fair.highCents)}, based on retail prices from Channel3.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
