# An original, soft background bed for the demo: a slow ambient pad in D major with sparse, gentle
# piano-like notes, so the narration never sits on silence. Synthesised from scratch (no samples, no
# third-party music), so it is free to use anywhere.
#
#   python3 scripts/music.py public/audio/demo/music.wav [seconds]
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 44100
out = sys.argv[1]
SECONDS = float(sys.argv[2]) if len(sys.argv) > 2 else 180
N = int(SR * SECONDS)
rng = np.random.default_rng(7)

def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

# I - vi - IV - Vsus, voiced softly (MIDI notes), each held for one bar.
CHORDS = [
    [50, 57, 61, 64, 66],  # Dmaj9 (D A C# E F#)
    [47, 54, 57, 62, 64],  # Bm11 (B F# A D E)
    [43, 50, 54, 59, 62],  # Gmaj7 (G D F# B D)
    [45, 52, 57, 59, 64],  # Asus2 (A E A B E)
]
BAR = 4.8  # seconds per chord: slow and unhurried
t_all = np.arange(N) / SR

def tone(f, n, harmonics=((1, 1.0), (2, 0.18), (3, 0.06)), detune=0.0):
    t = np.arange(n) / SR
    s = np.zeros(n)
    for k, a in harmonics:
        s += a * np.sin(2 * np.pi * f * k * (1 + detune) * t + rng.uniform(0, 2 * np.pi))
    return s

L = np.zeros(N)
R = np.zeros(N)

# Pad: each chord swells in and out, overlapping the next, slightly detuned left and right for width.
bar_n = int(BAR * SR)
fade = int(1.8 * SR)
for b in range(int(SECONDS / BAR) + 1):
    chord = CHORDS[b % len(CHORDS)]
    start = b * bar_n - fade // 2
    n = bar_n + fade
    env = np.ones(n)
    env[:fade] = np.sin(np.linspace(0, np.pi / 2, fade)) ** 2
    env[-fade:] = np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
    pad_l = sum(tone(hz(m), n, detune=-0.0018) for m in chord) * env
    pad_r = sum(tone(hz(m), n, detune=0.0018) for m in chord) * env
    bass = tone(hz(chord[0] - 12), n, harmonics=((1, 1.0), (2, 0.1))) * env * 0.9
    a, z = max(start, 0), min(start + n, N)
    if z <= a:
        continue
    o = a - start
    L[a:z] += (pad_l[o:o + z - a] * 0.16 + bass[o:o + z - a] * 0.22)
    R[a:z] += (pad_r[o:o + z - a] * 0.16 + bass[o:o + z - a] * 0.22)

# Notes: a few soft, decaying notes from each chord an octave up, unevenly placed, never busy.
step = BAR / 6
for b in range(int(SECONDS / BAR) + 1):
    chord = CHORDS[b % len(CHORDS)]
    for i in range(6):
        if rng.random() < 0.42:
            continue
        at = int((b * BAR + i * step + rng.uniform(-0.04, 0.04)) * SR)
        m = chord[rng.integers(1, len(chord))] + 12
        n = int(2.6 * SR)
        t = np.arange(n) / SR
        env = np.exp(-t * 1.9) * (1 - np.exp(-t * 180))
        s = tone(hz(m), n, harmonics=((1, 1.0), (2, 0.32), (3, 0.1), (4, 0.04))) * env
        pan = rng.uniform(0.3, 0.7)
        a, z = at, min(at + n, N)
        if a >= N:
            continue
        L[a:z] += s[: z - a] * 0.11 * (1 - pan) * 2
        R[a:z] += s[: z - a] * 0.11 * pan * 2

# Warmth: roll off the top so it sits under the voice, then a soft room.
sos = butter(2, 2400, "low", fs=SR, output="sos")
L, R = sosfilt(sos, L), sosfilt(sos, R)
ir_n = int(2.8 * SR)
ir_t = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-ir_t * 2.4)
irR = rng.standard_normal(ir_n) * np.exp(-ir_t * 2.4)
irL /= np.abs(irL).sum() ** 0.5 * 40
irR /= np.abs(irR).sum() ** 0.5 * 40
wetL = fftconvolve(L, irL)[:N]
wetR = fftconvolve(R, irR)[:N]
L = L * 0.7 + wetL * 0.5
R = R * 0.7 + wetR * 0.5

st = np.stack([L, R], axis=1)
st /= np.abs(st).max() / 0.7  # peak around -3 dB; the video sets the final level
wavfile.write(out, SR, (st * 32767).astype(np.int16))
print(f"{out} {SECONDS:.0f}s")
