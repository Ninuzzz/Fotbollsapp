"""
Allsvenskantipset – egen "läktarhype"-musik för brag-videon (25 s, 120 BPM, A-moll).
Allt syntetiseras här (inga samplingar/licenser): trummor, bas, stadionhorn,
läktarkör ("oh-oh-oh"), publikvrål och tuta – synkat mot videons klipp.

Klipp (s):  0 Excel · 3 avslöjande · 6 gå med · 9 tippa · 12 live · 15.5 tipstabellen
            18.5 chatten · 22 heroes · 23 logga
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, sys

SR = 44100
DUR = 25.0
N = int(SR * DUR)
rng = np.random.default_rng(2026)
L = np.zeros(N)
R = np.zeros(N)
REV = np.zeros((2, N))  # reverb-send

BPM = 120
B = 60 / BPM  # 0.5 s


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def add(sig, t0, gain=1.0, pan=0.0, rev=0.0):
    i = int(t0 * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[i : i + len(sig)] += sig * gl * 1.414
    R[i : i + len(sig)] += sig * gr * 1.414
    if rev:
        REV[0, i : i + len(sig)] += sig * gl * rev
        REV[1, i : i + len(sig)] += sig * gr * rev


def tvec(d):
    return np.arange(int(d * SR)) / SR


def note(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def saw(f, d, detune_cents=0.0, vib=0.0):
    t = tvec(d)
    ff = f * 2 ** (detune_cents / 1200) * (1 + vib * np.sin(2 * np.pi * 5.2 * t))
    ph = np.cumsum(ff) / SR
    return 2 * (ph - np.floor(ph + 0.5))


# ── Trummor ─────────────────────────────────────────────────────────────
def kick(g=1.0):
    t = tvec(0.42)
    f = 44 + 120 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(len(t)), 2000) * np.exp(-t * 400) * 0.35
    return np.tanh((body + click) * 1.6) * g


def snare():
    t = tvec(0.28)
    n = bp(rng.standard_normal(len(t)), 1200, 9000) * np.exp(-t * 20)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 35) * 0.6
    return n * 0.8 + tone


def clap():
    t = tvec(0.35)
    raw = rng.standard_normal(len(t))
    e = np.zeros(len(t))
    for k, off in enumerate([0, 0.009, 0.018, 0.028]):
        e += (t >= off) * np.exp(-np.clip(t - off, 0, None) * (90 if k < 3 else 16))
    return bp(raw, 900, 5000) * e * 0.9


def hat(open_=False):
    t = tvec(0.28 if open_ else 0.06)
    return hp(rng.standard_normal(len(t)), 7500) * np.exp(-t * (13 if open_ else 90)) * (0.5 if open_ else 0.35)


def crash(d=2.6):
    t = tvec(d)
    n = hp(rng.standard_normal(len(t)), 4500) * np.exp(-t * 1.6)
    return n * 0.55


def tom(f0):
    t = tvec(0.3)
    f = f0 * (1 + 0.6 * np.exp(-t * 25))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.9


# ── Melodiska lager ─────────────────────────────────────────────────────
def brass(f, d, g=1.0):
    t = tvec(d)
    s = sum(saw(f, d, c, 0.004) for c in (-9, -3, 3, 9)) / 4 + 0.5 * saw(f / 2, d, 0, 0.004)
    att = np.clip(t / 0.03, 0, 1)
    rel = np.clip((d - t) / 0.08, 0, 1)
    swell = 0.75 + 0.25 * np.clip(t / 0.15, 0, 1)
    return lp(s, 2600) * att * rel * swell * g


def choir(f, d, g=1.0):
    """Läktarkör: flera lätt ostämda röster genom 'oh'-formanter."""
    out = np.zeros(int(d * SR))
    for v in range(7):
        det = rng.uniform(-18, 18)
        delay = int(rng.uniform(0, 0.03) * SR)
        s = saw(f * (2 if v % 3 == 0 else 1), d, det, 0.012)
        s = bp(s, 380, 700) * 1.3 + bp(s, 800, 1250) * 0.7 + bp(s, 2300, 2900) * 0.15
        s = np.roll(s, delay)
        s[:delay] = 0
        out += s
    t = tvec(d)
    env = np.clip(t / 0.06, 0, 1) * np.clip((d - t) / 0.12, 0, 1)
    return out / 7 * env * g * 2.2


def bass_note(f, d):
    t = tvec(d)
    s = saw(f, d) * 0.7 + np.sin(2 * np.pi * f * t) * 0.8
    return lp(s, 420) * np.exp(-t * 3.5) * np.clip((d - t) / 0.02, 0, 1)


def air_horn(d=0.55):
    t = tvec(d)
    scoop = 2 ** ((-2 * np.exp(-t * 18)) / 12)
    s = np.zeros(len(t))
    for f in (440, 466.2, 554.4):
        s += np.tanh(3 * np.sin(2 * np.pi * np.cumsum(f * scoop) / SR))
    env = np.clip(t / 0.02, 0, 1) * np.clip((d - t) / 0.06, 0, 1)
    return bp(s, 300, 4000) * env * 0.33


def riser(d):
    t = tvec(d)
    n = rng.standard_normal(len(t))
    out = np.zeros(len(t))
    # svepande bandpass: gör i bitar
    seg = int(0.05 * SR)
    for i in range(0, len(t), seg):
        c = 400 + 7000 * (i / len(t)) ** 2
        out[i : i + seg] = bp(n[i : i + seg + 0], c * 0.7, min(c * 1.4, 18000))
    return out * (t / d) ** 2 * 0.5


# ── Publik ──────────────────────────────────────────────────────────────
def crowd_bed():
    n = rng.standard_normal((2, N))
    n = np.stack([bp(n[0], 250, 2600, 3), bp(n[1], 250, 2600, 3)])
    # "sorl": långsam modulering
    mod = lp(rng.standard_normal(N), 3) * 25
    return n * (1 + 0.35 * np.tanh(mod))


def swell(t0, peak, rise, fall):
    t = np.arange(N) / SR
    e = np.where(t < t0, np.exp(-((t0 - t) / rise) ** 2), np.exp(-(t - t0) / fall))
    return e * peak


# ════════════════════════ ARRANGEMANG ══════════════════════════════════
CHORDS = {"Am": [57, 60, 64], "F": [53, 57, 60], "C": [48, 55, 64], "G": [55, 59, 62]}
PROG = ["Am", "F", "C", "G"]
BASS = {"Am": 45, "F": 41, "C": 48, "G": 43}
# Läktarsång per 4 takter (beats): (midi, start-beat, längd-beats)
CHANT = [
    (76, 0, 1), (76, 1, 1), (76, 2, 0.5), (74, 2.5, 0.5), (72, 3, 1),
    (72, 4, 1), (69, 5, 1.8),
    (76, 8, 1), (76, 9, 1), (76, 10, 0.5), (74, 10.5, 0.5), (79, 11, 1),
    (74, 12, 2), (71, 14, 1.4),
]

KICK = kick()
SNARE, CLAP = snare(), clap()
HATC, HATO = hat(), hat(True)

# Intro (0–3): dämpad puls + virvelbuild + riser
for b in range(6):
    add(lp(KICK, 180), b * B, 0.55)
roll_t = 1.5
step = 0.25
while roll_t < 3.0 - 1e-6:
    k = (roll_t - 1.5) / 1.5
    add(SNARE, roll_t, 0.25 + 0.5 * k, pan=0.1)
    roll_t += step if k < 0.4 else (0.125 if k < 0.75 else 0.0625)
add(riser(1.6), 1.4, 0.7, rev=0.3)

# Sektioner
def groove(t_start, t_end, kick_on=True, chant=False, lead=False, clap_on=True):
    t = t_start
    while t < t_end - 1e-6:
        beat = int(round((t - 3.0) / B))
        bar = beat // 4
        chord = PROG[bar % 4]
        pos = beat % 4
        if kick_on:
            add(KICK, t, 1.0)
        if clap_on and pos in (1, 3):
            add(CLAP, t, 0.8, pan=0.05, rev=0.25)
        add(HATO, t + B / 2, 0.55, pan=-0.3)
        add(HATC, t + B / 4, 0.4, pan=0.35)
        add(HATC, t + 3 * B / 4, 0.3, pan=0.35)
        # bas: åttondelar med oktavhopp
        bn = BASS[chord]
        add(bass_note(note(bn), B / 2 * 0.95), t, 0.55)
        add(bass_note(note(bn + (12 if pos % 2 else 0)), B / 2 * 0.95), t + B / 2, 0.45)
        # ackordstöt på takt-ettan
        if pos == 0:
            for m in CHORDS[chord]:
                add(brass(note(m + 12), 0.32), t, 0.22, pan=rng.uniform(-0.4, 0.4), rev=0.35)
        t += B


def melody(t0, t_end, voice="brass", g=1.0, octave=0):
    phrase = 16 * B
    base = t0
    while base < t_end - 1e-6:
        for m, sb, lb in CHANT:
            st = base + sb * B
            if st >= t_end:
                break
            d = lb * B * 0.95
            if voice == "brass":
                add(brass(note(m + octave), d), st, 0.5 * g, pan=-0.15, rev=0.4)
            else:
                add(choir(note(m - 12 + octave), d), st, 0.55 * g, pan=0.15, rev=0.7)
        base += phrase


# 3.0 DROP
add(KICK, 3.0, 1.3)
add(crash(), 3.0, 0.9, rev=0.2)
add(air_horn(), 3.0, 0.9, pan=0.2, rev=0.4)
for m in CHORDS["Am"]:
    add(brass(note(m + 12), 0.9), 3.0, 0.35, rev=0.5)

groove(3.0, 18.5)
melody(7.0, 18.5, "brass")                 # hornen in från "gå med"
melody(11.0, 18.5, "choir", g=0.9)          # läktarkören från "live"
for t, f in [(5.625, 160), (5.75, 130), (5.875, 100), (8.625, 150), (8.75, 110), (11.75, 120), (11.875, 95)]:
    add(tom(f), t, 0.8, pan=0.2 if f > 120 else -0.2, rev=0.2)

# 15.5 tipstabellen: tuta + crash
add(crash(1.8), 15.5, 0.6, rev=0.2)
add(air_horn(0.4), 15.5, 0.6, pan=-0.2, rev=0.4)

# 18.5–20.5 chatten: breakdown utan kick, kören bär
groove(18.5, 20.5, kick_on=False, clap_on=True)
melody(18.5, 22.0, "choir", g=0.8)
groove(20.5, 22.0)
# virvel in i Heroes
rt = 21.5
while rt < 22.0 - 1e-6:
    add(SNARE, rt, 0.35 + (rt - 21.5) * 1.0, rev=0.2)
    rt += 0.0625
add(riser(0.6), 21.4, 0.5, rev=0.3)

# 22.0 Heroes + 23.0 logga: slutträff och ringande ackord
add(KICK, 22.0, 1.2)
add(crash(), 22.0, 0.7, rev=0.2)
groove(22.0, 23.0)
add(KICK, 23.0, 1.4)
add(crash(3.0), 23.0, 0.9, rev=0.3)
add(air_horn(0.7), 23.0, 0.7, rev=0.5)
for m in CHORDS["Am"] + [69]:
    add(brass(note(m + 12), 1.9), 23.0, 0.3, rev=0.6)
    add(choir(note(m), 1.9), 23.0, 0.35, rev=0.8)

# Publik: sorl + vrål vid drop, tipstabell och logga
crowd = crowd_bed()
env = 0.06 + swell(3.1, 0.35, 0.9, 1.2) + swell(15.6, 0.22, 0.5, 1.0) + swell(23.1, 0.45, 0.6, 1.6)
env *= np.clip((DUR - np.arange(N) / SR) / 1.2, 0, 1)
L += crowd[0] * env * 0.55
R += crowd[1] * env * 0.55

# ── Reverb (enkel konvolution) ──
tir = tvec(1.6)
ir = np.stack([rng.standard_normal(len(tir)), rng.standard_normal(len(tir))]) * np.exp(-tir / 0.45)
ir = np.stack([lp(ir[0], 6000), lp(ir[1], 6000)])
wet = np.stack([fftconvolve(REV[0], ir[0])[:N], fftconvolve(REV[1], ir[1])[:N]]) * 0.08
L += wet[0]
R += wet[1]

# ── Master: lätt lågcut, glue via mjuk klippning, fade ──
mix = np.stack([hp(L, 30), hp(R, 30)])
mix = np.tanh(mix * 0.55) / np.tanh(0.55)
fade = np.clip((DUR - np.arange(N) / SR) / 1.8, 0, 1) ** 1.5
mix *= fade
mix /= np.max(np.abs(mix)) / 0.89  # ≈ −1 dBFS

out = sys.argv[1] if len(sys.argv) > 1 else "hype.wav"
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out, f"{DUR}s", "rms dBFS", round(20 * np.log10(np.sqrt(np.mean(mix**2))), 1))
