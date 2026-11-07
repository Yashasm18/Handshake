import React from "react";
import { AbsoluteFill } from "remotion";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";

// The Devpost thumbnail (3:2): the Handshake mark, big, with the name in the site's display type, white on
// a soft charcoal with a faint diamond lattice.
const display = loadInterTight("normal", { weights: ["600"], subsets: ["latin"] }).fontFamily;
const PAPER = "#f3f1ec";

export function Thumbnail() {
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 75% at 50% 46%, #2a2a27 0%, #1d1d1b 55%, #151514 100%)", alignItems: "center", justifyContent: "center" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="diamonds" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="72" height="72" fill="none" stroke="rgba(243,241,236,0.055)" strokeWidth="1.5" />
          </pattern>
          <radialGradient id="fade" cx="50%" cy="46%" r="62%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#fff" stopOpacity="1" />
          </radialGradient>
          <mask id="m"><rect width="100%" height="100%" fill="url(#fade)" /></mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#diamonds)" mask="url(#m)" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: -20 }}>
        <svg viewBox="0 0 64 64" width="420" height="420" style={{ filter: "drop-shadow(0 18px 50px rgba(0,0,0,.45))" }}>
          <circle cx="24" cy="32" r="18" fill="none" stroke={PAPER} strokeWidth="4.6" />
          <circle cx="40" cy="32" r="18" fill="none" stroke={PAPER} strokeWidth="4.6" />
        </svg>
        <div style={{ marginTop: 10, fontFamily: display, fontWeight: 600, fontSize: 168, letterSpacing: "-0.05em", lineHeight: 1, color: PAPER }}>Handshake</div>
      </div>
    </AbsoluteFill>
  );
}
