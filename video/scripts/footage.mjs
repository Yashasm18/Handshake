// Turns the recorded screencast frames into one 30 fps video per side, each frame held until the next
// one arrives, both on the same clock starting at 0. Writes public/footage/{buyer,seller}.mp4 and marks.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TAKE = fileURLToPath(new URL("../take/", import.meta.url));
const OUT = fileURLToPath(new URL("../public/footage/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const take = JSON.parse(readFileSync(`${TAKE}take.json`, "utf8"));
const end = take.marks.at(-1).t;

for (const name of ["buyer", "seller"]) {
  // Chrome's first frames can arrive before the viewport settles; they'd skew the whole video's aspect.
  const frames = take[name].filter((f) => f.t <= end && f.t > 0.5);
  // Start both sides at time 0 with their first frame, and end both at the same moment.
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const start = i === 0 ? 0 : f.t;
    const next = i + 1 < frames.length ? frames[i + 1].t : end;
    lines.push(`file '${TAKE}${name}/${f.file}'`, `duration ${Math.max(0.001, next - start).toFixed(4)}`);
  });
  lines.push(`file '${TAKE}${name}/${frames.at(-1).file}'`);
  writeFileSync(`${TAKE}${name}.ffconcat`, lines.join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${TAKE}${name}.ffconcat`,
    "-vf", "fps=30,scale=1440:1800:flags=lanczos,setsar=1,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", `${OUT}${name}.mp4`]);
  console.log(name, frames.length, "frames ->", `${OUT}${name}.mp4`);
}
writeFileSync(`${OUT}marks.json`, JSON.stringify({ marks: take.marks, facts: take.facts }, null, 1));
console.log("marks", take.marks.map((m) => `${m.id}@${m.t.toFixed(1)}`).join(" "));
