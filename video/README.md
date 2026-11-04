# "See how it works" video

The narrated walkthrough on the landing page: one real deal on the live site, recorded from both sides at once (buyer on the left, seller on the right), narrated in the Kokoro `bm_fable` voice and composed with [Remotion](https://www.remotion.dev/).

## Make it again

```bash
cd video
npm install
node scripts/record.mjs     # a real deal on the live site, both sides, in headless Chrome
node scripts/footage.mjs    # frames -> public/footage/{buyer,seller}.mp4 and marks.json
node scripts/voice.mjs      # narration -> public/audio/*.wav and src/durations.json
npm run render              # -> out/how-it-works.mp4 (1920x1080)
node scripts/publish.mjs    # -> web/public/video/ (web MP4, poster, captions)
```

The agents' price is different every run, so after recording, update the numbers in [`src/beats.js`](src/beats.js) to match `public/footage/marks.json` (`facts`), then run the voice and render steps.

## How it fits together

| File | What it does |
|---|---|
| [`scripts/record.mjs`](scripts/record.mjs) | Drives the buyer and the seller in two browsers with separate cookies. Frames come from Chrome's screencast with their capture times, so both sides share one clock. Each step is marked. |
| [`src/beats.js`](src/beats.js) | The script: each beat's narration, on-screen caption and the sponsors that light up, mapped to the recorded marks. |
| [`src/timeline.js`](src/timeline.js) | Lays the beats on the narration and maps each one onto its stretch of footage. |
| [`src/HowItWorks.jsx`](src/HowItWorks.jsx) | The composition: two browser windows, the acting side highlighted, Newsreader captions and the sponsor strip. |

Recording runs on the PayPal sandbox; no real money moves.
