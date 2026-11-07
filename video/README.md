# Demo video

The narrated demo on the landing page, in the README and on [YouTube](https://youtu.be/qnwLbxLTqNE): under three minutes, full screen, built from one real deal on the live site with real PayPal sandbox calls. It's composed in code with [Remotion](https://www.remotion.dev/), so it can be rebuilt exactly whenever the product changes.

## Make it again

Needs Node 22+, Chrome, ffmpeg, and Python 3 with NumPy and SciPy (for the music).

```bash
cd video
npm install
npm run capture                         # a real deal on the live site -> public/shots/*.png + shots.json
npm run voice                           # narration -> public/audio/demo/*.wav + src/demo/durations.json
python3 scripts/music.py public/audio/demo/music.wav 180   # the original music bed
npm run render                          # -> out/demo-raw.mp4 (2560x1440)
npm run loudness                        # -> out/demo.mp4 at -14 LUFS, YouTube's standard
npm run publish                         # -> web/public/video/ (web MP4, poster, captions) and the README poster
```

`npm run studio` opens the compositions to preview and adjust. The stills, audio and renders stay local (git-ignored); only the code that makes them is here.

## How it fits together

| File | What it does |
|---|---|
| [`scripts/capture.mjs`](scripts/capture.mjs) | Runs a whole deal on the live site in headless Chrome, as a scam victim, a seller and a buyer: a scam stopped, a listing, a PayPal hold, the agents negotiating, a wrong label stopped, delivery, payout. Saves a sharp still of each moment and where its button is. |
| [`src/demo/beats.js`](src/demo/beats.js) | The script: what the narrator says, the caption, and which stills (and zooms) each beat shows. |
| [`src/demo/timeline.js`](src/demo/timeline.js) | Lays every beat and still on the narration; the website's captions are timed from the same place. |
| [`src/demo/Demo.jsx`](src/demo/Demo.jsx) | The video: full-screen stills with a cursor, clicks and zooms, the three-step card, and captions in the site's own type. |
| [`scripts/voice.mjs`](scripts/voice.mjs) | The narration, in the open-source Kokoro `am_puck` voice. |
| [`scripts/music.py`](scripts/music.py) | An original ambient music bed, synthesised from scratch: no samples, no third-party music. |
| [`scripts/publish-demo.mjs`](scripts/publish-demo.mjs) | The website's copy: a 1080p MP4 that starts playing at once, a poster and WebVTT captions. |
| [`src/demo/Thumbnail.jsx`](src/demo/Thumbnail.jsx), [`YouTubeThumbs.jsx`](src/demo/YouTubeThumbs.jsx), [`Gallery.jsx`](src/demo/Gallery.jsx) | The thumbnails and the image gallery, in the same type and colours. |

Everything runs on the PayPal sandbox; no real money moves.
