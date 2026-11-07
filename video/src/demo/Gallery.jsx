import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// The Devpost image gallery (3:2): one slide per frame. A headline in the site's type over a sharp crop
// of the real live-deal captures, in the order a deal happens.
const display = loadInterTight("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily;
const serif = loadNewsreader("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const mono = loadMono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily;
const PAPER = "#f3f1ec", INK = "#111110", MUTED = "#6e6b64", SAFE = "#0a7a4b", SAFE_BRIGHT = "#3fcf8e", ALERT = "#d4422f", NIGHT = "#0d0d0c";
const W = 1500, H = 1000, PAD = 70, SHOT_TOP = 270;
const BOX_W = W - PAD * 2, BOX_H = H - SHOT_TOP - PAD; // the screenshot's frame
const VIEW_W = 1440; // capture viewport, CSS px (stills are 2x)

// crop: the region of the capture to show, in CSS px; its height follows the frame's shape.
export const SLIDES = [
  { kind: "cover" },
  { kind: "steps" },
  { shot: "scam-verdict", crop: { x: 60, w: 1320, y: 110 }, label: "AI scam check · Claude", title: "AI stops the scam before any money moves.", accent: ALERT },
  { shot: "scam-flags", crop: { x: 160, w: 1120, y: 95 }, label: "Every trick quoted · Channel3 prices", title: "Every trick quoted. Every price checked." },
  { shot: "scam-memory", crop: { x: 190, w: 1065, y: 262 }, label: "Scam memory · Elastic", title: "Seen this scam before? It remembers." },
  { shot: "sell-verdict", crop: { x: 60, w: 1320, y: 110 }, label: "Honest sellers", title: "A fair deal gets a protected deal link.", accent: SAFE },
  { shot: "buy-paypal", crop: { x: 20, w: 1400, y: 110 }, label: "PayPal Orders API · intent: AUTHORIZE", title: "The buyer's money is held by PayPal." },
  { shot: "agreed-replay", crop: { x: 20, w: 1400, y: 110 }, label: "AI agents · agentic commerce", title: "Two AI agents agree a fair price." },
  { shot: "ship-blocked", crop: { x: 20, w: 1400, y: 110 }, label: "AI label check", title: "A label to the wrong address is stopped.", accent: ALERT },
  { shot: "tracking", crop: { x: 20, w: 1400, y: 110 }, label: "EasyPost tracking · Render Workflows", title: "Tracked to the door. No deal can stall." },
  { shot: "paid", crop: { x: 0, w: 1440, y: 111 }, label: "PayPal capture · Payouts", title: "It arrived, so PayPal pays the seller.", accent: SAFE },
  { shot: "ledger", crop: { x: 760, w: 620, y: 330 }, label: "PayPal sandbox record", title: "Real PayPal ids for every money step." },
];
export const SLIDE_COUNT = SLIDES.length;

function Mark({ size, color }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <circle cx="24" cy="32" r="18" fill="none" stroke={color} strokeWidth="4.6" />
      <circle cx="40" cy="32" r="18" fill="none" stroke={color} strokeWidth="4.6" />
    </svg>
  );
}
const Label = ({ children, color = MUTED, dot = SAFE }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: mono, fontWeight: 500, fontSize: 19, letterSpacing: "0.14em", textTransform: "uppercase", color }}>
    <span style={{ width: 10, height: 10, borderRadius: 99, background: dot }} />
    {children}
  </div>
);
const Brand = ({ color }) => (
  <div style={{ position: "absolute", right: PAD, top: PAD - 6, display: "flex", alignItems: "center", gap: 10 }}>
    <Mark size={40} color={color} />
    <span style={{ fontFamily: display, fontWeight: 600, fontSize: 30, letterSpacing: "-0.04em", color }}>Handshake</span>
  </div>
);

function Shot({ slide, n }) {
  const { x, w, y } = slide.crop;
  const scale = BOX_W / w; // CSS px -> slide px
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <Brand color={INK} />
      <div style={{ position: "absolute", left: PAD, top: PAD, width: W - PAD * 2 - 260 }}>
        <Label dot={slide.accent ?? SAFE}>{String(n).padStart(2, "0")} · {slide.label}</Label>
        <div style={{ marginTop: 22, fontFamily: display, fontWeight: 600, fontSize: 58, lineHeight: 1.02, letterSpacing: "-0.045em", color: INK, whiteSpace: "nowrap" }}>{slide.title}</div>
      </div>
      <div style={{ position: "absolute", left: PAD, top: SHOT_TOP, width: BOX_W, height: BOX_H, borderRadius: 26, overflow: "hidden", background: PAPER, boxShadow: "0 30px 70px rgba(17,17,16,.16), 0 0 0 1px rgba(17,17,16,.08)" }}>
        <Img src={staticFile(`shots/${slide.shot}.png`)} style={{ position: "absolute", width: VIEW_W * scale, left: -x * scale, top: -y * scale }} />
      </div>
    </AbsoluteFill>
  );
}

function Cover() {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 90% at 78% 55%, #23231f 0%, ${NIGHT} 70%)`, padding: PAD }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Mark size={56} color={PAPER} />
        <span style={{ fontFamily: display, fontWeight: 600, fontSize: 42, letterSpacing: "-0.04em", color: PAPER }}>Handshake</span>
      </div>
      <div style={{ position: "absolute", left: PAD, top: 300, width: 640 }}>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 100, lineHeight: 0.94, letterSpacing: "-0.055em", color: PAPER }}>
          Trust the deal,<br /><span style={{ color: SAFE_BRIGHT }}>not the stranger.</span>
        </div>
        <div style={{ marginTop: 34, fontFamily: serif, fontSize: 32, lineHeight: 1.3, color: "rgba(243,241,236,.72)" }}>
          AI stops the scam. PayPal holds the money until the item arrives.
        </div>
      </div>
      <div style={{ position: "absolute", left: PAD, bottom: PAD }}>
        <Label color="rgba(243,241,236,.6)" dot={SAFE_BRIGHT}>For anyone buying or selling with a stranger</Label>
      </div>
      <div style={{ position: "absolute", right: -60, top: 170, width: 700, height: 600, borderRadius: 28, overflow: "hidden", transform: "rotate(-3deg)", boxShadow: `0 40px 90px rgba(0,0,0,.6), 0 0 0 3px ${ALERT}`, background: PAPER }}>
        <Img src={staticFile("shots/scam-verdict.png")} style={{ position: "absolute", width: 1750, left: -160, top: -190 }} />
      </div>
    </AbsoluteFill>
  );
}

const STEPS = [
  { n: "01", t: "Check", d: "AI reads the chat for scam tricks and checks the price against real stores.", k: "Claude · Channel3 · Elastic" },
  { n: "02", t: "Hold", d: "The buyer pays into a PayPal hold. The money is reserved, not sent.", k: "PayPal Orders API" },
  { n: "03", t: "Pay on arrival", d: "The seller is paid only when the item arrives as described. If not, the buyer pays nothing.", k: "PayPal capture · Payouts" },
];
function Steps() {
  return (
    <AbsoluteFill style={{ background: PAPER, padding: PAD }}>
      <Brand color={INK} />
      <Label>How Handshake works</Label>
      <div style={{ marginTop: 22, fontFamily: display, fontWeight: 600, fontSize: 84, lineHeight: 1, letterSpacing: "-0.05em", color: INK }}>Three steps. No blind trust.</div>
      <div style={{ position: "absolute", left: PAD, right: PAD, top: 330, bottom: PAD, display: "flex", gap: 28 }}>
        {STEPS.map((s, i) => (
          <div key={s.n} style={{ flex: 1, background: i === 1 ? NIGHT : "#fff", color: i === 1 ? PAPER : INK, borderRadius: 34, padding: "40px 38px", display: "flex", flexDirection: "column", boxShadow: "0 26px 60px rgba(17,17,16,.1)" }}>
            <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.16em", color: i === 1 ? SAFE_BRIGHT : SAFE }}>{s.n}</div>
            <div style={{ marginTop: 34, fontFamily: display, fontWeight: 600, fontSize: 58, lineHeight: 1, letterSpacing: "-0.04em" }}>{s.t}</div>
            <div style={{ marginTop: 24, fontFamily: serif, fontSize: 31, lineHeight: 1.3, color: i === 1 ? "rgba(243,241,236,.75)" : MUTED }}>{s.d}</div>
            <div style={{ marginTop: "auto", fontFamily: mono, fontSize: 17, letterSpacing: "0.12em", textTransform: "uppercase", color: i === 1 ? "rgba(243,241,236,.55)" : MUTED }}>{s.k}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

export function Gallery() {
  const f = useCurrentFrame();
  const slide = SLIDES[f];
  if (slide.kind === "cover") return <Cover />;
  if (slide.kind === "steps") return <Steps />;
  return <Shot slide={slide} n={f - 1} />;
}
