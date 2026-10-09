#!/usr/bin/env python3
"""
make_music.py - original soundtrack + SFX kit for the Miteiru promo video.

Renders (all 48 kHz / 16-bit / stereo):
  ../public/music.wav     36.000 s kawaii future bass, 150 BPM, D major
  ../public/sfx/*.wav     whoosh, whoosh_rev, click, pop, impact, tick, swish_up
  ./cues.json             the arrangement exactly as rendered

Everything is synthesised from scratch with numpy/scipy (no samples) and is
deterministic (fixed seeds).  The melody, voicings and rhythms are original;
only the progression is the stock J-pop "royal road" (IV-V-iii-vi).

Usage:  python make_music.py [--no-sfx] [--no-verify]
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import time
import zlib

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d, uniform_filter1d

# ----------------------------------------------------------------------------- grid
SR = 48000
BPM = 150
BEAT = 60.0 / BPM          # 0.4 s  = 19200 samples
BAR = 4 * BEAT             # 1.6 s  = 76800 samples
STEP = BEAT / 4            # 16th   = 4800 samples
DUR = 36.0
N_TOTAL = int(round(DUR * SR))
SILENCE_FROM = 35.9

TARGET_LUFS = -11.5
CEILING_DBTP = -1.25

HERE = os.path.dirname(os.path.abspath(__file__))
PROMO = os.path.dirname(HERE)
OUT_WAV = os.path.join(PROMO, "public", "music.wav")
SFX_DIR = os.path.join(PROMO, "public", "sfx")
CUES_JSON = os.path.join(HERE, "cues.json")
# Only used to cross-check loudness; set FFMPEG or put ffmpeg on PATH.
FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or ""


def S(t):
    """seconds -> sample index (exact on the 64th-note grid: 1200 samples)."""
    return int(round(t * SR))


def T(bar, beat=0.0):
    """time of (1-indexed bar, 0-indexed beat) in seconds."""
    return round((bar - 1) * BAR + beat * BEAT, 6)


def db(x):
    return 10.0 ** (np.asarray(x, dtype=float) / 20.0)


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def rng_for(*key):
    return np.random.default_rng(zlib.crc32(repr(key).encode()))


def tvec(n):
    return np.arange(n) / SR


def r4(t):
    return round(float(t), 4)


# ----------------------------------------------------------------------------- helpers
def stereo(x, pan=0.0):
    """mono -> stereo with constant-power pan (centre = unity per channel)."""
    if x.ndim == 2:
        return x
    a = (pan + 1.0) * np.pi / 4.0
    return np.stack([x * np.cos(a), x * np.sin(a)]) * np.sqrt(2.0)


def fade(x, fin=0.0, fout=0.0):
    x = np.array(x, dtype=float, copy=True)
    n = x.shape[-1]
    if fin > 0:
        k = min(n, max(1, S(fin)))
        x[..., :k] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
    if fout > 0:
        k = min(n, max(1, S(fout)))
        x[..., n - k:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(k) + 1) / k)
    return x


def place(dst, sig, i):
    L, n = sig.shape[-1], dst.shape[-1]
    a, b = max(i, 0), min(i + L, n)
    if b > a:
        dst[..., a:b] += sig[..., a - i:b - i]


def adsr(n, gate, a=0.003, d_tau=None, sus=1.0, r=0.03):
    """n samples total, gate = samples before release; raised-cos attack/release."""
    t = tvec(n)
    env = np.ones(n) if d_tau is None else sus + (1.0 - sus) * np.exp(-t / d_tau)
    na = min(n, max(1, S(a)))
    env[:na] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
    g = min(max(gate, 0), n)
    nr = max(1, S(r))
    rel = np.zeros(n)
    rel[:g] = 1.0
    k = min(nr, n - g)
    if k > 0:
        rel[g:g + k] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(k) + 1) / nr)
    return env * rel


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)) + 1e-30))


def to_db(x):
    return 20.0 * np.log10(max(float(x), 1e-12))


# ----------------------------------------------------------------------------- filters
_SOS = {}


def sos(kind, fc, order=2):
    key = (kind, tuple(np.atleast_1d(fc).tolist()), order)
    if key not in _SOS:
        _SOS[key] = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
    return _SOS[key]


def filt(x, kind, fc, order=2):
    return signal.sosfilt(sos(kind, fc, order), x, axis=-1)


def unit(x):
    return x / (np.std(x) + 1e-12)


def rbj(kind, fc, q):
    w0 = 2 * np.pi * fc / SR
    c, al = np.cos(w0), np.sin(w0) / (2 * q)
    if kind == "lp":
        b = np.array([(1 - c) / 2, 1 - c, (1 - c) / 2])
    elif kind == "hp":
        b = np.array([(1 + c) / 2, -(1 + c), (1 + c) / 2])
    else:  # constant 0 dB peak band-pass
        b = np.array([al, 0.0, -al])
    a = np.array([1 + al, -2 * c, 1 - al])
    return b / a[0], a / a[0]


def tv_filter(x, fc, kind, q=0.707, block=64):
    """Block-wise time-varying biquad. fc: per-sample cutoff array (Hz)."""
    x = np.atleast_2d(x)
    n = x.shape[-1]
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    y = np.empty_like(x)
    zi = np.zeros((x.shape[0], 2))
    for i in range(0, n, block):
        j = min(n, i + block)
        b, a = rbj(kind, float(np.clip(fc[(i + j) // 2], 15.0, 0.45 * SR)), q)
        y[:, i:j], zi = signal.lfilter(b, a, x[:, i:j], axis=-1, zi=zi)
    return y


# ----------------------------------------------------------------------------- oscillators
def _polyblep(ph, dt):
    out = np.zeros_like(ph)
    m = ph < dt
    x = ph[m] / dt[m]
    out[m] = 2 * x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    out[m] = x * x + 2 * x + 1
    return out


def _phase(freq, n, phase0):
    if np.ndim(freq) == 0:
        inc = float(freq) / SR
        return (phase0 + np.arange(n) * inc) % 1.0, np.full(n, inc)
    dt = np.asarray(freq, dtype=float) / SR
    return (phase0 + np.concatenate(([0.0], np.cumsum(dt[:-1])))) % 1.0, dt


def saw(freq, n, phase0=0.0):
    """PolyBLEP anti-aliased sawtooth."""
    ph, dt = _phase(freq, n, phase0)
    return 2 * ph - 1 - _polyblep(ph, dt)


def square(freq, n, phase0=0.0):
    ph, dt = _phase(freq, n, phase0)
    ph2 = (ph + 0.5) % 1.0
    return (2 * ph - 1 - _polyblep(ph, dt)) - (2 * ph2 - 1 - _polyblep(ph2, dt))


SS_DET = np.array([-1.0, -0.63, -0.28, 0.0, 0.30, 0.66, 1.0])
SS_PAN = np.array([-1.0, 0.9, -0.65, 0.0, 0.65, -0.9, 1.0])
SS_GAIN = np.array([0.72, 0.82, 0.92, 1.0, 0.92, 0.82, 0.72])


def supersaw(midis, n, key, detune=21.0, width=0.95, voices=7):
    """7-voice detuned PolyBLEP supersaw per note, random phases, stereo spread."""
    rng = rng_for("ss", key)
    sel = np.arange(7) if voices == 7 else np.array([0, 2, 3, 4, 6])
    out = np.zeros((2, n))
    for m in midis:
        f0 = float(mtof(m))
        for v in sel:
            cents = SS_DET[v] * detune + rng.uniform(-1.5, 1.5)
            y = saw(f0 * 2 ** (cents / 1200.0), n, rng.random())
            a = (SS_PAN[v] * width + 1) * np.pi / 4
            out[0] += SS_GAIN[v] * np.cos(a) * y
            out[1] += SS_GAIN[v] * np.sin(a) * y
    return out * (np.sqrt(2.0) / np.sqrt(len(midis) * len(sel)))


# ----------------------------------------------------------------------------- space
def make_ir(rt60, length, key, predelay=0.012, damp=0.45, hicut=9000.0, lowcut=180.0):
    """Synthetic stereo IR: decorrelated noise, 3-band exponential decay, early taps."""
    n = S(length)
    t = tvec(n)
    rng = rng_for("ir", key)
    ir = np.zeros((2, n))
    for ch in range(2):
        w = rng.standard_normal(n)
        lo = filt(w, "lowpass", 500.0)
        hi = filt(w, "highpass", 4000.0)
        mid = w - lo - hi
        dec = lambda rt: 10 ** (-3.0 * t / rt)
        y = lo * dec(rt60 * 1.1) + mid * dec(rt60) + 0.8 * hi * dec(rt60 * damp)
        y *= 1 - np.exp(-t / 0.012)
        for _ in range(6):  # sparse early reflections
            i = S(rng.uniform(0.004, 0.045))
            y[i] += rng.choice([-1, 1]) * rng.uniform(4, 9)
        ir[ch] = y
    ir = filt(ir, "lowpass", hicut, 2)
    ir = filt(ir, "highpass", lowcut, 1)
    ir = fade(ir, 0.0, length * 0.15)
    ir = np.concatenate([np.zeros((2, S(predelay))), ir], axis=1)
    return ir / np.sqrt(np.sum(ir ** 2) / 2.0)


IR = {}


def irs():
    if not IR:
        IR["short"] = make_ir(0.9, 1.1, "short", predelay=0.008, damp=0.5)
        IR["long"] = make_ir(2.0, 2.5, "long", predelay=0.018, damp=0.42)
        IR["huge"] = make_ir(3.4, 3.9, "huge", predelay=0.025, damp=0.38, hicut=8000.0)
    return IR


def reverb(x, ir):
    n = x.shape[-1]
    mono = 0.5 * (x[0] + x[1])
    return np.stack([signal.oaconvolve(mono, ir[0])[:n], signal.oaconvolve(mono, ir[1])[:n]])


def pingpong(x, delay, fb, taps, lp_hz, hp_hz=250.0):
    """Tempo-synced ping-pong delay (wet only); each repeat a little darker."""
    n = x.shape[-1]
    d = S(delay)
    cur = filt(0.5 * (x[0] + x[1]), "highpass", hp_hz, 1)
    lp = sos("lowpass", lp_hz, 1)
    out = np.zeros((2, n))
    for k in range(taps):
        cur = signal.sosfilt(lp, cur)
        sh = np.zeros(n)
        sh[d:] = cur[:-d]
        cur = sh * fb
        out[k % 2] += cur
    return out


# ----------------------------------------------------------------------------- drums
_CACHE = {}


def kick(vel=1.0, soft=False):
    """Sine kick: 150->45 Hz pitch envelope, click transient, light saturation."""
    key = ("kick", soft)
    if key not in _CACHE:
        n = S(0.45)
        t = tvec(n)
        f = 45 + 105 * np.exp(-t / 0.03) + (0 if soft else 240 * np.exp(-t / 0.0022))
        ph = 2 * np.pi * (np.cumsum(f) - f[0]) / SR
        amp = np.where(t < 0.03, 1.0, np.exp(-(t - 0.03) / (0.12 if soft else 0.16)))
        amp *= 1 - np.exp(-t / 0.0004)
        y = np.sin(ph) * amp
        if not soft:
            nz = rng_for("kickclick").standard_normal(n)
            y += 0.15 * unit(filt(nz, "highpass", 1800.0)) * np.exp(-t / 0.0016) * (1 - np.exp(-t / 0.00015))
        drive = 1.3 if soft else 1.8
        y = np.tanh(drive * y) / np.tanh(drive)
        _CACHE[key] = fade(y, 0.0, 0.03)
    return stereo(_CACHE[key] * vel)


def snare(vel=1.0, tone=200.0, tau=0.13, key=0):
    """~200 Hz tone body + band-passed noise."""
    n = S(min(0.5, 0.06 + 4 * tau))
    t = tvec(n)
    rng = rng_for("snare", key)
    fd = tone * (1 + 0.3 * np.exp(-t / 0.008))
    ph = 2 * np.pi * (np.cumsum(fd) - fd[0]) / SR
    body = np.sin(ph) * np.exp(-t / 0.055) + 0.4 * np.sin(1.68 * ph) * np.exp(-t / 0.03)
    nz = unit(filt(rng.standard_normal(n), "bandpass", [1400.0, 9500.0]))
    sizzle = unit(filt(rng.standard_normal(n), "highpass", 7000.0))
    y = 0.62 * body + (0.42 * nz + 0.12 * sizzle) * np.exp(-t / tau)
    y *= 1 - np.exp(-t / 0.0003)
    y = np.tanh(1.3 * y) / np.tanh(1.3)
    return stereo(fade(y, 0.0, 0.01) * vel)


def clap(vel=1.0, key=0):
    """3-4 noise bursts ~10 ms apart, last one with a longer tail."""
    n = S(0.4)
    t = tvec(n)
    rng = rng_for("clap", key)
    common = rng.standard_normal(n)
    offs, gains = [0.0, 0.0095, 0.0195, 0.0305], [0.75, 0.85, 0.8, 1.0]
    env = np.zeros(n)
    for o, g in zip(offs, gains):
        i = S(o)
        tt = t[: n - i]
        tau = 0.085 if o == offs[-1] else 0.0055
        env[i:] += g * np.exp(-tt / tau) * (1 - np.exp(-tt / 0.0003))
    out = np.zeros((2, n))
    for ch in range(2):
        w = 0.75 * common + 0.66 * rng.standard_normal(n)
        out[ch] = unit(filt(w, "bandpass", [850.0, 5000.0])) * env
    return fade(out, 0.0, 0.01) * vel * 0.5


METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat(vel=1.0, kind="closed", var=0, pan=0.18):
    key = ("hat", kind, var)
    if key not in _CACHE:
        n = S(0.08 if kind == "closed" else 0.42)
        t = tvec(n)
        rng = rng_for("hat", kind, var)
        nz = unit(filt(rng.standard_normal(n), "highpass", 7000.0, 4))
        metal = sum(square(f * rng.uniform(0.99, 1.01), n, rng.random()) for f in METAL)
        metal = unit(filt(metal, "bandpass", [7000.0, 12500.0]))
        tau = 0.016 if kind == "closed" else 0.12
        env = np.exp(-t / tau) * (1 - np.exp(-t / 0.0002))
        _CACHE[key] = fade((0.8 * nz + 0.45 * metal) * env * 0.5, 0.0, 0.006)
    return stereo(_CACHE[key] * vel, pan)


def shaker(vel=1.0, var=0):
    key = ("shaker", var)
    if key not in _CACHE:
        n = S(0.1)
        t = tvec(n)
        rng = rng_for("shaker", var)
        nz = unit(filt(rng.standard_normal(n), "bandpass", [4500.0, 12000.0]))
        na = S(0.007)
        env = np.exp(-np.maximum(t - 0.007, 0) / 0.028)
        env[:na] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
        _CACHE[key] = fade(nz * env * 0.4, 0.0, 0.006)
    return stereo(_CACHE[key] * vel, -0.32)


def tamb(vel=1.0, var=0):
    key = ("tamb", var)
    if key not in _CACHE:
        n = S(0.28)
        t = tvec(n)
        rng = rng_for("tamb", var)
        nz = unit(filt(rng.standard_normal(n), "highpass", 5500.0)) * np.exp(-t / 0.05)
        jing = np.zeros(n)
        for f in rng.uniform(5200, 11800, 7):
            jing += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / rng.uniform(0.05, 0.11))
        y = 0.45 * nz + 0.3 * jing / 7 * 2.5
        y *= (1 - np.exp(-t / 0.0003)) * (1 + 0.6 * (t > 0.012) * np.exp(-np.maximum(t - 0.012, 0) / 0.02))
        _CACHE[key] = fade(y * 0.5, 0.0, 0.02)
    return stereo(_CACHE[key] * vel, 0.35)


def crash(vel=1.0, length=2.4, key=0, attack=0.0008):
    """Noise + inharmonic partial cymbal, decorrelated L/R."""
    n = S(length)
    t = tvec(n)
    rng = rng_for("crash", key)
    out = np.zeros((2, n))
    for ch in range(2):
        nz = rng.standard_normal(n)
        hi = unit(filt(nz, "highpass", 4000.0))
        mid = unit(filt(nz, "bandpass", [700.0, 4000.0]))
        env = 0.55 * np.exp(-t / 0.3) + 0.45 * np.exp(-t / 1.1)
        metal = np.zeros(n)
        for f, d in zip(np.exp(rng.uniform(np.log(2500), np.log(12000), 60)), rng.uniform(0.3, 1.2, 60)):
            metal += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / d)
        out[ch] = (0.7 * hi + 0.25 * mid) * env + 0.4 * metal / np.sqrt(60) * env ** 0.5
    out *= 1 - np.exp(-t / attack)
    return fade(out, 0.0, min(0.08, length * 0.2)) * vel * 0.35


def tick_snd(vel=1.0, f=4200.0, length=0.03):
    n = S(length)
    t = tvec(n)
    nz = unit(filt(rng_for("tick").standard_normal(n), "highpass", 6000.0))
    y = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.0045)
         + 0.45 * np.sin(2 * np.pi * 1.5 * f * t) * np.exp(-t / 0.0025)
         + 0.25 * nz * np.exp(-t / 0.0007))
    y *= 1 - np.exp(-t / 0.00012)
    return stereo(fade(y, 0.0, 0.004) * vel)


# ----------------------------------------------------------------------------- tonal instruments
def bell(midi, vel=1.0, length=0.9, decay=0.42):
    """Glassy FM tine (1:2) + a quick 4f glass partial."""
    n = S(length)
    t = tvec(n)
    f = float(mtof(midi))
    idx = 1.4 * np.exp(-t / 0.045) + 0.22
    car = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 2 * f * t))
    y = car * np.exp(-t / decay)
    if 4 * f < 16000:
        y += 0.22 * np.sin(2 * np.pi * 4 * f * t + 0.5 * np.sin(2 * np.pi * f * t)) * np.exp(-t / 0.05)
    y *= 1 - np.exp(-t / 0.0012)
    return fade(y * vel, 0.0, 0.03)


def pluck(midi, vel=1.0, length=0.45):
    """Additive pluck: higher harmonics decay faster (a filter envelope, alias-free)."""
    n = S(length)
    t = tvec(n)
    f = float(mtof(midi))
    y = np.zeros(n)
    for k in range(1, int(min(16, 17000 // f)) + 1):
        w = (1.0 if k % 2 else 0.5) / k
        y += w * np.sin(2 * np.pi * k * f * t) * np.exp(-t * (5.0 + 10.0 * (k - 1)))
    y *= 1 - np.exp(-t / 0.0008)
    return fade(y * vel, 0.0, 0.02)


def arp_note(midi, vel=1.0):
    return stereo(0.75 * bell(midi, vel) + 0.4 * np.pad(pluck(midi, vel), (0, S(0.9) - S(0.45))))


def bass_note(midi, dur, key=0, decay=None):
    """Sub sine (lightly saturated) + LP'd saw an octave up for small speakers."""
    n = S(dur + 0.04)
    t = tvec(n)
    f = float(mtof(midi))
    rng = rng_for("bass", key)
    sub = np.tanh(1.5 * np.sin(2 * np.pi * f * t)) / np.tanh(1.5)
    mid = filt(saw(2 * f, n, rng.random()), "lowpass", 420.0, 2)
    y = sub + 0.55 * mid
    env = adsr(n, S(dur), a=0.004, r=0.03)
    if decay:
        env *= np.exp(-t / decay)
    return stereo(y * env)


def stab_sig(chord, length, vel, key, decay=0.16, sus=0.12):
    v = VOICING[chord]
    notes = v["pad"] + [v["pad"][-1] + 12]
    n = S(length + 0.05)
    sig = supersaw(notes, n, ("stab", key), detune=22, width=1.0)
    return sig * adsr(n, S(length), a=0.002, d_tau=decay, sus=sus, r=0.04) * vel


VOWELS = {
    "a": [(800, 1.0), (1200, 0.6), (2800, 0.25)],
    "o": [(500, 1.0), (900, 0.55), (2600, 0.2)],
    "i": [(330, 0.7), (2400, 1.0), (3200, 0.45)],
    "e": [(550, 0.9), (1900, 0.8), (2700, 0.35)],
}


def chop_hit(chord, steps, octave, vowel, key, vel=1.0):
    """Gated supersaw chord through a vowel formant filter (vocal-chop flavour)."""
    v = VOICING[chord]
    notes = [m + 12 * octave for m in v["pad"][1:]]
    n = S(steps * STEP + 0.03)
    sig = supersaw(notes, n, ("chop", key), detune=16, width=0.8, voices=5)
    sig *= adsr(n, S(steps * STEP * 0.8), a=0.0015, d_tau=0.08, sus=0.6, r=0.02)
    y = 0.3 * sig
    for f, g in VOWELS[vowel]:
        b, a = rbj("bp", f * (1.15 if octave else 1.0), 6.0)
        y = y + 2.2 * g * signal.lfilter(b, a, sig, axis=-1)
    return y * (0.25 / (rms(y) + 1e-9)) * vel


def render_lead(notes, t0, t1, detune=0.0, vib_phase=0.0, phase0=0.0, glide=0.032):
    """Mono additive square/saw-ish pluck lead with portamento, delayed vibrato and a
    per-note brightness envelope.  notes: (t_on, dur, midi, vel), absolute seconds."""
    n = S(t1 - t0)
    t = tvec(n)
    notes = sorted(notes)
    pitch = np.full(n, float(notes[0][2]))
    marks = np.zeros(n, dtype=np.int64)
    amp = np.zeros(n)
    for ton, dur, m, vel in notes:
        i = S(ton) - S(t0)
        pitch[i:] = m
        marks[i] = i
        g = S(dur) - S(0.012)
        L = min(g + S(0.09), n - i)
        env = adsr(g + S(0.09), g, a=0.004, d_tau=0.14, sus=0.62, r=0.07)[:L] * vel
        amp[i:i + L] = np.maximum(amp[i:i + L], env)
    last = np.maximum.accumulate(marks)
    tn = (np.arange(n) - last) / SR
    a = np.exp(-1.0 / (glide * SR))
    p0 = pitch[0]
    sm = signal.lfilter([1 - a], [1, -a], pitch - p0) + p0
    vib = 0.2 * np.clip((tn - 0.14) / 0.25, 0, 1) * np.sin(2 * np.pi * 5.5 * t + vib_phase)
    f = mtof(sm + vib + detune)
    ph = 2 * np.pi * (phase0 + np.concatenate(([0.0], np.cumsum(f[:-1]))) / SR)
    tilt = 0.05 + 0.2 * (1 - np.exp(-tn / 0.1))
    y = np.zeros(n)
    for k in range(1, 25):
        w = (1.0 if k % 2 else 0.45) / k
        aa = np.clip((19000.0 - k * f) / 3000.0, 0, 1)
        y += w * np.exp(-(k - 1) * tilt) * aa * np.sin(k * ph)
    return y * amp


# ----------------------------------------------------------------------------- fx
def impact_sig(punch=True, length=2.2, key=0):
    """Sub boom + noise crash (+ kick punch) with a short reverb tail."""
    n = S(length)
    t = tvec(n)
    rng = rng_for("impact", key)
    fb = 30 + 55 * np.exp(-t / 0.09)
    boom = np.sin(2 * np.pi * (np.cumsum(fb) - fb[0]) / SR) * np.exp(-t / 0.55)
    boom *= 1 - np.exp(-t / 0.0015)
    boom = np.tanh(1.6 * boom) / np.tanh(1.6)
    thump = unit(filt(rng.standard_normal(n), "lowpass", 180.0)) * np.exp(-t / 0.1) * (1 - np.exp(-t / 0.001))
    ft = 60 + 90 * np.exp(-t / 0.05)                      # tom-like body sweep 150 -> 60 Hz
    tom = np.sin(2 * np.pi * (np.cumsum(ft) - ft[0]) / SR) * np.exp(-t / 0.16) * (1 - np.exp(-t / 0.001))
    slam = unit(filt(rng.standard_normal(n), "bandpass", [250.0, 2500.0])) * np.exp(-t / 0.06)
    slam *= 1 - np.exp(-t / 0.0005)
    body = np.tanh(1.5 * (0.8 * tom + 1.0 * slam))
    dry = stereo(0.95 * boom + 0.25 * thump + 0.75 * body) + 1.4 * crash(1.0, length, ("impact", key), attack=0.0006)
    if punch:
        place(dry, 0.8 * kick(1.0), 0)
    wet = filt(reverb(dry, irs()["long"]), "highpass", 250.0)
    return fade(dry + 0.3 * wet, 0.0, 0.25)


def noise_riser(dur, key, f0=350.0, f1=9000.0):
    n = S(dur)
    x = tvec(n) / dur
    nz = rng_for("nriser", key).standard_normal((2, n))
    fc = f0 * (f1 / f0) ** (x ** 1.25)
    y = 0.75 * tv_filter(nz, fc, "bp", q=1.1) + 0.06 * filt(nz, "highpass", 5000.0) * x
    y *= db(-30 + 30 * x ** 1.3)
    return fade(y, 0.05, 0.005)


def pitch_riser(dur, key, m0=57, m1=81):
    n = S(dur)
    x = tvec(n) / dur
    f = mtof(m0 + (m1 - m0) * x ** 1.6)
    rng = rng_for("priser", key)
    y = np.zeros((2, n))
    for det, pan in [(-0.12, -0.7), (0.0, 0.0), (0.12, 0.7)]:
        y += stereo(saw(f * 2 ** (det / 12), n, rng.random()), pan)
    y = filt(filt(y, "lowpass", 5000.0), "highpass", 200.0)
    return fade(y * db(-26 + 26 * x ** 1.2) * 0.25, 0.05, 0.005)


def reverse_swell(dur, key):
    """Reversed cymbal + its reverb: swells up and ends on its peak."""
    c = crash(1.0, dur + 0.5, ("swell", key), attack=0.0015)
    wet = reverb(c, irs()["long"])[:, : c.shape[1]]
    wet = fade(wet[:, ::-1][:, -S(dur):], 0.0, 0.06)      # reversed tail, tucked under the end
    dry = c[:, ::-1][:, -S(dur):]
    n = dry.shape[1]
    x = (np.arange(n) + 1) / n
    y = (dry + 0.45 * wet) * x ** 1.6
    y *= 1 + 2.2 * np.exp(-(n - 1 - np.arange(n)) / (0.006 * SR))  # snap into the final transient
    y = fade(y, 0.03, 0.0008)
    return y / np.max(np.abs(y))


def reverse_chord(chord, dur, key):
    v = VOICING[chord]
    n = S(dur + 0.6)
    sig = supersaw(v["pad"] + [v["pad"][-1] + 12], n, ("rch", key), detune=22)
    sig *= adsr(n, n, a=0.002, d_tau=0.35, sus=0.0)
    sig = filt(filt(sig, "highpass", 150.0), "lowpass", 9000.0)
    y = sig + 0.7 * reverb(sig, irs()["long"])
    y = y[:, ::-1][:, -S(dur):]
    return fade(y, 0.05, 0.002)


# ----------------------------------------------------------------------------- music data
PROG = ["Gmaj9", "A6", "F#m7", "Bm9"]
VOICING = {  # root = sub-bass MIDI note; pad = wide voicing (root + upper structure)
    "Gmaj9": dict(root=31, pad=[55, 66, 69, 71, 74], bell=[74, 78, 81, 83, 86]),
    "A6": dict(root=33, pad=[57, 64, 66, 69, 73], bell=[73, 76, 78, 81, 85]),
    "F#m7": dict(root=30, pad=[54, 64, 66, 69, 73], bell=[76, 78, 81, 85, 88]),
    "Bm9": dict(root=35, pad=[59, 62, 66, 69, 73], bell=[74, 78, 81, 85, 86]),
    "A7sus4": dict(root=33, pad=[57, 64, 67, 69, 74], bell=[74, 76, 79, 81, 86]),
    "A7": dict(root=33, pad=[57, 64, 67, 69, 73], bell=[73, 76, 79, 81, 85]),
}
ARP_PAT = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 3, 2, 1, 3, 4]
HAT_VEL = [0.95, 0.42, 0.7, 0.5]

# Lead top-line (original).  Per bar: (16th step, length in 16ths, MIDI).
M1 = [
    [(0, 2, 78), (3, 3, 81), (6, 2, 83), (10, 2, 81), (12, 4, 86)],
    [(0, 3, 85), (3, 3, 83), (6, 4, 81), (11, 2, 78), (14, 2, 76)],
    [(0, 2, 78), (3, 3, 81), (6, 2, 85), (10, 2, 83), (12, 4, 81)],
    [(0, 3, 83), (3, 3, 86), (6, 6, 85), (14, 2, 81)],
]
M1_END = [(0, 2, 83), (2, 2, 85), (4, 4, 86), (8, 2, 85), (10, 2, 81)]  # bar 14, leaves room for the fill
M2 = [  # drop B: more on-the-beat
    [(0, 3, 83), (4, 3, 81), (8, 2, 83), (10, 2, 86), (12, 4, 81)],
    [(0, 3, 85), (4, 3, 83), (8, 2, 81), (10, 2, 85), (12, 4, 88)],
    [(0, 3, 85), (4, 3, 81), (8, 2, 85), (10, 2, 88), (12, 4, 85)],
    [(0, 3, 86), (4, 3, 85), (8, 2, 83), (10, 2, 81), (12, 4, 78)],
]
CHOP_A = [(0, 2, 0), (3, 2, 0), (6, 1, 1), (7, 1, 0), (8, 2, 0), (10, 1, 0), (11, 2, 1), (14, 2, 0)]
CHOP_B = [(0, 2, 0), (3, 2, 0), (6, 2, 0), (9, 1, 1), (10, 2, 0), (12, 1, 0), (13, 1, 1), (14, 2, 0)]
CHOP_DROPB = [(2, 1, 0), (6, 1, 1), (7, 1, 0), (10, 1, 0), (14, 1, 1), (15, 1, 0)]
VOWEL_CYCLE = ["a", "o", "i", "a", "e", "o", "a", "i"]

FADER = dict(kick=db(-3.0), snare=db(-7.0), hats=db(-13.0), cym=db(-12.0), pad=db(-6.5),
             stab=db(-8.0), chop=db(-6.5), arp=db(-15.0), lead=db(-14.5), bass=db(-8.0),
             fx=db(-6.0), final=db(-6.0), swell=db(-7.5))
SEND = dict(pad=0.10, stab=0.22, chop=0.12, arp=0.30, lead=0.20, final=0.55)
RET_LONG, RET_SHORT = 0.40, 0.22
SC_DEPTH = dict(pad=10.0, chop=4.0, arp=3.0, lead=3.0, bass=12.0, rev=4.0)


# ----------------------------------------------------------------------------- arrangement containers
class Seg:
    """A stretch of music between hard cuts.  Its output is windowed so nothing
    (reverb, delay, release tails) can leak into the following gap."""

    def __init__(self, name, t0, t1, end_fade):
        self.name, self.t0, self.t1 = name, t0, t1
        self.i0, self.i1 = S(t0), S(t1)
        self.n = self.i1 - self.i0
        self.end_fade = end_fade
        self.bus = {}
        self.duck = np.zeros(self.n)
        self.hp_sweeps = []

    def add_i(self, bus, sig, i_abs):
        if bus not in self.bus:
            self.bus[bus] = np.zeros((2, self.n))
        place(self.bus[bus], stereo(sig), i_abs - self.i0)

    def add_duck(self, t, strength, release, attack=0.004, p=1.3):
        """Sidechain shape: 0..1 (1 = fully ducked); combined by max."""
        na, nr = S(attack), S(release)
        shape = strength * np.concatenate([
            0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na),
            0.5 + 0.5 * np.cos(np.pi * (np.arange(nr) / nr) ** p)])
        start = S(t) - self.i0 - na
        a, b = max(0, start), min(self.n, start + len(shape))
        if b > a:
            self.duck[a:b] = np.maximum(self.duck[a:b], shape[a - start:b - start])

    def window(self):
        w = np.ones(self.n)
        k = S(self.end_fade)
        w[-k:] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(k) + 1) / k)
        return w


class Song:
    def __init__(self):
        self.segs = [
            Seg("S1_intro_build1", 0.0, T(6, 3), end_fade=0.003),     # hard cut at 9.2
            Seg("S2_drops_build2", T(7), T(20, 3.5), end_fade=0.003),  # 9.6 .. hard cut at 31.8
            Seg("S3_final", T(21), SILENCE_FROM, end_fade=1.5),       # 32.0 .. fade to 0 at 35.9
        ]
        self.free = np.zeros((2, N_TOTAL))  # swells that live inside the gaps
        self.kicks, self.snares, self.accents, self.lead_onsets, self.ticks = [], [], [], [], []

    def seg_at(self, i):
        for sg in self.segs:
            if sg.i0 <= i < sg.i1:
                return sg
        raise ValueError(f"event at {i / SR:.4f}s falls inside a gap")

    def add(self, bus, sig, t):
        self.seg_at(S(t)).add_i(bus, sig, S(t))

    def add_ending(self, bus, sig, t_end):
        i = S(t_end) - sig.shape[-1]
        self.seg_at(i).add_i(bus, sig, i)

    def duck(self, t, strength, release):
        self.seg_at(S(t)).add_duck(t, strength, release)

    def free_ending(self, sig, t_end):
        place(self.free, stereo(sig), S(t_end) - sig.shape[-1])


def snare_roll(song, stages, v0, v1, tag):
    hits = []
    for ta, tb, div in stages:
        step = BAR / div
        k = 0
        while ta + k * step < tb - 1e-9:
            hits.append(round(ta + k * step, 6))
            k += 1
    for i, t in enumerate(hits):
        x = i / (len(hits) - 1)
        step = next(BAR / d for ta, tb, d in stages if ta - 1e-9 <= t < tb)
        song.add("snare", snare(v0 * (v1 / v0) ** x, 185 + 75 * x, min(0.14, 1.1 * step + 0.02), (tag, i)), t)
    return {
        "start": r4(stages[0][0]), "end": r4(stages[-1][1]), "hits": len(hits),
        "stages": [{"start": r4(a), "end": r4(b), "division": f"1/{d}",
                    "hits": int(round((b - a) / (BAR / d)))} for a, b, d in stages],
    }


def flam(song, t, vel, key):
    song.add("snare", snare(vel * 0.45, 210, 0.08, (key, "g")), t - 0.018)
    song.add("snare", snare(vel, 205, 0.11, (key, "m")), t)


def chord_timeline():
    tl = []
    for bar in range(1, 5):
        tl.append((bar, 0, 4, PROG[bar - 1]))
    tl += [(5, 0, 4, "Gmaj9"), (6, 0, 2, "A7sus4"), (6, 2, 4, "A7")]
    for bar in range(7, 19):
        tl.append((bar, 0, 4, PROG[(bar - 7) % 4]))
    tl += [(19, 0, 4, "Gmaj9"), (20, 0, 2, "A7sus4"), (20, 2, 4, "A7"), (21, 0, 4, "Gmaj9 (hold)")]
    return tl


def arrange(song):
    cues = {"fills": [], "snare_rolls": [], "risers": [], "filter_sweeps": [], "crashes": [], "impacts": []}

    def arp_bar(bar, chord, vel_scale, steps=range(16), octave=0, every=1):
        for st in steps:
            if st % every:
                continue
            vel = (1.0 if st % 4 == 0 else (0.72 if st % 2 == 0 else 0.58)) * vel_scale
            song.add("arp", arp_note(VOICING[chord]["bell"][ARP_PAT[st]] + 12 * octave, vel), T(bar, st / 4))

    # ---------------------------------------------------------------- intro, bars 1-4
    for bar in range(1, 5):
        ch, t0 = PROG[bar - 1], T(bar)
        v = VOICING[ch]
        n = S(BAR + 0.2)
        pad = supersaw(v["pad"], n, ("ipad", bar), detune=18, width=0.85)
        song.add("pad", pad * adsr(n, S(BAR), a=0.4 if bar == 1 else 0.03, r=0.15) * 0.85, t0)
        arp_bar(bar, ch, 0.62)
        for b in range(4):
            song.add("hats", tick_snd(0.45 if b == 0 else 0.32), T(bar, b))
            song.ticks.append(T(bar, b))
        if bar >= 2:
            for e in range(8):
                song.add("hats", hat(0.42 if e % 2 == 0 else 0.3, "closed", e % 4), T(bar, e / 2))
        if bar >= 3:
            song.add("kick", kick(0.62, soft=True), t0)
            song.kicks.append(t0)
            song.duck(t0, 0.4, 0.5)
            song.add("bass", bass_note(v["root"], BAR, ("ib", bar)) * 0.5, t0)

    # ---------------------------------------------------------------- build 1, bars 5-6
    s1 = song.segs[0]
    for b in range(4):
        t = T(5, b)
        song.add("stab", stab_sig("Gmaj9", 0.3, 0.75 + 0.06 * b, ("b1", b)), t)
        song.add("kick", kick(0.6), t)
        song.kicks.append(t)
        song.duck(t, 0.35, 0.3)
    for e in range(6):
        ch = "A7sus4" if e < 4 else "A7"
        song.add("stab", stab_sig(ch, 0.17, 0.85 + 0.03 * e, ("b1e", e), decay=0.1), T(6, e / 2))
        song.add("kick", kick(0.55 + 0.04 * e), T(6, e / 2))  # 8th-note kick run into the gap
        song.kicks.append(T(6, e / 2))
    for e in range(8):
        song.add("hats", hat(0.35, "closed", e % 4), T(5, e / 2))
    for st in range(12):
        song.add("hats", hat(0.3 + 0.3 * st / 11, "closed", st % 4), T(6, st / 4))
    arp_bar(5, "Gmaj9", 0.55)
    arp_bar(6, "A7sus4", 0.55, steps=range(8))
    arp_bar(6, "A7", 0.55, steps=range(8, 12))
    cues["snare_rolls"].append(snare_roll(song, [(T(5, 0), T(5, 2), 4), (T(5, 2), T(6, 0), 8),
                                                 (T(6, 0), T(6, 2), 16), (T(6, 2), T(6, 3), 32)], 0.25, 0.9, "roll1"))
    song.add("fx", noise_riser(T(6, 3) - T(5), "r1"), T(5))
    song.add("fx", pitch_riser(T(6, 3) - T(5, 2), "p1"), T(5, 2))
    cues["risers"] += [{"type": "noise", "start": T(5), "end": T(6, 3)},
                       {"type": "pitch (A3->A5)", "start": T(5, 2), "end": T(6, 3)}]
    s1.hp_sweeps.append((T(5), T(6, 3), 60.0, 1600.0))
    cues["filter_sweeps"] += [{"type": "low-pass on chords", "start": 0.0, "end": T(5), "from_hz": 400, "to_hz": 2000},
                              {"type": "high-pass on music", "start": T(5), "end": T(6, 3), "from_hz": 60, "to_hz": 1600}]
    sw1 = reverse_swell(0.9, 1)
    song.free_ending(sw1 * FADER["swell"], T(7))

    # ---------------------------------------------------------------- drop A, bars 7-14
    song.add("fx", impact_sig(punch=False, key=1), T(7))
    cues["impacts"].append({"time": T(7), "what": "sub boom + noise crash + reverb (drop A)"})
    cues["crashes"].append(T(7))
    song.add("cym", crash(0.55, 2.4, "c11"), T(11))
    cues["crashes"].append(T(11))
    lead_notes = []
    for bar in range(7, 15):
        i = bar - 7
        ch = PROG[i % 4]
        v = VOICING[ch]
        pat = [0, 10] if i % 2 == 0 else [0, 6, 10]
        for st in pat:
            t = T(bar, st / 4)
            song.add("kick", kick(1.0 if st == 0 else 0.85), t)
            song.kicks.append(t)
            if st % 4:
                song.duck(t, 0.55, 0.18)
        for b in range(4):
            song.duck(T(bar, b), 1.0, 0.36)
        t3 = T(bar, 2)
        song.add("snare", snare(0.9, key=("dA", bar)), t3)
        song.add("snare", clap(0.95, key=("dA", bar)), t3)
        song.snares.append(t3)
        roll = bar in (8, 12)
        for st in range(16):
            if roll and st >= 12:
                continue
            jit = rng_for("hatv", bar, st).uniform(-0.08, 0.08)
            song.add("hats", hat((HAT_VEL[st % 4] + jit) * 1.0, "closed", st % 4), T(bar, st / 4))
        if roll:
            for k in range(8):
                song.add("hats", hat(0.4 + 0.5 * k / 7, "closed", k % 4), T(bar, 3 + k / 8))
        if i % 2 == 0:
            song.add("hats", hat(0.32, "open", 0), T(bar, 3.5))
        n = S(BAR + 0.1)
        pad = supersaw(v["pad"], n, ("dpad", bar), detune=21)
        song.add("pad", pad * adsr(n, S(BAR), a=0.004, r=0.08), T(bar))
        song.add("bass", bass_note(v["root"], BAR, ("db", bar)), T(bar))
        for j, (st, ln, octv) in enumerate(CHOP_A if i % 2 == 0 else CHOP_B):
            if bar in (10, 14) and st >= 12:
                continue  # make room for the fills
            song.add("chop", chop_hit(ch, ln, octv, VOWEL_CYCLE[j % 8], (bar, st),
                                      1.0 if st % 4 == 0 else 0.85), T(bar, st / 4))
        arp_bar(bar, ch, 0.45, octave=1, every=2)
        phrase = M1_END if bar == 14 else M1[i % 4]
        for st, ln, m in phrase:
            lead_notes.append((T(bar, st / 4), ln * STEP, m, 1.0 if st % 4 == 0 else 0.9))
    # fill 1: snare flam 16ths on the last beat of bar 10
    for k in range(4):
        flam(song, T(10, 3 + k / 4), 0.55 + 0.15 * k, ("f10", k))
    cues["fills"].append({"bar": 10, "start": T(10, 3), "end": T(11), "type": "snare flam 16ths (4 hits, crescendo)"})
    # fill 2: reverse Gmaj9 chord swelling into drop B + two flams
    song.add_ending("fx", reverse_chord("Gmaj9", BEAT, "f14") * 0.9, T(15))
    for k, st in enumerate((14, 15)):
        flam(song, T(14, st / 4), 0.7 + 0.2 * k, ("f14", k))
    cues["fills"].append({"bar": 14, "start": T(14, 3), "end": T(15),
                          "type": "reverse Gmaj9 chord swell ending at 22.4 + snare flams at 22.2, 22.3"})

    # ---------------------------------------------------------------- drop B, bars 15-18
    song.add("cym", crash(0.85, 2.4, "c15"), T(15))
    cues["crashes"].append(T(15))
    for bar in range(15, 19):
        i = bar - 15
        ch = PROG[i]
        v = VOICING[ch]
        for b in range(4):
            t = T(bar, b)
            song.add("kick", kick(1.0 if b % 2 == 0 else 0.92), t)
            song.kicks.append(t)
            song.duck(t, 1.0, 0.34)
            song.add("stab", stab_sig(ch, 0.26, 1.0 if b == 0 else 0.85, ("dB", bar, b), decay=0.13), t)
            song.accents.append(t)
            if b in (1, 3):
                song.add("snare", snare(0.85, key=("dB", bar, b)), t)
                song.add("snare", clap(0.9, key=("dB", bar, b)), t)
                song.add("hats", tamb(0.8, b), t)
                song.snares.append(t)
            song.add("hats", hat(0.36, "open", b % 2), T(bar, b + 0.5))
        for st in range(16):
            song.add("hats", shaker([0.5, 0.85, 0.6, 0.95][st % 4], st % 4), T(bar, st / 4))
        n = S(BAR + 0.1)
        pad = supersaw(v["pad"], n, ("dBpad", bar), detune=21)
        song.add("pad", pad * adsr(n, S(BAR), a=0.004, r=0.08) * 0.65, T(bar))
        song.add("bass", bass_note(v["root"], BAR, ("dBb", bar)), T(bar))
        for j, (st, ln, octv) in enumerate(CHOP_DROPB):
            song.add("chop", chop_hit(ch, ln, octv, VOWEL_CYCLE[(j + 2) % 8], ("B", bar, st), 0.8), T(bar, st / 4))
        arp_bar(bar, ch, 0.4, octave=1, every=2)
        for st, ln, m in M2[i]:
            lead_notes.append((T(bar, st / 4), ln * STEP, m, 1.0 if st % 4 == 0 else 0.9))
            song.add("arp", stereo(bell(m + 12, 0.35, length=0.6, decay=0.25)), T(bar, st / 4))  # bell doubling
    # lead: one continuous mono line across both drops (2 slightly detuned layers)
    la = render_lead(lead_notes, T(7), T(19) + 0.3, detune=0.0, vib_phase=0.0, phase0=0.1)
    lb = render_lead(lead_notes, T(7), T(19) + 0.3, detune=0.09, vib_phase=1.9, phase0=0.37)
    song.add("lead", stereo(la, -0.35) + stereo(lb, 0.35), T(7))
    song.lead_onsets = [r4(n[0]) for n in lead_notes]

    # ---------------------------------------------------------------- build 2, bars 19-20
    s2 = song.segs[1]
    for b in (0, 2):
        song.add("kick", kick(0.9 if b == 0 else 0.75), T(19, b))
        song.kicks.append(T(19, b))
        song.duck(T(19, b), 0.6, 0.36)
    n = S(BAR + 0.1)
    pad = supersaw(VOICING["Gmaj9"]["pad"], n, ("b2pad", 19), detune=21)
    song.add("pad", pad * adsr(n, S(BAR), a=0.004, r=0.08) * 0.5, T(19))
    for ch, b0, b1 in (("A7sus4", 0, 2), ("A7", 2, 3.5)):
        n = S((b1 - b0) * BEAT + 0.1)
        pad = supersaw(VOICING[ch]["pad"], n, ("b2pad", ch), detune=21)
        song.add("pad", pad * adsr(n, S((b1 - b0) * BEAT), a=0.004, r=0.08) * 0.5, T(20, b0))
    for k, b in enumerate((2, 2.5, 3)):
        song.add("kick", kick(0.6 + 0.05 * k), T(20, b))  # short kick run into the gap
        song.kicks.append(T(20, b))
    for e in range(8):
        song.add("hats", hat(0.28, "closed", e % 4), T(19, e / 2))
    for b in range(4):
        song.add("stab", stab_sig("Gmaj9", 0.3, 0.8 + 0.05 * b, ("b2", b)), T(19, b))
    for e in range(7):
        ch = "A7sus4" if e < 4 else "A7"
        song.add("stab", stab_sig(ch, 0.17, 0.85 + 0.025 * e, ("b2e", e), decay=0.1), T(20, e / 2))
    arp_bar(19, "Gmaj9", 0.55)
    arp_bar(20, "A7sus4", 0.55, steps=range(8))
    arp_bar(20, "A7", 0.55, steps=range(8, 14))
    cues["snare_rolls"].append(snare_roll(song, [(T(19, 0), T(19, 2), 8), (T(19, 2), T(20, 0), 16),
                                                 (T(20, 0), T(20, 2), 32), (T(20, 2), T(20, 3.5), 64)],
                                          0.25, 0.9, "roll2"))
    song.add("fx", noise_riser(T(20, 3.5) - T(19), "r2", f1=10000.0), T(19))
    song.add("fx", pitch_riser(T(20, 3.5) - T(19, 2), "p2", m0=57, m1=83), T(19, 2))
    cues["risers"] += [{"type": "noise", "start": T(19), "end": T(20, 3.5)},
                       {"type": "pitch (A3->B5)", "start": T(19, 2), "end": T(20, 3.5)}]
    s2.hp_sweeps.append((T(19), T(20, 3.5), 60.0, 1800.0))
    cues["filter_sweeps"].append({"type": "high-pass on music", "start": T(19), "end": T(20, 3.5),
                                  "from_hz": 60, "to_hz": 1800})
    sw2 = reverse_swell(0.7, 2)
    song.free_ending(sw2 * FADER["swell"], T(21))

    # ---------------------------------------------------------------- final hit, bar 21+
    song.add("fx", impact_sig(punch=True, key=2), T(21))
    song.kicks.append(T(21))
    cues["impacts"].append({"time": T(21), "what": "sub boom + kick punch + noise crash + reverb (final hit)"})
    cues["crashes"].append(T(21))
    n = S(SILENCE_FROM - T(21))
    v = VOICING["Gmaj9"]
    fin = supersaw(v["pad"] + [v["pad"][-1] + 12, v["pad"][2] + 12], n, "final", detune=23, width=1.0)
    song.add("final", fin * adsr(n, n, a=0.003, d_tau=1.3, sus=0.0), T(21))
    song.add("bass", bass_note(31, 2.6, "fb", decay=0.9), T(21))
    for k, m in enumerate([74, 78, 81, 83, 86, 90, 93, 98]):
        song.add("arp", arp_note(m, 0.5 + 0.06 * k), T(21, k / 4))
    song.add("arp", arp_note(86, 0.8) + arp_note(93, 0.6), T(21, 3))
    cues["sparkle"] = {"bell_run": [T(21, k / 4) for k in range(8)], "final_bell": T(21, 3)}
    return cues


# ----------------------------------------------------------------------------- mixing
def mixdown(seg, diag):
    n = seg.n
    z = np.zeros((2, n))
    B = {k: seg.bus.get(k, z) for k in
         ["kick", "snare", "hats", "cym", "pad", "stab", "chop", "arp", "lead", "bass", "fx", "final"]}
    sc = lambda depth: db(-depth * seg.duck)[None, :]
    t_abs = seg.t0 + tvec(n)
    I = irs()

    pad = filt(B["pad"], "highpass", 150.0, 2)
    if seg.name.startswith("S1"):
        fc = 400.0 * (2000.0 / 400.0) ** np.clip(t_abs / T(5), 0, 1)
        pad = tv_filter(tv_filter(pad, fc, "lp", 0.54), fc, "lp", 1.5)  # 24 dB/oct, slight resonance
    else:
        pad = filt(pad, "lowpass", 9000.0, 2)
    st = {
        "pad": pad * FADER["pad"] * sc(SC_DEPTH["pad"]),
        "stab": filt(filt(B["stab"], "highpass", 150.0), "lowpass", 10000.0) * FADER["stab"],
        "chop": filt(filt(B["chop"], "highpass", 150.0), "lowpass", 9000.0) * FADER["chop"] * sc(SC_DEPTH["chop"]),
        "arp": (B["arp"] + 0.38 * pingpong(B["arp"], 0.75 * BEAT, 0.45, 7, 5200.0)) * FADER["arp"] * sc(SC_DEPTH["arp"]),
        "lead": (B["lead"] + 0.22 * pingpong(B["lead"], 0.75 * BEAT, 0.36, 6, 4500.0)
                 + 0.12 * pingpong(B["lead"], 0.5 * BEAT, 0.25, 3, 3500.0)[::-1])
        * FADER["lead"] * sc(SC_DEPTH["lead"]),
        "bass": B["bass"] * FADER["bass"] * sc(SC_DEPTH["bass"]),
        "final": filt(filt(B["final"], "highpass", 150.0), "lowpass", 9000.0) * FADER["final"],
    }
    music = sum(st.values())
    send = sum(SEND[k] * st[k] for k in SEND)
    for ta, tb, f0, f1 in seg.hp_sweeps:
        a, b = S(ta) - seg.i0, min(S(tb) - seg.i0, n)
        x = np.arange(b - a) / (b - a)
        fc = f0 * (f1 / f0) ** (x ** 1.4)
        music[:, a:b] = tv_filter(music[:, a:b], fc, "hp", 0.9)
        send[:, a:b] = tv_filter(send[:, a:b], fc, "hp", 0.9)
    rev = filt(reverb(send, I["huge"] if seg.name.startswith("S3") else I["long"]), "highpass", 220.0)
    rev *= RET_LONG * sc(SC_DEPTH["rev"])
    snare_b = B["snare"] * FADER["snare"]
    srev = filt(reverb(snare_b, I["short"]), "highpass", 300.0) * RET_SHORT
    st.update({
        "kick": B["kick"] * FADER["kick"], "snare": snare_b, "snare_rev": srev,
        "hats": B["hats"] * FADER["hats"], "cym": B["cym"] * FADER["cym"],
        "fx": B["fx"] * FADER["fx"], "music_rev": rev,
    })
    out = music + rev + st["kick"] + snare_b + srev + st["hats"] + st["cym"] + st["fx"]
    # diagnostics: per-stem level inside the drops
    for name, (ta, tb) in {"intro": (T(1), T(5)), "build1": (T(5), T(6, 3)), "dropA": (T(7), T(15)),
                           "dropB": (T(15), T(19)), "build2": (T(19), T(20, 3.5))}.items():
        a, b = S(ta) - seg.i0, S(tb) - seg.i0
        if 0 <= a < b <= n:
            diag[name] = {k: (round(to_db(rms(v[:, a:b])), 1), round(to_db(np.max(np.abs(v[:, a:b]))), 1))
                          for k, v in st.items() if np.any(v[:, a:b])}
    out = filt(out, "highpass", 22.0, 2)  # subsonic/DC filter BEFORE the hard-cut window: no ringing into gaps
    return out * seg.window()[None, :]


# ----------------------------------------------------------------------------- mastering & metering
KB1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
KA1 = [1.0, -1.69065929318241, 0.73248077421585]
KB2 = [1.0, -2.0, 1.0]
KA2 = [1.0, -1.99004745483398, 0.99007225036621]


def _kms(x, block_s, hop_s):
    y = signal.lfilter(KB2, KA2, signal.lfilter(KB1, KA1, x, axis=-1), axis=-1)
    blk, hop = S(block_s), S(hop_s)
    p = np.concatenate([np.zeros((2, 1)), np.cumsum(y ** 2, axis=1)], axis=1)
    starts = np.arange(0, y.shape[1] - blk + 1, hop)
    return ((p[:, starts + blk] - p[:, starts]) / blk).sum(axis=0), starts


def lufs_integrated(x):
    z, _ = _kms(x, 0.4, 0.1)
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z1 = z[l > -70]
    rel = -0.691 + 10 * np.log10(z1.mean()) - 10
    return float(-0.691 + 10 * np.log10(z[(l > -70) & (l > rel)].mean()))


def lufs_short_term_max(x):
    z, starts = _kms(x, 3.0, 0.1)
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    k = int(np.argmax(l))
    return float(l[k]), starts[k] / SR


def true_peak_db(x):
    os_ = signal.resample_poly(x, 4, 1, axis=-1)
    return to_db(max(np.max(np.abs(os_)), np.max(np.abs(x))))


def limiter(x, ceiling_db, release=0.08, lookahead=0.003, block=32):
    """Look-ahead brick-wall on 4x-oversampled peaks; zero latency (gain is pre-aligned)."""
    n = x.shape[-1]
    c = float(db(ceiling_db))
    os_ = signal.resample_poly(x, 4, 1, axis=-1)[:, : 4 * n]
    pk = np.maximum(np.abs(os_).reshape(2, n, 4).max(axis=(0, 2)), np.abs(x).max(axis=0))
    req = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    nb = -(-n // block)
    padded = np.ones(nb * block)
    padded[:n] = req
    gb = padded.reshape(nb, block).min(axis=1)
    coef = 1 - np.exp(-block / (release * SR))
    r = np.empty(nb)
    prev = 1.0
    for k in range(nb):
        v = prev + (1.0 - prev) * coef
        if gb[k] < v:
            v = gb[k]
        r[k] = v
        prev = v
    gu = np.repeat(r, block)[:n]
    W = 2 * (S(lookahead) // 2) + 1
    h = W // 2
    mc = minimum_filter1d(gu, W, mode="nearest")
    fwd = np.concatenate([mc[h:], np.full(h, mc[-1])])
    avg = uniform_filter1d(fwd, W, mode="nearest")
    g = np.concatenate([np.full(h, avg[0]), avg[:-h]])
    return x * g[None, :], g


def master(x):
    """Memoryless saturation + gain-only limiter, so silence stays digital silence."""
    sat = lambda y: np.tanh(0.8 * y) / 0.8

    def chain(gain_db, ceiling):
        y, g = limiter(sat(x * db(gain_db)), ceiling)
        return y, g

    g_db = TARGET_LUFS - lufs_integrated(x)
    hist = []
    for it in range(8):
        y, gr = chain(g_db, CEILING_DBTP)
        L = lufs_integrated(y)
        hist.append((g_db, L))
        if abs(L - TARGET_LUFS) < 0.03:
            break
        if len(hist) >= 2 and abs(hist[-1][1] - hist[-2][1]) > 1e-3:
            slope = (hist[-1][1] - hist[-2][1]) / (hist[-1][0] - hist[-2][0])
            g_db += (TARGET_LUFS - L) / max(slope, 0.3)
        else:
            g_db += TARGET_LUFS - L
    ceiling = CEILING_DBTP
    for _ in range(4):  # make sure the true peak really sits below -1 dBTP
        if true_peak_db(y) <= -1.05:
            break
        ceiling -= 0.15
        y, gr = chain(g_db, ceiling)
    y[:, S(SILENCE_FROM):] = 0.0
    return y, {"pre_gain_db": round(float(g_db), 2), "ceiling_dbtp": round(ceiling, 2),
               "max_gain_reduction_db": round(-to_db(gr.min()), 2), "iterations": len(hist)}


def write_wav(path, x):
    x = np.clip(np.round(np.asarray(x).T * 32767.0), -32768, 32767).astype(np.int16)
    wavfile.write(path, SR, x)


# ----------------------------------------------------------------------------- sfx kit
def norm_peak(x, peak_db=-3.0):
    return x * (float(db(peak_db)) / np.max(np.abs(x)))


def sfx_whoosh():
    dur = 0.45
    n = S(dur)
    t = tvec(n)
    x = t / dur
    rng = rng_for("sfx_whoosh")
    nz = rng.standard_normal((2, n))
    nz[1] = 0.6 * nz[0] + 0.8 * nz[1]
    shape = np.sin(np.pi * np.clip(x / 0.85, 0, 1)) ** 1.2
    fc = 350.0 + 4200.0 * shape
    y = tv_filter(nz, fc, "bp", 1.4) + 0.35 * tv_filter(nz, fc * 2.3, "bp", 2.5)
    peak_t = 0.3
    env = np.where(x < peak_t, 0.06 + 0.94 * (0.5 - 0.5 * np.cos(np.pi * x / peak_t)),
                   np.exp(-((x - peak_t) / 0.28) ** 2 * 2.5))
    pan = -0.85 + 1.7 * x
    a = (pan + 1) * np.pi / 4
    y = np.stack([y[0] * np.cos(a), y[1] * np.sin(a)]) * np.sqrt(2) * env
    return norm_peak(fade(y, 0.0, 0.02))


def sfx_click():
    n = S(0.06)
    t = tvec(n)
    rng = rng_for("sfx_click")
    nz = unit(filt(rng.standard_normal(n), "highpass", 3000.0))

    def one(t0, g):
        tt = np.maximum(t - t0, 0)
        on = (t >= t0)
        y = (0.5 * nz * np.exp(-tt / 0.0006) + np.sin(2 * np.pi * 3300 * tt) * np.exp(-tt / 0.0035)
             + 0.6 * np.sin(2 * np.pi * 1650 * tt) * np.exp(-tt / 0.006)
             + 0.5 * np.sin(2 * np.pi * 620 * tt) * np.exp(-tt / 0.008))
        return y * on * (1 - np.exp(-tt / 0.0001)) * g

    y = one(0.0, 1.0) + one(0.034, 0.3)
    y = stereo(fade(y, 0.0, 0.008))
    y[1] = np.roll(y[1], 5) * 0.97  # hint of width
    y[1, :5] = 0
    return norm_peak(y)


def sfx_pop():
    n = S(0.15)
    t = tvec(n)
    f = 380.0 + 900.0 * (1 - np.exp(-t / 0.018))
    ph = 2 * np.pi * (np.cumsum(f) - f[0]) / SR
    env = (1 - np.exp(-t / 0.0008)) * np.exp(-t / 0.045)
    y = np.sin(ph) * env + 0.3 * np.sin(2 * ph) * np.exp(-t / 0.02)
    nz = unit(filt(rng_for("sfx_pop").standard_normal(n), "highpass", 3000.0))
    y += 0.25 * nz * np.exp(-t / 0.001) * (1 - np.exp(-t / 0.0001))
    return norm_peak(stereo(fade(y, 0.0, 0.012)))


def sfx_tick():
    return norm_peak(tick_snd(1.0, 4200.0, 0.03))


def sfx_swish_up():
    dur = 0.3
    n = S(dur)
    t = tvec(n)
    x = t / dur
    rng = rng_for("sfx_swish")
    nz = rng.standard_normal((2, n))
    nz[1] = 0.7 * nz[0] + 0.7 * nz[1]
    fc = 700.0 * (7000.0 / 700.0) ** x
    y = tv_filter(nz, fc, "bp", 2.0)
    f = 400.0 * (1600.0 / 400.0) ** x
    y += 0.25 * np.sin(2 * np.pi * np.cumsum(f) / SR)[None, :]
    env = np.where(x < 0.4, 0.08 + 0.92 * np.sin(np.pi / 2 * x / 0.4), np.cos(np.pi / 2 * (x - 0.4) / 0.6))
    pan = -0.4 + 0.8 * x
    a = (pan + 1) * np.pi / 4
    y = np.stack([y[0] * np.cos(a), y[1] * np.sin(a)]) * np.sqrt(2) * env
    return norm_peak(fade(y, 0.0, 0.01))


def make_sfx():
    os.makedirs(SFX_DIR, exist_ok=True)
    kit = {
        "whoosh": sfx_whoosh(),
        "whoosh_rev": norm_peak(reverse_swell(0.5, "sfx")),
        "click": sfx_click(),
        "pop": sfx_pop(),
        "impact": norm_peak(impact_sig(punch=True, length=2.0, key="sfx")),
        "tick": sfx_tick(),
        "swish_up": sfx_swish_up(),
    }
    for name, y in kit.items():
        write_wav(os.path.join(SFX_DIR, name + ".wav"), y)
    return list(kit)


# ----------------------------------------------------------------------------- verification
def ffmpeg_r128(path):
    if not os.path.exists(FFMPEG):
        return None
    p = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True, errors="replace")
    txt = p.stderr[p.stderr.rfind("Summary:"):]
    get = lambda pat: float(re.search(pat, txt).group(1)) if re.search(pat, txt) else None
    return {"I_LUFS": get(r"I:\s+(-?[\d.]+) LUFS"), "LRA_LU": get(r"LRA:\s+(-?[\d.]+) LU"),
            "true_peak_dBFS": get(r"Peak:\s+(-?[\d.]+) dBFS")}


def onset_offsets(y, times, band=(60.0, 400.0), pre=0.025, post=0.04):
    """Rising edge of a zero-phase band envelope vs. the grid time, in ms.  The edge is
    where the envelope crosses halfway between the pre-onset floor and the local max."""
    mono = y.mean(axis=0)
    env = np.abs(signal.hilbert(signal.sosfiltfilt(sos("bandpass", list(band), 2), mono)))
    offs = []
    for t in times:
        a, i, b = S(t) - S(pre), S(t), S(t) + S(post)
        floor = np.median(env[a:i - S(0.003)])
        seg = env[a:b]
        k = int(np.argmax(seg >= floor + 0.5 * (seg.max() - floor)))
        offs.append((a + k - i) / SR * 1000)
    return np.array(offs)


def rms_peak_offsets(y, times, win=0.01):
    mono = y.mean(axis=0)
    r = np.sqrt(uniform_filter1d(mono ** 2, S(win)))
    out = []
    for t in times:
        a, b = S(t) - S(0.05), S(t) + S(0.12)
        out.append((a + int(np.argmax(r[a:b])) - S(t)) / SR * 1000)
    return np.array(out)


def verify(y_master, music_only, song, cues, info, sfx_names):
    rep = {}
    sr, data = wavfile.read(OUT_WAV)
    rep["file"] = {"sample_rate": sr, "frames": data.shape[0], "channels": data.shape[1], "dtype": str(data.dtype),
                   "duration_s": data.shape[0] / sr}
    x = data.T.astype(np.float64) / 32768.0
    rep["peak_dBFS"] = round(to_db(np.max(np.abs(x))), 2)
    rep["true_peak_dBTP_internal"] = round(true_peak_db(x), 2)
    rep["lufs_integrated_internal"] = round(lufs_integrated(x), 2)
    stm, stt = lufs_short_term_max(x)
    rep["lufs_short_term_max"] = [round(stm, 2), round(stt, 2)]
    rep["dc_offset"] = [float(f"{v:.2e}") for v in x.mean(axis=1)]
    rep["ffmpeg_ebur128"] = ffmpeg_r128(OUT_WAV)
    rep["max_abs_after_35.9s"] = float(np.max(np.abs(data[S(SILENCE_FROM):])))
    rep["master"] = info
    gaps = []
    for g in cues["gaps"]:
        a, b = S(g["start"]), S(g["end"])
        mus = music_only[:, a:b]
        out = x[:, a:b]
        env = np.sqrt(uniform_filter1d(out.mean(0) ** 2, S(0.005)))
        q = len(env) // 4
        gaps.append({"gap": [g["start"], g["end"]],
                     "music_only_max_abs": float(f"{np.max(np.abs(mus)):.3e}"),
                     "output_rms_dBFS_by_quarter": [round(to_db(rms(out[:, k * q:(k + 1) * q])), 1) for k in range(4)],
                     "output_peak_time_s": round((a + int(np.argmax(env))) / SR, 4)})
    rep["gaps"] = gaps
    drop_kicks = [k for k in song.kicks if T(7) <= k < T(19)]
    o = onset_offsets(x, drop_kicks)
    rep["kick_onset_offset_ms"] = {"n": len(o), "median": round(float(np.median(o)), 2),
                                   "max_abs": round(float(np.max(np.abs(o))), 2)}
    rp = rms_peak_offsets(x, drop_kicks)
    rep["kick_rms_peak_offset_ms"] = {"median": round(float(np.median(rp)), 2), "min": round(float(rp.min()), 2),
                                      "max": round(float(rp.max()), 2)}
    rep["kick_onset_outliers_gt3ms"] = {r4(t): round(float(v), 1) for t, v in zip(drop_kicks, o) if abs(v) > 3}
    fo = onset_offsets(x, song.accents)
    fs_ = onset_offsets(x, song.accents, band=(200.0, 2000.0), pre=0.03, post=0.04)
    rep["dropB_every_beat_onset_offset_ms"] = {
        "n": len(fo), "kick_band_median": round(float(np.median(fo)), 2),
        "kick_band_max_abs_excl_22.4": round(float(np.max(np.abs(fo[1:]))), 2),
        "stab_band_median": round(float(np.median(fs_)), 2),
        "note": "22.4 is preceded by the reverse-chord swell, so its rising edge is not measurable"}
    so = onset_offsets(x, [s for s in song.snares if T(7) <= s < T(15)], band=(1500.0, 9000.0), pre=0.03, post=0.04)
    rep["dropA_snare_hiband_onset_offset_ms"] = {"n": len(so), "max_abs": round(float(np.max(np.abs(so))), 2)}
    secs = {}
    for sec in cues["sections"]:
        a, b = S(sec["start"]), S(min(sec["end"], SILENCE_FROM))
        z, _ = _kms(x[:, a:b], 0.4, 0.1)
        secs[sec["name"]] = round(float(-0.691 + 10 * np.log10(z.mean())), 1)
    rep["section_loudness_LUFS_ungated"] = secs
    a, b = S(T(7)), S(T(15))
    f, P = signal.welch(x[:, a:b].mean(0), SR, nperseg=8192)
    bands = {}
    for fc in [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]:
        m = (f >= fc / 2 ** 0.5) & (f < fc * 2 ** 0.5)
        bands[fc] = 10 * np.log10(P[m].sum())
    rep["dropA_octave_bands_rel_1k_dB"] = {str(k): round(v - bands[1000], 1) for k, v in bands.items()}
    L, R = x[0, a:b], x[1, a:b]
    rep["dropA_LR_correlation"] = round(float(np.corrcoef(L, R)[0, 1]), 3)
    rep["dropA_side_to_mid_dB"] = round(to_db(rms(L - R) / rms(L + R)), 1)
    sfx = {}
    for name in sfx_names:
        sr2, d = wavfile.read(os.path.join(SFX_DIR, name + ".wav"))
        y = d.T.astype(np.float64) / 32768.0
        a = np.max(np.abs(y), axis=0)
        pk = a.max()
        sfx[name] = {"dur_s": round(d.shape[0] / sr2, 4), "sr": sr2, "ch": d.shape[1],
                     "peak_dBFS": round(to_db(pk), 2),
                     "first_sample_above_-40dB_rel": int(np.argmax(a >= 0.01 * pk)),
                     "peak_at_s": round(int(np.argmax(a)) / sr2, 4)}
    rep["sfx"] = sfx
    return rep


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-sfx", action="store_true")
    ap.add_argument("--no-verify", action="store_true")
    args = ap.parse_args()
    t_start = time.time()
    song = Song()
    cues = arrange(song)
    print(f"arranged in {time.time() - t_start:.1f}s")
    diag = {}
    mix = np.zeros((2, N_TOTAL))
    for sg in song.segs:
        mix[:, sg.i0:sg.i1] += mixdown(sg, diag)
    music_only = mix.copy()
    mix += filt(song.free, "highpass", 22.0, 2)
    print(f"mixed in {time.time() - t_start:.1f}s")
    y, info = master(mix)
    write_wav(OUT_WAV, y)
    print(f"mastered in {time.time() - t_start:.1f}s -> {OUT_WAV}")

    full = {
        "generator": "promo/music/make_music.py",
        "file": "public/music.wav",
        "sample_rate": SR, "duration_s": DUR, "bpm": BPM, "beat_s": BEAT, "bar_s": BAR,
        "time_signature": "4/4", "key": "D major",
        "grid": "bar N (1-indexed) starts at (N-1)*1.6 s; beat k (0-indexed) of bar N at (N-1)*1.6 + 0.4*k",
        "sections": [
            {"name": "intro", "bars": [1, 4], "start": T(1), "end": T(5)},
            {"name": "build1", "bars": [5, 6], "start": T(5), "end": T(7)},
            {"name": "dropA", "bars": [7, 14], "start": T(7), "end": T(15)},
            {"name": "dropB_montage", "bars": [15, 18], "start": T(15), "end": T(19),
             "note": "four-on-the-floor kick + chord stab on every beat, clap/snare+tamb on beats 2 & 4"},
            {"name": "build2", "bars": [19, 20], "start": T(19), "end": T(21)},
            {"name": "final_hit", "bars": [21, 23], "start": T(21), "end": DUR,
             "note": "Gmaj9 rings out; fade 34.4 -> 35.9; digital silence from 35.9"},
        ],
        "chords": [{"bar": b, "start": T(b, b0), "end": T(b, b1), "chord": c} for b, b0, b1, c in chord_timeline()],
        "impacts": cues["impacts"],
        "gaps": [
            {"start": T(6, 3), "end": T(7), "content": "silence except reverse swell",
             "swell": {"start": r4(T(7) - S(0.9) / SR), "peak": T(7)}},
            {"start": T(20, 3.5), "end": T(21), "content": "silence except reverse swell",
             "swell": {"start": r4(T(21) - S(0.7) / SR), "peak": T(21)}},
        ],
        "snare_rolls": cues["snare_rolls"],
        "fills": cues["fills"],
        "risers": cues["risers"],
        "filter_sweeps": cues["filter_sweeps"],
        "crashes": cues["crashes"],
        "sparkle": cues["sparkle"],
        "silence_from": SILENCE_FROM,
        "hits": {
            "intro_beat_ticks": [r4(t) for t in song.ticks],
            "kicks": sorted(r4(k) for k in song.kicks),
            "snare_clap_backbeats": sorted(r4(s) for s in song.snares),
            "dropB_every_beat_accents": [r4(a) for a in song.accents],
            "lead_note_onsets": song.lead_onsets,
        },
    }
    cues_full = full
    with open(CUES_JSON, "w", encoding="utf-8") as fh:
        json.dump(cues_full, fh, indent=1)
    sfx_names = [] if args.no_sfx else make_sfx()
    print(f"sfx done in {time.time() - t_start:.1f}s")
    print("stem levels (rms dBFS, peak dBFS) pre-master:")
    for sec, d in diag.items():
        print(" ", sec, " ".join(f"{k}={v[0]}/{v[1]}" for k, v in d.items()))
    if not args.no_verify:
        rep = verify(y, music_only, song, cues_full, info, sfx_names)
        print(json.dumps(rep, indent=1))
    print(f"total {time.time() - t_start:.1f}s")


if __name__ == "__main__":
    main()
