import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, Easing } from "remotion";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { beats } from "./beats.js";
import durations from "./durations.json";
import capture from "../../public/shots/shots.json";
import { FPS, LEAD, buildDemoTimeline } from "./timeline.js";

// The under-3-minute demo: full-screen stills from one real run on the live site, animated with a
// cursor, clicks and gentle zooms, narrated, with captions in the site's own type.
const serif = loadNewsreader().fontFamily;
const display = loadInterTight().fontFamily;
const mono = loadMono().fontFamily;

const W = 1920, H = 1080;
const PAPER = "#f3f1ec", INK = "#111110", MUTED = "#6e6b64", SAFE = "#0a7a4b", SAFE_BRIGHT = "#3fcf8e", ALERT = "#d4422f", NIGHT = "#0d0d0c";
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const FADE = 10; // frames of cross-fade between shots
const VIEW = capture.viewport; // 1440 x 810 CSS px
const S = W / VIEW.w; // CSS px -> frame px

const shotById = Object.fromEntries(capture.shots.map((s) => [s.id, s]));
const { timeline, total } = buildDemoTimeline(beats, durations, capture.shots);
export { FPS };
export const TOTAL_FRAMES = total;

// ---------- Pieces ----------

function Logo({ size = 64, color = INK }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="12" cy="16" r="9" fill="none" stroke={color} strokeWidth="2.4" />
      <circle cx="20" cy="16" r="9" fill="none" stroke={color} strokeWidth="2.4" />
    </svg>
  );
}

function Label({ children, color = MUTED, dot = SAFE }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: mono, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color }}>
      <span style={{ width: 10, height: 10, borderRadius: 99, background: dot }} />
      {children}
    </div>
  );
}

// The page, full width, above the caption strip. The strip never covers the page: the site's own test
// bar and nav are trimmed off the top instead (every shot was scrolled to sit below them), so all of the
// content the narration talks about stays in view. A gentle push-in, or a zoom to a region.
export const STRIP = 150; // the caption strip at the bottom, in frame px
const VH = H - STRIP; // the visible page area
const CROP = STRIP; // trimmed from the top of each still
function Shot({ clip }) {
  const f = useCurrentFrame();
  const meta = shotById[clip.id];
  if (!meta) return null;
  const t = interpolate(f, [0, clip.frames], [0, 1], { extrapolateRight: "clamp" });
  // Point of the still (frame px) held at the centre of the visible area, and the scale around it.
  let fx = W / 2, fy = CROP + VH / 2;
  let scale = interpolate(t, [0, 1], [1, 1.035]);
  if (clip.zoom) {
    const z = clip.zoom;
    const target = Math.min(1.7, Math.min(W / (z.w * S), VH / (z.h * S)));
    const p = interpolate(f, [0, Math.min(40, clip.frames * 0.45)], [0, 1], { extrapolateRight: "clamp", easing: ease });
    scale = 1 + (target - 1) * p;
    fx += ((z.x + z.w / 2) * S - fx) * p;
    fy += ((z.y + z.h / 2) * S - fy) * p;
  }
  const tx = W / 2 - scale * fx, ty = VH / 2 - scale * fy;
  const opacity = interpolate(f, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  const click = clip.click && meta.click;
  return (
    <AbsoluteFill style={{ opacity, background: PAPER, height: VH, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <Img src={staticFile(`shots/${clip.id}.png`)} style={{ width: W, height: H }} />
        {click && <Cursor box={meta.click} frames={clip.frames} />}
      </div>
    </AbsoluteFill>
  );
}

// The cursor glides onto the button, then clicks with the site's green ripple.
function Cursor({ box, frames }) {
  const f = useCurrentFrame();
  const x = (box.x + box.w / 2) * S, y = (box.y + box.h / 2) * S;
  const arrive = Math.min(28, frames * 0.4);
  const p = interpolate(f, [4, arrive], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const cx = interpolate(p, [0, 1], [x - 320, x]), cy = interpolate(p, [0, 1], [y + 190, y]);
  const clickAt = arrive + 8;
  const r = interpolate(f, [clickAt, clickAt + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const press = f >= clickAt && f < clickAt + 5 ? 0.86 : 1;
  return (
    <>
      {f >= clickAt && (
        <div style={{ position: "absolute", left: x - 40, top: y - 40, width: 80, height: 80, borderRadius: 99, border: `4px solid ${SAFE_BRIGHT}`, opacity: 1 - r, transform: `scale(${0.4 + r * 1.2})` }} />
      )}
      <svg width="46" height="46" viewBox="0 0 24 24" style={{ position: "absolute", left: cx - 6, top: cy - 4, transform: `scale(${press})`, transformOrigin: "6px 4px", filter: "drop-shadow(0 3px 6px rgba(0,0,0,.35))" }}>
        <path d="M5 3l14 8-6.5 1.6L9.4 19z" fill={INK} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </>
  );
}

// The caption, centred along the bottom in the site's type. The main line rises in word by word as the
// step begins, stays while it's introduced, then lifts away so the picture and the voice carry the rest.
// The small mono label (what's working right now) stays for the whole step.
const CAPTION_HOLD = 5.2 * 30; // frames the main line stays before it lifts away
function CaptionBand({ beat }) {
  const f = useCurrentFrame();
  const dark = beat.kind === "hook";
  const words = beat.caption.split(" ");
  const inStart = 6, stagger = 2.4, wordIn = 14;
  const outStart = Math.min(CAPTION_HOLD, beat.frames - 24);
  const labelIn = interpolate(f, [2, 16], [0, 1], { extrapolateRight: "clamp", easing: ease });
  const labelOut = interpolate(f, [beat.frames - 10, beat.frames], [1, 0], { extrapolateLeft: "clamp" });
  // Once the line has gone, the label settles into the middle of the strip.
  const settle = interpolate(f, [outStart + 6, outStart + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", pointerEvents: "none" }}>
      {!dark && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: STRIP, background: NIGHT }} />}
      <div style={{ position: "relative", height: STRIP, marginBottom: dark ? 40 : 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ opacity: labelIn * labelOut, transform: `translateY(${settle * 30}px)` }}>
          <Label color={dark ? MUTED : "rgba(243,241,236,.6)"} dot={dark ? ALERT : SAFE_BRIGHT}>{beat.label}</Label>
        </div>
        <div style={{ marginTop: 12, fontFamily: serif, fontSize: dark ? 50 : 46, lineHeight: 1.15, color: dark ? INK : PAPER, whiteSpace: "nowrap", height: 56 }}>
          {words.map((w, i) => {
            const p = interpolate(f, [inStart + i * stagger, inStart + i * stagger + wordIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
            const q = interpolate(f, [outStart + i * 1.2, outStart + i * 1.2 + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
            return (
              <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: p * (1 - q), transform: `translateY(${(1 - p) * 22 - q * 18}px)`, filter: `blur(${(1 - p) * 6 + q * 4}px)` }}>{w}</span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// The problem, as a buyer sees it: a friendly seller, then the pressure.
function Hook({ beat }) {
  const f = useCurrentFrame();
  const msgs = [
    { at: 0.04, text: "Still available! $230, like new." },
    { at: 0.2, text: "Send it Friends & Family, no fees.", bad: true },
    { at: 0.36, text: "Hurry, two other people are asking.", bad: true },
  ];
  const outcome = interpolate(f, [beat.frames * 0.62, beat.frames * 0.62 + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ background: PAPER, padding: "120px 120px 0", flexDirection: "row", gap: 110 }}>
      <div style={{ width: 760 }}>
        <div style={{ background: "#fff", borderRadius: 40, padding: "34px 34px 40px", boxShadow: "0 30px 80px rgba(17,17,16,.12)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, paddingBottom: 24, borderBottom: "1px solid rgba(17,17,16,.08)" }}>
            <div style={{ width: 58, height: 58, borderRadius: 99, background: "#e8e4dc", display: "grid", placeItems: "center", fontFamily: display, fontWeight: 600, fontSize: 26 }}>S</div>
            <div>
              <div style={{ fontFamily: display, fontWeight: 600, fontSize: 28 }}>A seller you've never met</div>
              <div style={{ fontFamily: mono, fontSize: 18, color: MUTED, letterSpacing: "0.1em" }}>MARKETPLACE MESSAGE</div>
            </div>
          </div>
          {msgs.map((m, i) => {
            const p = interpolate(f, [beat.frames * m.at, beat.frames * m.at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
            return (
              <div key={i} style={{ marginTop: 26, opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>
                <span style={{ display: "inline-block", background: m.bad ? "#fbe7e3" : "#f0ede7", color: INK, borderRadius: 26, padding: "18px 26px", fontFamily: serif, fontSize: 36, lineHeight: 1.25, boxShadow: m.bad ? `inset 0 0 0 2px ${ALERT}` : "none" }}>{m.text}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, paddingTop: 30 }}>
        <Label dot={ALERT}>The problem</Label>
        <div style={{ marginTop: 30, fontFamily: display, fontWeight: 600, fontSize: 92, lineHeight: 0.98, letterSpacing: "-0.045em", color: INK }}>A good deal.<br />A bad feeling.</div>
        <div style={{ marginTop: 56, opacity: outcome, transform: `translateY(${(1 - outcome) * 16}px)` }}>
          <div style={{ fontFamily: display, fontWeight: 600, fontSize: 46, letterSpacing: "-0.03em", color: ALERT }}>Pay: no protection.</div>
          <div style={{ marginTop: 10, fontFamily: display, fontWeight: 600, fontSize: 46, letterSpacing: "-0.03em", color: MUTED }}>Walk away: lose a fair deal.</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// How it works, in three steps, each card arriving as the narrator reaches it.
function Steps({ beat }) {
  const f = useCurrentFrame();
  const head = interpolate(f, [0, 18], [0, 1], { extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ background: PAPER, padding: "110px 110px 0" }}>
      <div style={{ opacity: head, transform: `translateY(${(1 - head) * 16}px)` }}>
        <Label>How Handshake works</Label>
        <div style={{ marginTop: 24, fontFamily: display, fontWeight: 600, fontSize: 96, lineHeight: 0.98, letterSpacing: "-0.045em", color: INK }}>Three steps. No blind trust.</div>
      </div>
      <div style={{ marginTop: 70, display: "flex", gap: 32 }}>
        {beat.steps.map((st, i) => {
          // The card lands when the voice says "First", "Second", "Third".
          const at = (LEAD + (beat.vo.indexOf(st.at) / beat.vo.length) * beat.voice) * FPS - 4;
          const p = interpolate(f, [at, at + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          const live = interpolate(f, [at, at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={st.n} style={{ flex: 1, background: i === 1 ? NIGHT : "#fff", color: i === 1 ? PAPER : INK, borderRadius: 36, padding: "40px 40px 44px", opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.97 + 0.03 * p})`, boxShadow: `0 30px 70px rgba(17,17,16,${0.1 * live})` }}>
              <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.16em", color: i === 1 ? SAFE_BRIGHT : SAFE }}>{st.n}</div>
              <div style={{ marginTop: 30, fontFamily: display, fontWeight: 600, fontSize: 60, letterSpacing: "-0.04em", lineHeight: 1 }}>{st.title}</div>
              <div style={{ marginTop: 22, fontFamily: serif, fontSize: 31, lineHeight: 1.3, color: i === 1 ? "rgba(243,241,236,.75)" : MUTED }}>{st.text}</div>
              <div style={{ marginTop: 30, fontFamily: mono, fontSize: 18, letterSpacing: "0.12em", textTransform: "uppercase", color: i === 1 ? "rgba(243,241,236,.55)" : MUTED }}>{st.tech}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Title({ beat }) {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 22], [0, 1], { extrapolateRight: "clamp", easing: ease });
  const b = interpolate(f, [16, 40], [0, 1], { extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ background: NIGHT, color: PAPER, justifyContent: "center", padding: "0 140px" }}>
      <div style={{ opacity: a, marginBottom: 40 }}>
        <Label color="rgba(243,241,236,.6)" dot={SAFE_BRIGHT}>For anyone buying or selling with a stranger</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: a }}>
        <Logo size={74} color={PAPER} />
        <span style={{ fontFamily: display, fontWeight: 600, fontSize: 56, letterSpacing: "-0.04em" }}>Handshake</span>
      </div>
      <div style={{ marginTop: 44, fontFamily: display, fontWeight: 600, fontSize: 150, lineHeight: 0.95, letterSpacing: "-0.05em", opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        Trust the deal,<br />not the stranger.
      </div>
      <div style={{ marginTop: 50, fontFamily: serif, fontSize: 44, lineHeight: 1.3, color: "rgba(243,241,236,.72)", maxWidth: 1300, opacity: b }}>
        AI catches the scam before money moves. PayPal holds the money until the item really arrives.
      </div>
    </AbsoluteFill>
  );
}

function Outro({ beat }) {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 20], [0, 1], { extrapolateRight: "clamp", easing: ease });
  const b = interpolate(f, [24, 44], [0, 1], { extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ background: NIGHT, color: PAPER, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ opacity: a, transform: `scale(${0.96 + a * 0.04})`, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Logo size={110} color={PAPER} />
        <div style={{ marginTop: 34, fontFamily: display, fontWeight: 600, fontSize: 128, lineHeight: 0.95, letterSpacing: "-0.05em" }}>Trust the deal,<br />not the stranger.</div>
      </div>
      <div style={{ marginTop: 56, opacity: b, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ fontFamily: mono, fontSize: 34, letterSpacing: "0.04em", color: SAFE_BRIGHT }}>usehandshake.onrender.com</div>
        <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(243,241,236,.55)" }}>PayPal · Channel3 · Render · Kernel · Elastic</div>
        <div style={{ fontFamily: serif, fontSize: 30, color: "rgba(243,241,236,.55)" }}>Built for the PayPal AI Hackathon · runs on the PayPal sandbox</div>
      </div>
    </AbsoluteFill>
  );
}

// A thin progress line, so a viewer always knows how far through the story they are.
function Progress() {
  const f = useCurrentFrame();
  return <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: (W * f) / TOTAL_FRAMES, background: SAFE_BRIGHT, opacity: 0.85 }} />;
}

export function Demo() {
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      {timeline.map((b) => (
        <Sequence key={b.id} from={b.start} durationInFrames={b.frames + FADE}>
          {b.kind === "hook" && <Hook beat={b} />}
          {b.kind === "title" && <Title beat={b} />}
          {b.kind === "steps" && <Steps beat={b} />}
          {b.kind === "outro" && <Outro beat={b} />}
        </Sequence>
      ))}
      {timeline.flatMap((b) =>
        b.clips.map((c, i) => (
          <Sequence key={`${b.id}-${i}`} from={c.start} durationInFrames={c.frames + FADE}>
            <Shot clip={c} />
          </Sequence>
        )),
      )}
      {timeline.map((b) => (
        <Sequence key={`cap-${b.id}`} from={b.start} durationInFrames={b.frames}>
          {b.kind !== "title" && b.kind !== "outro" && <CaptionBand beat={b} />}
        </Sequence>
      ))}
      {timeline.map((b) => (
        <Sequence key={`vo-${b.id}`} from={b.start + Math.round(LEAD * FPS)}>
          <Audio src={staticFile(`audio/demo/${b.id}.wav`)} />
        </Sequence>
      ))}
      <Audio src={staticFile("audio/demo/music.wav")} volume={musicVolume} />
      <Progress />
    </AbsoluteFill>
  );
}

// The music sits well under the voice, lifts a little in the pauses, and fades in and out at the ends.
const SPEAKING = timeline.map((b) => [b.start + LEAD * FPS, b.start + (LEAD + b.voice) * FPS]);
const UNDER = 0.06, BETWEEN = 0.1;
function musicVolume(f) {
  const ramp = 12;
  let near = 0; // 1 while the narrator speaks, easing at each line's edges
  for (const [a, z] of SPEAKING) near = Math.max(near, interpolate(f, [a - ramp, a, z, z + ramp], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const level = BETWEEN + (UNDER - BETWEEN) * near;
  const ends = Math.min(interpolate(f, [0, 45], [0, 1], { extrapolateRight: "clamp" }), interpolate(f, [TOTAL_FRAMES - 75, TOTAL_FRAMES], [1, 0], { extrapolateLeft: "clamp" }));
  return level * ends;
}
