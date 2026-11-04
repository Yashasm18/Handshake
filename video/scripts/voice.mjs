// Narration with the Kokoro "bm_fable" voice (British storyteller), the same way the Qosmix videos do it.
// Writes public/audio/<beat>.wav and src/durations.json.
//
//   node scripts/voice.mjs            (all beats)   node scripts/voice.mjs intro paid   (some)
import { env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { beats } from "../src/beats.js";

// Reuse an already-downloaded model when there is one, instead of fetching 400 MB again.
const shared = `${os.homedir()}/Documents/YT/binance/node_modules/@huggingface/transformers/.cache/`;
if (fs.existsSync(`${shared}onnx-community/Kokoro-82M-v1.0-ONNX`)) env.cacheDir = shared;

const root = fileURLToPath(new URL("..", import.meta.url));
const audio = `${root}public/audio/`;
fs.mkdirSync(audio, { recursive: true });
const durFile = `${root}src/durations.json`;
const dur = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, "utf8")) : {};

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
const VOICE = process.env.VOICE || "bm_fable";
const SPEED = +(process.env.SPEED || 0.92);
const only = process.argv.slice(2);

// A few sentences per pass, so the model paces them itself. Kokoro drops words past ~500 phonemes,
// so a line is split into chunks of at most ~32 words.
const chunks = (vo) => {
  const sents = vo.match(/[^.?!]+[.?!]+/g).map((s) => s.trim());
  const out = [];
  let cur = "";
  for (const s of sents) {
    if (cur && `${cur} ${s}`.split(" ").length > 32) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
};
const gap = (c) => (c.endsWith("?") ? 0.6 : 0.42);

for (const b of beats) {
  if (!b.vo || (only.length && !only.includes(b.id))) continue;
  const cs = chunks(b.vo);
  const parts = [];
  for (let i = 0; i < cs.length; i++) {
    const a = await tts.generate(cs[i], { voice: VOICE, speed: SPEED });
    const f = `${audio}_${b.id}_${i}.wav`;
    await a.save(f);
    parts.push(f);
  }
  const inputs = parts.flatMap((p) => ["-i", p]);
  // Only leading silence is trimmed; every tail is kept, so no word is clipped.
  const chain = parts.map((_, i) => `[${i}:a]silenceremove=start_periods=1:start_threshold=-60dB,apad=pad_dur=${i < parts.length - 1 ? gap(cs[i]) : 0.3}[a${i}]`).join(";");
  const cat = `${parts.map((_, i) => `[a${i}]`).join("")}concat=n=${parts.length}:v=0:a=1,loudnorm=I=-18:TP=-2:LRA=11,aresample=48000[o]`;
  execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${chain};${cat}`, "-map", "[o]", `${audio}${b.id}.wav`]);
  parts.forEach((p) => fs.unlinkSync(p));
  dur[b.id] = +execFileSync("ffprobe", ["-v", "0", "-show_entries", "format=duration", "-of", "csv=p=0", `${audio}${b.id}.wav`]).toString().trim();
  console.log(b.id.padEnd(10), `${cs.length} chunk(s)`, dur[b.id].toFixed(2), "s");
}
fs.writeFileSync(durFile, JSON.stringify(dur, null, 1));
console.log("TOTAL speech", Object.values(dur).reduce((a, b) => a + b, 0).toFixed(1), "s");
