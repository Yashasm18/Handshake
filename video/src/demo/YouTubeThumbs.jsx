import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Two YouTube thumbnails (16:9), in the site's type and colours. Big words first: they're read at phone size.
const display = loadInterTight("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily;
const serif = loadNewsreader("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const mono = loadMono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily;
const PAPER = "#f3f1ec", INK = "#111110", MUTED = "#6e6b64", SAFE = "#0a7a4b", SAFE_BRIGHT = "#3fcf8e", ALERT = "#d4422f", NIGHT = "#0d0d0c";

function Mark({ size, color }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <circle cx="24" cy="32" r="18" fill="none" stroke={color} strokeWidth="4.6" />
      <circle cx="40" cy="32" r="18" fill="none" stroke={color} strokeWidth="4.6" />
    </svg>
  );
}
const Brand = ({ color, size = 40 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Mark size={size * 1.25} color={color} />
    <span style={{ fontFamily: display, fontWeight: 600, fontSize: size, letterSpacing: "-0.04em", color }}>Handshake</span>
  </div>
);
const Pill = ({ children, bg, color, dot }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: bg, color, borderRadius: 99, padding: "12px 22px", fontFamily: mono, fontWeight: 500, fontSize: 20, letterSpacing: "0.12em", textTransform: "uppercase" }}>
    <span style={{ width: 10, height: 10, borderRadius: 99, background: dot }} />
    {children}
  </div>
);

// 1. Dark: the tagline, with the real "Don't send money yet." verdict from the app beside it.
export function ThumbDark() {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 90% at 75% 50%, #232320 0%, ${NIGHT} 70%)`, padding: "64px 70px", flexDirection: "row" }}>
      <div style={{ width: 560, display: "flex", flexDirection: "column", justifyContent: "space-between", zIndex: 2 }}>
        <Brand color={PAPER} size={38} />
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 90, lineHeight: 0.94, letterSpacing: "-0.055em", color: PAPER }}>
          Trust the deal,<br /><span style={{ color: SAFE_BRIGHT }}>not the stranger.</span>
        </div>
        <Pill bg="rgba(63,207,142,.14)" color={SAFE_BRIGHT} dot={SAFE_BRIGHT}>AI + PayPal protected deals</Pill>
      </div>
      {/* The real verdict screen, cropped from the demo's capture. */}
      <div style={{ position: "absolute", right: -40, top: 92, width: 600, height: 536, borderRadius: 28, overflow: "hidden", transform: "rotate(-3deg)", boxShadow: `0 40px 90px rgba(0,0,0,.6), 0 0 0 3px ${ALERT}`, background: PAPER }}>
        <Img src={staticFile("shots/scam-verdict.png")} style={{ position: "absolute", width: 1600, left: -150, top: -180 }} />
      </div>
      <div style={{ position: "absolute", right: 60, bottom: 58, zIndex: 3 }}>
        <Pill bg={ALERT} color="#fff" dot="#fff">Scam caught before you pay</Pill>
      </div>
    </AbsoluteFill>
  );
}

// 2. Light: the scam line crossed out, and the money held by PayPal instead. With `play`, it becomes the
// README's poster: a play button that opens the video on YouTube.
export function ThumbLight({ play = false }) {
  return (
    <AbsoluteFill style={{ background: PAPER, padding: "62px 70px", flexDirection: "row", gap: 56 }}>
      <div style={{ width: 560, display: "flex", flexDirection: "column", justifyContent: "center", gap: 30 }}>
        <div style={{ background: "#fff", borderRadius: 30, padding: "26px 28px 30px", boxShadow: "0 24px 60px rgba(17,17,16,.12)", transform: "rotate(-2deg)" }}>
          <div style={{ fontFamily: mono, fontSize: 17, letterSpacing: "0.14em", color: MUTED }}>A STRANGER WRITES</div>
          <div style={{ position: "relative", marginTop: 18, display: "inline-block", background: "#fbe7e3", borderRadius: 22, padding: "16px 22px", boxShadow: `inset 0 0 0 2.5px ${ALERT}`, fontFamily: serif, fontSize: 38, lineHeight: 1.2, color: INK, whiteSpace: "nowrap" }}>
            “Send it Friends &amp; Family.”
            <span style={{ position: "absolute", left: 14, right: 14, top: "50%", height: 5, background: ALERT, borderRadius: 3, transform: "rotate(-4deg)" }} />
          </div>
        </div>
        <div style={{ background: NIGHT, borderRadius: 30, padding: "26px 30px 30px", transform: "rotate(1.5deg)", boxShadow: "0 24px 60px rgba(17,17,16,.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: mono, fontSize: 17, letterSpacing: "0.14em", color: SAFE_BRIGHT }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: SAFE_BRIGHT }} /> HELD BY PAYPAL
          </div>
          <div style={{ marginTop: 12, fontFamily: display, fontWeight: 700, fontSize: 64, letterSpacing: "-0.045em", color: PAPER, lineHeight: 1 }}>$200 is held.</div>
          <div style={{ marginTop: 10, fontFamily: serif, fontSize: 30, color: "rgba(243,241,236,.7)" }}>Paid only when it arrives.</div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><Brand color={INK} size={38} /></div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 118, lineHeight: 0.92, letterSpacing: "-0.058em", color: INK }}>
          Never pay<br />a stranger<br /><span style={{ color: SAFE }}>first.</span>
        </div>
        {play ? (
          <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 16, background: INK, color: PAPER, borderRadius: 99, padding: "10px 28px 10px 10px", boxShadow: "0 18px 40px rgba(17,17,16,.25)" }}>
            <span style={{ width: 54, height: 54, borderRadius: 99, background: ALERT, display: "grid", placeItems: "center" }}>
              <svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5v14l11-7z" fill="#fff" /></svg>
            </span>
            <span style={{ fontFamily: display, fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em" }}>Watch the demo · 2:33</span>
          </div>
        ) : (
          <div style={{ fontFamily: mono, fontSize: 19, letterSpacing: "0.1em", color: MUTED, textTransform: "uppercase", whiteSpace: "nowrap" }}>AI spots scams · PayPal holds money</div>
        )}
      </div>
    </AbsoluteFill>
  );
}
