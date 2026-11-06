import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { ACTIVE, buildTimeline } from "./timeline.js";
import durations from "./durations.json";
import take from "../public/footage/marks.json";

const serif = loadNewsreader().fontFamily;
const display = loadInterTight().fontFamily;
const mono = loadMono().fontFamily;

const { timeline, total } = buildTimeline(durations, take.marks);
export const TOTAL_FRAMES = total;

const INK = "#f3f1ec";
const NIGHT = "#0d0d0c";
const SAFE = "#2eaa6e";
const ease = Easing.bezier(0.16, 1, 0.3, 1);

// Window geometry (the recording is 720x900 CSS px, captured at 2x).
const WIN_H = 744;
const WIN_W = Math.round((WIN_H * 720) / 900);
const BAR = 46;
const GUTTER = 72;
const TOP = 52;
const LEFT = (1920 - (WIN_W * 2 + GUTTER)) / 2;

const SPONSORS = [
  { id: "paypal", name: "PayPal", role: "Holds and pays", logo: "brands/paypal.svg" },
  { id: "channel3", name: "Channel3", role: "Real prices", logo: "brands/channel3-dark.svg", wordmark: true },
  { id: "render", name: "Render", role: "Keeps deadlines", logo: "brands/render.svg" },
  { id: "kernel", name: "Kernel", role: "Reads links", logo: "brands/kernel.svg" },
  { id: "elastic", name: "Elastic", role: "Scam memory", logo: "brands/elastic.svg" },
  { id: "claude", name: "Claude", role: "AI checks and agents", logo: "brands/anthropic.svg" },
];

function Logo({ size = 64, color = INK }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="12" cy="16" r="9" fill="none" stroke={color} strokeWidth="2.4" />
      <circle cx="20" cy="16" r="9" fill="none" stroke={color} strokeWidth="2.4" />
    </svg>
  );
}

// One browser window playing its side of the recording, mapped onto the current beat.
function Window({ side, x, beat, local, enter }) {
  const active = ACTIVE[beat.id] === "both" || ACTIVE[beat.id] === side;
  const focus = interpolate(local, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const wasActive = (() => {
    const i = timeline.indexOf(beat);
    const prev = timeline[i - 1];
    return !prev || ACTIVE[prev.id] === "both" || ACTIVE[prev.id] === side;
  })();
  const level = wasActive === active ? (active ? 1 : 0) : active ? focus : 1 - focus;
  const dim = 0.55 + 0.45 * level;
  const scale = 0.975 + 0.025 * level;
  const label = side === "buyer" ? "Buyer" : "Seller";
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: TOP,
        width: WIN_W,
        height: WIN_H + BAR,
        borderRadius: 22,
        overflow: "hidden",
        background: "#1b1b19",
        boxShadow: `0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,${0.06 + 0.08 * level})`,
        transform: `translateY(${(1 - enter) * 60}px) scale(${scale})`,
        opacity: enter,
        filter: `brightness(${dim})`,
      }}
    >
      <div style={{ height: BAR, display: "flex", alignItems: "center", gap: 14, padding: "0 18px", background: "#1b1b19" }}>
        <div style={{ display: "flex", gap: 7 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.9 }} />)}
        </div>
        <span style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.16em", textTransform: "uppercase", color: active ? INK : "rgba(243,241,236,.55)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: active ? SAFE : "rgba(243,241,236,.3)" }} />
          {label}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 13, color: "rgba(243,241,236,.45)", background: "rgba(255,255,255,.06)", padding: "5px 12px", borderRadius: 999 }}>
          usehandshake.onrender.com
        </span>
      </div>
      <OffthreadVideo
        src={staticFile(`footage/${side}.mp4`)}
        startFrom={Math.round(beat.footage.from * 30)}
        playbackRate={Math.max(0.05, beat.rate)}
        muted
        style={{ width: WIN_W, height: WIN_H, objectFit: "cover", display: "block" }}
      />
    </div>
  );
}

function Caption({ beat, local }) {
  const inT = interpolate(local, [0, 14], [0, 1], { extrapolateRight: "clamp", easing: ease });
  const outT = interpolate(local, [beat.frames - 10, beat.frames], [1, 0], { extrapolateLeft: "clamp" });
  const n = timeline.filter((b) => !b.kind).indexOf(beat) + 1;
  const steps = timeline.filter((b) => !b.kind).length;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: TOP + BAR + WIN_H + 26, textAlign: "center", opacity: Math.min(inT, outT), transform: `translateY(${(1 - inT) * 14}px)` }}>
      {n > 0 && (
        <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.2em", color: "rgba(243,241,236,.45)", marginBottom: 6 }}>
          {String(n).padStart(2, "0")} / {String(steps).padStart(2, "0")}
        </div>
      )}
      <div style={{ fontFamily: serif, fontSize: 46, lineHeight: 1.1, color: INK, letterSpacing: "-0.005em" }}>{beat.caption}</div>
    </div>
  );
}

function SponsorStrip({ beat, local, opacity }) {
  const lit = new Set(beat.sponsors ?? []);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, display: "flex", justifyContent: "center", alignItems: "center", gap: 46, opacity }}>
      <span style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(243,241,236,.4)" }}>Powered by</span>
      {SPONSORS.map((s) => {
        const on = lit.has(s.id);
        const t = on ? interpolate(local, [0, 12], [0, 1], { extrapolateRight: "clamp" }) : 0;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.38 + 0.62 * t, transform: `translateY(${-3 * t}px)` }}>
            {s.wordmark ? (
              <Img src={staticFile(s.logo)} style={{ height: 22 }} />
            ) : (
              <>
                <Img src={staticFile(s.logo)} style={{ height: 26, width: 26, borderRadius: s.id === "kernel" ? 6 : 0 }} />
                <span style={{ fontFamily: display, fontWeight: 600, fontSize: 21, color: INK, letterSpacing: "-0.02em" }}>{s.name}</span>
              </>
            )}
            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 17, color: on ? "#7fd8a8" : "rgba(243,241,236,.5)" }}>{s.role}</span>
          </div>
        );
      })}
    </div>
  );
}

function TitleCard({ local, frames, intro }) {
  const { fps } = useVideoConfig();
  const pop = spring({ frame: local, fps, config: { damping: 200 } });
  // The intro title gives way to the windows while the voice introduces the two sides.
  const out = intro ? interpolate(local, [118, 140], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const sponsorIn = interpolate(local, [30, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ transform: `translateY(${(1 - pop) * 30}px)`, opacity: pop, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {intro && <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(243,241,236,.55)", marginBottom: 34 }}>See how it works</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Logo size={intro ? 96 : 84} />
          <span style={{ fontFamily: display, fontWeight: 600, fontSize: intro ? 120 : 104, letterSpacing: "-0.045em", color: INK }}>Handshake</span>
        </div>
        <div style={{ fontFamily: serif, fontSize: intro ? 44 : 50, color: "rgba(243,241,236,.78)", marginTop: 26 }}>
          {intro ? "Buy from a stranger, safely." : "Trust the deal, not the stranger."}
        </div>
        {!intro && (
          <div style={{ marginTop: 70, opacity: sponsorIn, display: "flex", alignItems: "center", gap: 54 }}>
            {SPONSORS.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {s.wordmark ? (
                  <Img src={staticFile(s.logo)} style={{ height: 30 }} />
                ) : (
                  <>
                    <Img src={staticFile(s.logo)} style={{ height: 36, width: 36, borderRadius: s.id === "kernel" ? 8 : 0 }} />
                    <span style={{ fontFamily: display, fontWeight: 600, fontSize: 28, color: INK, letterSpacing: "-0.02em" }}>{s.name}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {!intro && <div style={{ marginTop: 50, opacity: sponsorIn, fontFamily: mono, fontSize: 20, letterSpacing: "0.08em", color: "rgba(243,241,236,.55)" }}>usehandshake.onrender.com</div>}
      </div>
    </AbsoluteFill>
  );
}

export function HowItWorks() {
  const frame = useCurrentFrame();
  const beat = timeline.find((b) => frame >= b.start && frame < b.start + b.frames) ?? timeline.at(-1);
  const local = frame - beat.start;
  const intro = timeline[0];
  const outro = timeline.at(-1);
  // Windows rise in during the intro, and step back behind the outro card.
  const enter = beat === intro ? interpolate(local, [126, 160], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }) : 1;
  const behind = beat === outro ? interpolate(local, [0, 28], [1, 0], { extrapolateRight: "clamp" }) : 1;
  const strip = beat === intro ? enter : beat === outro ? interpolate(local, [0, 18], [1, 0], { extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #1d1d1b 0%, ${NIGHT} 70%)` }}>
      {timeline.map((b) => (
        <Sequence key={b.id} from={b.start} durationInFrames={b.frames} layout="none">
          <Audio src={staticFile(`audio/${b.id}.wav`)} />
        </Sequence>
      ))}
      <AbsoluteFill style={{ opacity: behind }}>
        {timeline.map((b) => (
          <Sequence key={b.id} from={b.start} durationInFrames={b.frames} layout="none">
            <Window side="buyer" x={LEFT} beat={b} local={frame - b.start} enter={b === intro ? enter : 1} />
            <Window side="seller" x={LEFT + WIN_W + GUTTER} beat={b} local={frame - b.start} enter={b === intro ? enter : 1} />
          </Sequence>
        ))}
      </AbsoluteFill>
      {!beat.kind && <Caption beat={beat} local={local} />}
      {beat === intro && local > 150 && <Caption beat={{ ...beat, frames: beat.frames }} local={local - 150} />}
      <SponsorStrip beat={beat} local={local} opacity={strip} />
      {beat === intro && <TitleCard local={local} frames={beat.frames} intro />}
      {beat === outro && <TitleCard local={local} frames={beat.frames} />}
    </AbsoluteFill>
  );
}
