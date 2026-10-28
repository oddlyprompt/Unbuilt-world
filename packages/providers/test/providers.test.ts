import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ElevenLabsProvider, LocalEspeakProvider, UsageLedger, clearSecret, configuredProviders, getSecret, redact, secretsPath, setSecret, spokenWithSpans, wordsFromCharAlignment, type FetchLike } from '../src';
import { ffmpeg } from '@uw/media';
import { tmpDir } from '../../../tests/helpers/fixtures';

let dir: string;
const SAVED = { ...process.env };
beforeEach(async () => {
  dir = await tmpDir('uw-prov-');
  process.env.UW_SECRETS_FILE = path.join(dir, 'secrets.json');
  delete process.env.ELEVENLABS_API_KEY;
});
afterEach(() => {
  process.env = { ...SAVED };
});

/** A fake ElevenLabs: returns one second of real audio per call, with character alignment. */
async function fakeAudioBase64(): Promise<string> {
  const f = path.join(dir, 'fake.mp3');
  await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1', '-c:a', 'libmp3lame', f]);
  return (await fs.readFile(f)).toString('base64');
}
const alignmentFor = (text: string) => ({ characters: [...text], character_start_times_seconds: [...text].map((_, i) => i * 0.05), character_end_times_seconds: [...text].map((_, i) => i * 0.05 + 0.05) });
const resp = (status: number, body: unknown, headers: Record<string, string> = {}) => ({ ok: status < 300, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

describe('secrets', () => {
  it('stores keys outside projects with restrictive permissions and never lists values', async () => {
    await setSecret('elevenlabs', 'sk-test-1234567890');
    expect(await getSecret('elevenlabs')).toBe('sk-test-1234567890');
    expect((await fs.stat(secretsPath())).mode & 0o777).toBe(0o600);
    expect(await configuredProviders()).toMatchObject({ elevenlabs: true, openai: false });
    expect(JSON.stringify(await configuredProviders())).not.toContain('sk-test');
    expect(await redact('failed with sk-test-1234567890 in header')).toBe('failed with [redacted] in header');
    expect(await redact('xi-api-key: abcdef123456 oops')).toContain('[redacted]');
    await clearSecret('elevenlabs');
    expect(await getSecret('elevenlabs')).toBeUndefined();
  });

  it('prefers the environment over the file', async () => {
    await setSecret('elevenlabs', 'from-file-123456');
    process.env.ELEVENLABS_API_KEY = 'from-env-123456';
    expect(await getSecret('elevenlabs')).toBe('from-env-123456');
  });
});

describe('ElevenLabs adapter (mock server only; no live call is ever made)', () => {
  const req = (id = 's1') => ({ id, text: 'Hello brave world', outFile: path.join(dir, `${id}.wav`) });

  it('refuses to run without a key and says how to fix it', async () => {
    const p = new ElevenLabsProvider({ voiceId: 'v', fetch: async () => { throw new Error('must not be called'); } });
    expect((await p.status()).ready).toBe(false);
    await expect(p.synthesize([req()])).rejects.toThrow(/not configured/);
  });

  it('turns character alignment into one timing per written word and reports characters and cost', async () => {
    await setSecret('elevenlabs', 'sk-test-abcdefgh');
    const audio = await fakeAudioBase64();
    const calls: { url: string; headers?: Record<string, string>; body?: string }[] = [];
    const f: FetchLike = async (url, init) => {
      calls.push({ url, headers: init?.headers, body: init?.body });
      return resp(200, { audio_base64: audio, alignment: alignmentFor('Hello brave world') });
    };
    const p = new ElevenLabsProvider({ voiceId: 'voice123', fetch: f, costPer1kCharsUsd: 0.2 });
    const [r] = await p.synthesize([req()]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/v1/text-to-speech/voice123/with-timestamps');
    expect(calls[0]!.headers?.['xi-api-key']).toBe('sk-test-abcdefgh');
    expect(r!.words.map((w) => w.text)).toEqual(['Hello', 'brave', 'world']);
    expect(r!.words[1]!.start).toBeCloseTo(6 * 0.05, 5);
    expect(r!.alignment).toBe('engine');
    expect(r!.characters).toBe(17);
    expect(r!.estimatedCostUsd).toBeCloseTo(0.0034, 5);
    expect(r!.durationSec).toBeGreaterThan(0.9);
  });

  it('retries 429 and 5xx with backoff (honouring Retry-After) and then succeeds', async () => {
    await setSecret('elevenlabs', 'sk-test-abcdefgh');
    const audio = await fakeAudioBase64();
    const queue = [resp(429, 'slow down', { 'retry-after': '2' }), resp(503, 'oops'), resp(200, { audio_base64: audio, alignment: alignmentFor('Hello brave world') })];
    const sleeps: number[] = [];
    const p = new ElevenLabsProvider({ voiceId: 'v', fetch: async () => queue.shift()!, sleep: async (ms) => void sleeps.push(ms) });
    const [r] = await p.synthesize([req()]);
    expect(r).toBeTruthy();
    expect(sleeps).toEqual([2000, 2000]);
    expect(queue).toHaveLength(0);
  });

  it('gives up after the retry limit and does not retry auth errors; messages never contain the key', async () => {
    await setSecret('elevenlabs', 'sk-test-abcdefgh');
    let n = 0;
    const p1 = new ElevenLabsProvider({ voiceId: 'v', maxRetries: 2, fetch: async () => (n++, resp(500, 'boom')), sleep: async () => {} });
    await expect(p1.synthesize([req()])).rejects.toThrow(/failed \(500\)/);
    expect(n).toBe(3);
    n = 0;
    const p2 = new ElevenLabsProvider({ voiceId: 'v', fetch: async () => (n++, resp(401, 'invalid key sk-test-abcdefgh')), sleep: async () => {} });
    const err = await p2.synthesize([req()]).catch((e: Error) => e);
    expect(n).toBe(1);
    expect((err as Error).message).toContain('API key was rejected');
    expect((err as Error).message).not.toContain('sk-test-abcdefgh');
  });

  it('requires a voice id', async () => {
    await setSecret('elevenlabs', 'sk-test-abcdefgh');
    await expect(new ElevenLabsProvider({ fetch: async () => resp(200, {}) }).synthesize([req()])).rejects.toThrow(/voice/);
  });

  it('maps character timings correctly for text with punctuation', () => {
    const w = wordsFromCharAlignment('Hi, you.', alignmentFor('Hi, you.'));
    expect(w.map((x) => x.text)).toEqual(['Hi,', 'you.']);
    expect(w[1]!.start).toBeCloseTo(4 * 0.05, 5);
  });
});

describe('usage ledger', () => {
  it('detects repeated paid calls and totals the estimated spend', async () => {
    const l = new UsageLedger(path.join(dir, 'usage.jsonl'));
    const key = UsageLedger.keyFor('elevenlabs', 'v1', 'text');
    expect(await l.has(key)).toBe(false);
    await l.record({ provider: 'elevenlabs', kind: 'tts', key, characters: 4, estimatedCostUsd: 0.01 });
    await l.record({ provider: 'elevenlabs', kind: 'tts', key: 'other', estimatedCostUsd: 0.02 });
    expect(await l.has(key)).toBe(true);
    expect(await l.totalUsd()).toBeCloseTo(0.03, 5);
    expect(UsageLedger.keyFor('elevenlabs', 'v2', 'text')).not.toBe(key);
  });
});

describe('local voice', () => {
  it('maps spoken words back onto the written words', () => {
    const s = spokenWithSpans('In 1972, a plan.');
    expect(s.text).toBe('In nineteen seventy-two, a plan.');
    expect(s.spans).toHaveLength(4);
    expect(s.text.slice(...s.spans[1]!)).toBe('nineteen seventy-two,');
    expect(spokenWithSpans('A b c', 'x y z').text).toBe('x y z');
  });

  it('speaks offline and returns one real timing per written word, in order', async () => {
    const p = new LocalEspeakProvider({ rate: 160 });
    const st = await p.status();
    if (!st.ready) return; // espeakng-loader is an install-time dependency; the setup docs cover it
    const text = 'In 1972, engineers built a strange room.';
    const [r] = await p.synthesize([{ id: 't', text, outFile: path.join(dir, 't.wav') }]);
    expect(r!.alignment).toBe('engine');
    expect(r!.words.map((w) => w.text)).toEqual(text.split(' '));
    expect(r!.durationSec).toBeGreaterThan(2);
    for (let i = 1; i < r!.words.length; i++) expect(r!.words[i]!.start).toBeGreaterThanOrEqual(r!.words[i - 1]!.start);
    expect(r!.words.at(-1)!.end).toBeLessThanOrEqual(r!.durationSec + 0.05);
    expect(p.estimateCostUsd()).toBe(0);
  });
});
