// Prepares the rendered video for the website: a web-sized MP4, a poster frame and a WebVTT captions file
// with the full narration, written into web/public/video/.
//
//   node scripts/publish.mjs   (after `npm run render`)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FPS, buildTimeline } from "../src/timeline.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = fileURLToPath(new URL("../../web/public/video/", import.meta.url));
mkdirSync(out, { recursive: true });
const durations = JSON.parse(readFileSync(`${root}src/durations.json`, "utf8"));
const { marks } = JSON.parse(readFileSync(`${root}public/footage/marks.json`, "utf8"));
const { timeline } = buildTimeline(durations, marks);
const master = `${root}out/how-it-works.mp4`;

// Web MP4: H.264 with fast start, so it begins playing before it has fully downloaded.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-profile:v", "high",
  "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", `${out}how-it-works.mp4`]);

// Poster: the moment the two agents are negotiating, both windows on screen.
const negotiate = timeline.find((b) => b.id === "negotiate");
const posterAt = (negotiate.start + negotiate.frames * 0.6) / FPS;
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", posterAt.toFixed(2), "-i", master, "-frames:v", "1", "-q:v", "3", `${out}how-it-works.jpg`]);

// Captions: the full narration, each beat timed to its voice.
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${sec}.${String(ms % 1000).padStart(3, "0")}`;
};
const cues = timeline.map((b, i) => `${i + 1}\n${ts(b.start / FPS)} --> ${ts(b.start / FPS + b.voice)}\n${b.vo}`);
writeFileSync(`${out}how-it-works.vtt`, `WEBVTT\n\n${cues.join("\n\n")}\n`);

for (const f of ["how-it-works.mp4", "how-it-works.jpg", "how-it-works.vtt"]) console.log(f, `${(statSync(out + f).size / 1024 / 1024).toFixed(2)} MB`);
