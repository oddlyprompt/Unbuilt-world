#!/usr/bin/env python3
"""Local, offline scratch narration with espeak-ng (no network, no API key).

Input JSON (argv[1]):  {"outDir": "...", "voice": "en-gb", "rate": 150, "pitch": 40,
                        "segments": [{"id": "s1", "text": "...", "spans": [[0, 4], ...]}]}
`spans` (optional) are character ranges in `text`, one per source word; the synthesizer's word events
are grouped into them so that timings line up 1:1 with the written words even when numbers are
spoken as several words. Without spans, whitespace-separated words are used.
Output: <outDir>/<id>.wav (16-bit mono) and <outDir>/<id>.words.json with one start/end per span,
taken from the synthesizer's own word events (real alignment, not an estimate).
Prints a JSON summary to stdout.
"""
import ctypes, json, re, sys, wave, os

try:
    import espeakng_loader
except ImportError:
    sys.stderr.write("espeakng-loader missing: pip install espeakng-loader\n"); sys.exit(2)

class Event(ctypes.Structure):
    _fields_ = [("type", ctypes.c_int), ("unique_identifier", ctypes.c_uint),
                ("text_position", ctypes.c_int), ("length", ctypes.c_int),
                ("audio_position", ctypes.c_int), ("sample", ctypes.c_int),
                ("user_data", ctypes.c_void_p), ("id", ctypes.c_void_p)]

CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(Event))
lib = ctypes.CDLL(espeakng_loader.get_library_path())
lib.espeak_Initialize.restype = ctypes.c_int
rate_hz = lib.espeak_Initialize(2, 0, espeakng_loader.get_data_path().encode(), 0)  # SYNCHRONOUS
if rate_hz <= 0:
    sys.stderr.write("espeak init failed\n"); sys.exit(3)

def synth(text, voice, rate, pitch, gap):
    samples = bytearray(); words = []
    def cb(wav, n, ev):
        if wav and n > 0:
            samples.extend(ctypes.string_at(wav, n * 2))
        i = 0
        while ev[i].type != 0:
            e = ev[i]
            if e.type == 1:  # word
                words.append({"start": e.audio_position / 1000.0, "charStart": e.text_position - 1, "charLen": e.length})
            i += 1
        return 0
    c = CB(cb)
    lib.espeak_SetSynthCallback(c)
    lib.espeak_SetVoiceByName(voice.encode())
    lib.espeak_SetParameter(1, rate, 0)
    lib.espeak_SetParameter(3, pitch, 0)
    lib.espeak_SetParameter(7, gap, 0)  # word gap, 10ms units
    b = text.encode("utf-8")
    lib.espeak_Synth(b, len(b) + 1, 0, 0, 0, 1, None, None)
    lib.espeak_Synchronize()
    return bytes(samples), words

def group(text, spans, events, dur):
    """One (start, end) per span. Events inside a span give its start; gaps are interpolated."""
    if not spans:
        spans = [[m.start(), m.end()] for m in re.finditer(r"\S+", text)]
    starts = [None] * len(spans)
    for e in events:
        pos = e["charStart"]
        for i, (a, b) in enumerate(spans):
            if a <= pos < b or (pos == b and i + 1 == len(spans)):
                if starts[i] is None or e["start"] < starts[i]:
                    starts[i] = e["start"]
                break
    # fill missing starts from neighbours
    last = 0.0
    for i in range(len(starts)):
        if starts[i] is None:
            nxt = next((starts[j] for j in range(i + 1, len(starts)) if starts[j] is not None), dur)
            starts[i] = last if last <= nxt else nxt
        last = starts[i]
    ends = [starts[i + 1] if i + 1 < len(starts) else dur for i in range(len(starts))]
    return starts, ends

def main():
    cfg = json.load(open(sys.argv[1]))
    out = cfg["outDir"]; os.makedirs(out, exist_ok=True)
    summary = []
    for seg in cfg["segments"]:
        text = seg["text"]
        pcm, events = synth(text, cfg.get("voice", "en-gb"), int(cfg.get("rate", 150)), int(cfg.get("pitch", 40)), int(cfg.get("wordGap", 1)))
        dur = len(pcm) / 2 / rate_hz
        starts, ends = group(text, seg.get("spans"), events, dur)
        with wave.open(os.path.join(out, seg["id"] + ".wav"), "wb") as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate_hz); f.writeframes(pcm)
        json.dump({"sampleRate": rate_hz, "duration": dur, "starts": starts, "ends": ends},
                  open(os.path.join(out, seg["id"] + ".words.json"), "w"))
        summary.append({"id": seg["id"], "duration": dur, "words": len(starts), "events": len(events)})
    print(json.dumps({"engine": "espeak-ng", "sampleRate": rate_hz, "segments": summary}))

main()
