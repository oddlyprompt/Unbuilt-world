import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { speakableText, tokenize, type WordTiming } from '@uw/core';
import { ffmpeg, probe } from '@uw/media';
import { getSecret, redact } from './secrets';

export interface TtsRequest {
  id: string;
  /** Written text; word timings are returned for exactly its whitespace-separated words. */
  text: string;
  /** Text to speak when it differs from the written form. */
  spokenText?: string;
  /** Final WAV path (48 kHz mono). */
  outFile: string;
}

export interface TtsResult {
  id: string;
  file: string;
  durationSec: number;
  words: WordTiming[];
  alignment: 'engine' | 'estimated';
  provider: string;
  voice: string;
  /** Only for paid providers; characters billed. */
  characters?: number;
  estimatedCostUsd?: number;
  fromCache?: boolean;
}

export interface TtsProvider {
  id: string;
  name: string;
  capabilities: { wordTimings: boolean; offline: boolean; paid: boolean };
  status(): Promise<{ ready: boolean; reason?: string }>;
  voices(): Promise<{ id: string; name: string; lang?: string }[]>;
  estimateCostUsd(characters: number): number;
  synthesize(reqs: TtsRequest[], opts?: { signal?: AbortSignal; voice?: string }): Promise<TtsResult[]>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

/** Per-token source spans inside the spoken text (each source word may expand to several spoken words). */
export function spokenWithSpans(text: string, spoken?: string): { text: string; spans: [number, number][] } {
  const tokens = tokenize(text);
  if (spoken) {
    const st = tokenize(spoken);
    if (st.length === tokens.length) {
      let pos = 0;
      const spans = st.map((t) => {
        const a = pos;
        pos += t.length + 1;
        return [a, a + t.length] as [number, number];
      });
      return { text: st.join(' '), spans };
    }
  }
  const parts = tokens.map((t) => speakableText(t));
  let pos = 0;
  const spans = parts.map((p) => {
    const a = pos;
    pos += p.length + 1;
    return [a, a + p.length] as [number, number];
  });
  return { text: parts.join(' '), spans };
}

/** Offline scratch narration through espeak-ng. Robotic by design: it exists so the pipeline and its timing work without any account. */
export class LocalEspeakProvider implements TtsProvider {
  id = 'local-espeak';
  name = 'Local espeak-ng (offline scratch voice)';
  capabilities = { wordTimings: true, offline: true, paid: false };
  constructor(private cfg: { voice?: string; rate?: number; pitch?: number; python?: string } = {}) {}

  async status() {
    const r = await runPython(this.cfg.python ?? 'python3', ['-c', 'import espeakng_loader']);
    return r.code === 0 ? { ready: true } : { ready: false, reason: 'Python package espeakng-loader is missing. Run: python3 -m pip install -r requirements.txt' };
  }
  async voices() {
    return [
      { id: 'en-gb', name: 'English (UK)', lang: 'en-GB' },
      { id: 'en-gb-x-rp', name: 'English (UK, RP)', lang: 'en-GB' },
      { id: 'en-us', name: 'English (US)', lang: 'en-US' },
    ];
  }
  estimateCostUsd() {
    return 0;
  }

  async synthesize(reqs: TtsRequest[], opts: { signal?: AbortSignal; voice?: string } = {}): Promise<TtsResult[]> {
    const voice = opts.voice ?? this.cfg.voice ?? 'en-gb-x-rp';
    const work = await fs.mkdtemp(path.join((process.env.TMPDIR ?? '/tmp') + path.sep, 'uw-tts-'));
    try {
      const prepared = reqs.map((r) => ({ r, s: spokenWithSpans(r.text, r.spokenText) }));
      const cfgFile = path.join(work, 'cfg.json');
      await fs.writeFile(cfgFile, JSON.stringify({ outDir: work, voice, rate: this.cfg.rate ?? 148, pitch: this.cfg.pitch ?? 34, wordGap: 1, segments: prepared.map(({ r, s }) => ({ id: r.id, text: s.text, spans: s.spans })) }));
      const run = await runPython(this.cfg.python ?? 'python3', [path.join(repoRoot, 'tools/local_tts/espeak_tts.py'), cfgFile], opts.signal);
      if (run.code !== 0) throw new Error(`Local narration failed: ${run.stderr.trim().split('\n').slice(-3).join(' ')}`);
      const out: TtsResult[] = [];
      for (const { r } of prepared) {
        const raw = path.join(work, `${r.id}.wav`);
        const meta = JSON.parse(await fs.readFile(path.join(work, `${r.id}.words.json`), 'utf8')) as { starts: number[]; ends: number[] };
        await fs.mkdir(path.dirname(r.outFile), { recursive: true });
        // Polish only: filters that keep timing intact (no trimming).
        await ffmpeg(['-y', '-i', raw, '-af', 'highpass=f=90,lowpass=f=9000,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,volume=3dB', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', r.outFile], { signal: opts.signal });
        const p = await probe(r.outFile);
        const tokens = tokenize(r.text);
        const words = tokens.map((t, i) => ({ text: t, start: meta.starts[i] ?? 0, end: meta.ends[i] ?? p.durationSec }));
        out.push({ id: r.id, file: r.outFile, durationSec: p.durationSec, words, alignment: 'engine', provider: this.id, voice });
      }
      return out;
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }
}

function runPython(py: string, args: string[], signal?: AbortSignal): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const c = spawn(py, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    c.on('error', (e) => reject(new Error(`Could not start ${py}: ${e.message}`)));
    c.on('close', (code) => resolve({ code, stdout, stderr }));
    signal?.addEventListener('abort', () => c.kill('SIGKILL'), { once: true });
  });
}

// ------------------------------------------------------------------ ElevenLabs

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown>; text(): Promise<string> }>;

export interface ElevenLabsConfig {
  voiceId?: string;
  modelId?: string;
  /** Used for cost estimates only; check your plan's actual pricing. */
  costPer1kCharsUsd?: number;
  fetch?: FetchLike;
  maxRetries?: number;
  /** Sleep used between retries (replaced in tests). */
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
}

interface ElevenAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Convert character-level alignment to one timing per whitespace-separated word of `text`. */
export function wordsFromCharAlignment(text: string, al: ElevenAlignment): WordTiming[] {
  const words: WordTiming[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const a = Math.min(m.index, al.characters.length - 1);
    const b = Math.min(m.index + m[0].length - 1, al.characters.length - 1);
    words.push({ text: m[0], start: al.character_start_times_seconds[a] ?? 0, end: al.character_end_times_seconds[b] ?? 0 });
  }
  return words;
}

export class ElevenLabsProvider implements TtsProvider {
  id = 'elevenlabs';
  name = 'ElevenLabs';
  capabilities = { wordTimings: true, offline: false, paid: true };
  private f: FetchLike;
  constructor(private cfg: ElevenLabsConfig = {}) {
    this.f = cfg.fetch ?? (globalThis.fetch as unknown as FetchLike);
  }
  async status() {
    return (await getSecret('elevenlabs')) ? { ready: true } : { ready: false, reason: 'No ElevenLabs key. Set ELEVENLABS_API_KEY or store one in ~/.config/unbuilt-world/secrets.json.' };
  }
  async voices() {
    const key = await getSecret('elevenlabs');
    if (!key) return [];
    const r = await this.f(`${this.cfg.baseUrl ?? 'https://api.elevenlabs.io'}/v1/voices`, { headers: { 'xi-api-key': key } });
    if (!r.ok) throw new Error(`ElevenLabs voices request failed (${r.status}).`);
    const j = (await r.json()) as { voices: { voice_id: string; name: string }[] };
    return j.voices.map((v) => ({ id: v.voice_id, name: v.name }));
  }
  estimateCostUsd(characters: number) {
    return (characters / 1000) * (this.cfg.costPer1kCharsUsd ?? 0.3);
  }

  async synthesize(reqs: TtsRequest[], opts: { signal?: AbortSignal; voice?: string } = {}): Promise<TtsResult[]> {
    const key = await getSecret('elevenlabs');
    if (!key) throw new Error('ElevenLabs is not configured (no API key). Use the local voice or import narration instead.');
    const voice = opts.voice ?? this.cfg.voiceId;
    if (!voice) throw new Error('Choose an ElevenLabs voice id first.');
    const out: TtsResult[] = [];
    for (const r of reqs) {
      const body = JSON.stringify({ text: r.spokenText ?? r.text, model_id: this.cfg.modelId ?? 'eleven_multilingual_v2' });
      const res = await this.withRetry(() => this.f(`${this.cfg.baseUrl ?? 'https://api.elevenlabs.io'}/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body, signal: opts.signal }));
      const j = (await res.json()) as { audio_base64: string; alignment?: ElevenAlignment; normalized_alignment?: ElevenAlignment };
      const mp3 = r.outFile.replace(/\.wav$/, '.mp3');
      await fs.mkdir(path.dirname(r.outFile), { recursive: true });
      await fs.writeFile(mp3, Buffer.from(j.audio_base64, 'base64'));
      await ffmpeg(['-y', '-i', mp3, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', r.outFile], { signal: opts.signal });
      await fs.rm(mp3, { force: true });
      const p = await probe(r.outFile);
      const spoken = r.spokenText ?? r.text;
      const align = j.alignment;
      let words: WordTiming[];
      let alignment: 'engine' | 'estimated' = 'engine';
      if (align && spoken === r.text) words = wordsFromCharAlignment(r.text, align);
      else {
        // The written words differ from what was spoken; map by proportion of characters instead.
        alignment = 'estimated';
        const tokens = tokenize(r.text);
        const total = tokens.reduce((a, t) => a + t.length + 1, 0);
        let c = 0;
        words = tokens.map((t) => {
          const s = (c / total) * p.durationSec;
          c += t.length + 1;
          return { text: t, start: s, end: (c / total) * p.durationSec };
        });
      }
      out.push({ id: r.id, file: r.outFile, durationSec: p.durationSec, words, alignment, provider: this.id, voice, characters: spoken.length, estimatedCostUsd: this.estimateCostUsd(spoken.length) });
    }
    return out;
  }

  /** Retry transient failures (429, 5xx) with backoff, honouring Retry-After. Other errors are final and readable. */
  private async withRetry(call: () => ReturnType<FetchLike>) {
    const max = this.cfg.maxRetries ?? 3;
    const sleep = this.cfg.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let attempt = 0; ; attempt++) {
      const res = await call();
      if (res.ok) return res;
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt >= max) {
        const detail = await redact((await res.text().catch(() => '')).slice(0, 300));
        const hint = res.status === 401 ? 'The API key was rejected.' : res.status === 402 || res.status === 403 ? 'The account may be out of credits or lack access.' : res.status === 422 ? 'The request was invalid (check the voice id).' : '';
        throw new Error(`ElevenLabs request failed (${res.status}). ${hint} ${detail}`.trim());
      }
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30000, 1000 * 2 ** attempt));
    }
  }
}
