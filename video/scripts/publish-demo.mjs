// Prepares the rendered demo for the website and the README: a web MP4 that starts playing before it has
// fully downloaded, a poster frame, and WebVTT captions timed from the same timeline as the narration.
//
//   npx remotion render src/index.jsx Demo out/demo.mp4 --scale=1.3333333333333333 --crf=16
//   node scripts/publish-demo.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beats } from "../src/demo/beats.js";
import { FPS, LEAD, buildDemoTimeline } from "../src/demo/timeline.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const web = fileURLToPath(new URL("../../web/public/video/", import.meta.url));
const docs = fileURLToPath(new URL("../../docs/assets/", import.meta.url));
const durations = JSON.parse(readFileSync(`${root}src/demo/durations.json`, "utf8"));
const { shots } = JSON.parse(readFileSync(`${root}public/shots/shots.json`, "utf8"));
const { timeline, total } = buildDemoTimeline(beats, durations, shots);
const master = `${root}out/demo.mp4`;

// Web MP4 at 1080p, sharp at the player's size and light enough to start at once. YouTube has the 1440p master.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-vf", "scale=1920:-2:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-profile:v", "high",
  "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", `${web}demo.mp4`]);

// Website poster: the landing page, once the intro has faded in.
const intro = timeline.find((b) => b.id === "intro");
const posterAt = ((intro.start + 75) / FPS).toFixed(2);
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", posterAt, "-i", master, "-frames:v", "1", "-vf", "scale=1920:-2", "-q:v", "3", `${web}demo.jpg`]);
// README poster: the YouTube thumbnail with a play button; on GitHub it links to the video on YouTube.
execFileSync("npx", ["remotion", "still", "src/index.jsx", "ReadmePoster", `${docs}demo-poster.jpg`, "--image-format=jpeg", "--jpeg-quality=88"], { cwd: root, stdio: "ignore" });

// Captions: each line split into sentences, timed by length across the voice, so no cue is a wall of text.
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}.${p(ms % 1000, 3)}`;
};
const cues = [];
for (const b of timeline) {
  const parts = b.vo.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? [b.vo];
  const chars = parts.reduce((n, x) => n + x.length, 0);
  let t = b.start / FPS + LEAD;
  for (const x of parts) {
    const len = (b.voice * x.length) / chars;
    cues.push(`${cues.length + 1}\n${ts(t)} --> ${ts(t + len)}\n${x}`);
    t += len;
  }
}
writeFileSync(`${web}demo.vtt`, `WEBVTT\n\n${cues.join("\n\n")}\n`);

const mins = Math.floor(total / FPS / 60), secs = Math.round((total / FPS) % 60);
console.log(`length ${mins}:${String(secs).padStart(2, "0")}`);
for (const f of [`${web}demo.mp4`, `${web}demo.jpg`, `${web}demo.vtt`, `${docs}demo-poster.jpg`]) console.log(f.split("/").slice(-3).join("/"), `${(statSync(f).size / 1024 / 1024).toFixed(2)} MB`);
