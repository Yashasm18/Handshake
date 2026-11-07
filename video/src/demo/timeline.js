// Where every beat and shot of the demo sits in time. Shared by the video (Demo.jsx) and by
// scripts/publish-demo.mjs, so the website's captions are timed exactly like the narration.
export const FPS = 30;
export const GAP = 0.35; // seconds of breath after each line
export const LEAD = 0.25; // the picture arrives a moment before the voice
export const OUTRO_HOLD = 2.6;

export function buildDemoTimeline(beats, durations, shots) {
  const series = (prefix) => shots.filter((s) => s.id.startsWith(`${prefix}-`)).map((s) => s.id);
  let frame = 0;
  const timeline = beats.map((b) => {
    const voice = durations[b.id] ?? 3;
    const frames = Math.round((LEAD + voice + (b.kind === "outro" ? OUTRO_HOLD : GAP)) * FPS);
    const start = frame;
    frame += frames;
    const list = (b.shots ?? []).flatMap((s) => (s.series ? series(s.id).map((id) => ({ id, quick: true })) : [s]));
    // Quick frames (a live series) share one slot; everything else shares the rest.
    const quick = list.filter((s) => s.quick).length;
    const slots = list.length - quick + (quick ? 1 : 0);
    const per = slots ? frames / slots : frames;
    let at = 0;
    const clips = list.map((s) => {
      const len = s.quick ? per / quick : per;
      const c = { ...s, start: start + Math.round(at), frames: Math.round(len) };
      at += len;
      return c;
    });
    return { ...b, start, frames, voice, clips };
  });
  return { timeline, total: frame };
}
