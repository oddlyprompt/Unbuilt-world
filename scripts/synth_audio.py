#!/usr/bin/env python3
"""Synthesizes the original audio beds and effects for the Cybersyn pilot.

Everything is generated from mathematics (additive synthesis and filtered noise), so there is no
sample, loop or recording whose licence could matter. Output: 48 kHz stereo 16-bit WAV.

usage: synth_audio.py OUT_DIR
"""
import sys, os, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(1972)  # fixed seed: the same files every run


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def one_pole_lp(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # small arrays only
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lowpass_fft(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def bandpass_fft(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4))
    return np.fft.irfft(X, len(x))


def env_ad(n, attack, decay_tau):
    t = np.arange(n) / SR
    a = np.minimum(1, t / max(attack, 1e-4))
    return a * np.exp(-t / decay_tau)


def stereo(l, r=None):
    r = l if r is None else r
    return np.stack([l, r], axis=1)


def delay_fx(x, secs, fb, mix):
    d = int(secs * SR)
    y = x.copy()
    for k in range(1, 6):
        off = d * k
        if off >= len(x):
            break
        y[off:] += x[:-off] * (fb ** k) * mix
    return y


def normalize(x, peak_db=-3.0):
    p = np.max(np.abs(x)) or 1
    return x * (10 ** (peak_db / 20) / p)


def write(path, x):
    pcm = np.clip(x, -1, 1)
    pcm = (pcm * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def note(f):
    return 440.0 * 2 ** ((f - 69) / 12)


# ---------------------------------------------------------------- ambient music bed (D minor, 96 s)
def music(sec=96.0):
    n = int(sec * SR)
    t = t_axis(sec)
    L = np.zeros(n)
    R = np.zeros(n)
    chords = [  # midi notes, 12 s each: Dm, Bb, Gm, A (suspended), repeated
        [38, 45, 50, 53], [34, 41, 46, 50], [31, 43, 46, 50], [33, 40, 45, 52],
    ]
    seg = 12.0
    for ci in range(int(sec // seg) + 1):
        ch = chords[ci % len(chords)]
        start = ci * seg - 2.0
        i0 = max(0, int(start * SR))
        i1 = min(n, int((start + seg + 4.0) * SR))
        if i1 <= i0:
            continue
        tw = t[i0:i1]  # only the window this chord sounds in
        e = np.clip((tw - start) / 4.0, 0, 1) * np.clip((start + seg + 4.0 - tw) / 4.0, 0, 1)
        for ni, m in enumerate(ch):
            f = note(m)
            # additive pad: slightly detuned partials with a slow tremolo, panned apart
            for det, pan in ((-0.07, -0.4), (0.0, 0.0), (0.09, 0.4)):
                ph = rng.uniform(0, 2 * np.pi)
                sig = np.zeros(len(tw))
                for h, amp in ((1, 1.0), (2, 0.5), (3, 0.28), (4, 0.16), (5, 0.08)):
                    sig += amp * np.sin(2 * np.pi * (f + det) * h * tw + ph * h)
                trem = 0.85 + 0.15 * np.sin(2 * np.pi * (0.07 + 0.013 * ni) * tw + ph)
                v = sig * trem * e * (0.05 if ni else 0.07)
                L[i0:i1] += v * (1 - pan) / 2
                R[i0:i1] += v * (1 + pan) / 2
    # slow airy noise swell
    noise = lowpass_fft(rng.normal(size=n), 900)
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / 24.0 - 1.2)
    L += noise * swell * 0.035
    R += np.roll(noise, 2400) * swell * 0.035
    # sparse pentatonic plucks through a delay: the "retro-futuristic" glint
    pluck = np.zeros(n)
    scale = [74, 77, 79, 81, 84, 86]
    step = 60.0 / 62
    k = 0
    pos = 4.0
    while pos < sec - 3:
        if rng.random() < 0.55:
            m = scale[int(rng.integers(0, len(scale)))]
            dur = 2.2
            i0 = int(pos * SR)
            i1 = min(n, i0 + int(dur * SR))
            tt = np.arange(i1 - i0) / SR
            g = np.sin(2 * np.pi * note(m) * tt) + 0.3 * np.sin(2 * np.pi * note(m) * 2 * tt)
            pluck[i0:i1] += g * np.exp(-tt / 0.45) * 0.045
        pos += step * (2 if rng.random() < 0.6 else 4)
        k += 1
    pluck = delay_fx(pluck, 0.48, 0.45, 0.8)
    L += pluck
    R += np.roll(pluck, 1700)
    # low pulse, almost felt rather than heard
    pulse = np.sin(2 * np.pi * note(26) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * t / (60 / 62 * 4))) ** 3 * 0.05
    L += pulse
    R += pulse
    out = normalize(stereo(L, R), -4.0)
    fade = np.minimum(1, t / 1.0) * np.minimum(1, (sec - t) / 2.0)
    return out * fade[:, None]


def room_tone(sec=40.0):
    n = int(sec * SR)
    t = t_axis(sec)
    hum = sum(a * np.sin(2 * np.pi * 50 * h * t + h) for h, a in ((1, 1.0), (2, 0.5), (3, 0.3), (4, 0.12)))
    air = bandpass_fft(rng.normal(size=n), 200, 2500) * 0.4
    mod = 0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t)
    x = (hum * 0.12 + air * 0.08) * mod
    # make it loop: crossfade the tail into the head
    fadelen = SR
    x[:fadelen] = x[:fadelen] * np.linspace(0, 1, fadelen) + x[-fadelen:] * np.linspace(1, 0, fadelen)
    x = x[:-fadelen]
    return normalize(stereo(x, np.roll(x, 90)), -6)


def telex(sec=4.0):
    n = int(sec * SR)
    out = np.zeros(n)
    pos = 0.05
    while pos < sec - 1.0:
        dur = 0.045
        i0 = int(pos * SR)
        k = int(dur * SR)
        click = bandpass_fft(rng.normal(size=k), 900, 5200) * env_ad(k, 0.0008, 0.010)
        thump = np.sin(2 * np.pi * 150 * np.arange(k) / SR) * env_ad(k, 0.001, 0.012) * 0.5
        out[i0:i0 + k] += (click + thump) * rng.uniform(0.6, 1.0)
        pos += rng.choice([0.06, 0.08, 0.1, 0.13, 0.22], p=[0.3, 0.3, 0.2, 0.15, 0.05])
    # carriage bell at the end
    i0 = int((sec - 0.9) * SR)
    tt = np.arange(n - i0) / SR
    out[i0:] += (np.sin(2 * np.pi * 2349 * tt) * 0.5 + np.sin(2 * np.pi * 3520 * tt) * 0.2) * np.exp(-tt / 0.25) * 0.35
    return normalize(stereo(out, np.roll(out, 60)), -5)


def button(sec=0.9):
    n = int(sec * SR)
    tt = np.arange(n) / SR
    thunk = np.sin(2 * np.pi * (110 - 40 * tt / 0.12 * (tt < 0.12)) * tt) * env_ad(n, 0.001, 0.07)
    click = bandpass_fft(rng.normal(size=n), 1800, 6000) * env_ad(n, 0.0005, 0.012) * 0.8
    chime = np.sin(2 * np.pi * 880 * tt) * env_ad(n, 0.01, 0.25) * 0.18
    x = thunk + click + chime
    return normalize(stereo(delay_fx(x, 0.09, 0.3, 0.4)), -5)


def slide_click(sec=0.5):
    n = int(sec * SR)
    tt = np.arange(n) / SR
    c1 = bandpass_fft(rng.normal(size=n), 500, 4000) * env_ad(n, 0.0005, 0.015)
    c2 = np.roll(bandpass_fft(rng.normal(size=n), 700, 3000) * env_ad(n, 0.0005, 0.02), int(0.11 * SR)) * 0.8
    mech = np.sin(2 * np.pi * 95 * tt) * env_ad(n, 0.002, 0.06) * 0.5
    return normalize(stereo(c1 + c2 + mech), -6)


def powerdown(sec=4.0):
    n = int(sec * SR)
    tt = np.arange(n) / SR
    f = 160 * np.exp(-tt * 0.9) + 28
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = (np.sin(ph) + 0.4 * np.sin(2 * ph)) * np.exp(-tt / 1.4)
    rumble = lowpass_fft(rng.normal(size=n), 180) * np.exp(-tt / 1.8) * 1.4
    whine = np.sin(2 * np.pi * np.cumsum(2600 * np.exp(-tt * 1.6) + 60) / SR) * np.exp(-tt / 0.7) * 0.12
    x = tone * 0.6 + rumble * 0.5 + whine
    return normalize(stereo(x, np.roll(x, 200)), -4)


def title_hit(sec=5.0):
    n = int(sec * SR)
    tt = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (48 + 40 * np.exp(-tt * 14)) * tt) * np.exp(-tt / 1.2)
    sub = np.sin(2 * np.pi * 32 * tt) * np.exp(-tt / 2.0) * 0.6
    air = lowpass_fft(rng.normal(size=n), 1400) * np.exp(-tt / 0.9) * 0.35
    shimmer = (np.sin(2 * np.pi * note(74) * tt) + np.sin(2 * np.pi * note(81) * tt)) * np.exp(-tt / 1.6) * 0.06 * np.minimum(1, tt / 0.4)
    x = boom + sub + air + shimmer
    x = delay_fx(x, 0.31, 0.4, 0.5)
    return normalize(stereo(x, np.roll(x, 400)), -4)


FILES = {
    'music_ambient.wav': music,
    'ambience_room.wav': room_tone,
    'sfx_telex.wav': telex,
    'sfx_button.wav': button,
    'sfx_slide_click.wav': slide_click,
    'sfx_powerdown.wav': powerdown,
    'sfx_title_hit.wav': title_hit,
}

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for name, fn in FILES.items():
        path = os.path.join(out, name)
        if os.path.exists(path) and '--force' not in sys.argv:
            continue
        write(path, fn())
        print('wrote', path)
