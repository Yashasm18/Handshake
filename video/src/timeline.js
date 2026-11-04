import { beats } from "./beats.js";

export const FPS = 30;
const GAP = 0.35; // a breath between beats, so the voice flows from one to the next
const OUTRO_HOLD = 2.4; // the last line always finishes, then the frame rests

// Lays the beats end to end on the narration, and maps each one onto its stretch of recorded footage.
export function buildTimeline(durations, marks) {
  const at = (id) => marks.find((m) => m.id === id).t;
  let frame = 0;
  const timeline = beats.map((b, i) => {
    const voice = durations[b.id] ?? 3;
    const seconds = voice + (b.id === "outro" ? OUTRO_HOLD : i === 0 ? 0.6 : GAP);
    const frames = Math.round(seconds * FPS);
    let footage;
    if (b.id === "intro") footage = { from: 0, len: at("list") };
    else if (b.id === "outro") footage = { from: at("end") - 0.5, len: 0.4 };
    else footage = { from: at(b.from), len: at(b.to) - at(b.from) };
    const item = { ...b, start: frame, frames, voice, footage, rate: footage.len / seconds };
    frame += frames;
    return item;
  });
  return { timeline, total: frame };
}

// Which side is acting in each beat, so the other one can step back a little.
export const ACTIVE = {
  intro: "both", list: "seller", check: "seller", verdict: "seller", memory: "seller", create: "seller",
  open: "buyer", offer: "buyer", negotiate: "both", agreed: "both", ship: "seller", release: "buyer", paid: "both", outro: "both",
};
