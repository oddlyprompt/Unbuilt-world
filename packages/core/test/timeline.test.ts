import { describe, expect, it } from 'vitest';
import { estimateDurationSec, estimateWords, resolveTimeline, segmentTextHash, tokenize, type Project } from '../src';
import { miniProject, shot } from '../../../tests/helpers/fixtures';

const withAudio = (p: Project, durations: Record<string, number>): Project => {
  const q = structuredClone(p);
  for (const n of q.narration) {
    const d = durations[n.id];
    if (d) n.audio = { assetId: `narr-${n.id}`, durationSec: d, words: estimateWords(n.text, d), alignment: 'engine', provider: 'test', textHash: segmentTextHash(n) };
  }
  return q;
};

describe('narration-driven timeline', () => {
  it('lays narration out from the lead-in with gaps, and ends after the tail', () => {
    const p = withAudio(miniProject(), { n1: 3, n2: 4, n3: 2 });
    const t = resolveTimeline(p);
    expect(t.segments[0]!.startSec).toBeCloseTo(1, 5); // lead-in, the first gap is not added
    expect(t.segments[1]!.startSec).toBeCloseTo(1 + 3 + 0.5, 5);
    expect(t.segments[2]!.startSec).toBeCloseTo(1 + 3 + 0.5 + 4 + 0.5, 5);
    expect(t.narrationEndSec).toBeCloseTo(11, 5);
    expect(t.totalSec).toBeCloseTo(12, 1); // + 1s tail
    expect(t.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('anchors shots to words: regenerating narration with a different length moves the cuts', () => {
    const p1 = withAudio(miniProject(), { n1: 3, n2: 4, n3: 2 });
    const p2 = withAudio(miniProject(), { n1: 5, n2: 4, n3: 2 });
    const t1 = resolveTimeline(p1);
    const t2 = resolveTimeline(p2);
    expect(t1.shots[1]!.startSec).toBeCloseTo(4.5, 2);
    expect(t2.shots[1]!.startSec).toBeCloseTo(6.5, 2);
    expect(t2.totalSec - t1.totalSec).toBeCloseTo(2, 1);
  });

  it('anchors inside a segment on a specific word', () => {
    const p = withAudio(miniProject(), { n1: 3, n2: 4, n3: 2 });
    p.shots[1]!.anchor = { kind: 'segment', segmentId: 'n2', word: 4, offsetSec: 0 };
    const t = resolveTimeline(p);
    const seg = t.segments[1]!;
    expect(Math.abs(t.shots[1]!.startSec - (seg.startSec + seg.words[4]!.start))).toBeLessThanOrEqual(0.5 / t.fps + 1e-9); // quantised to a frame
    expect(t.shots[1]!.startSec).toBeGreaterThan(seg.startSec);
  });

  it('estimates from words per minute when there is no audio, and says so', () => {
    const t = resolveTimeline(miniProject());
    expect(t.segments.every((s) => s.estimated)).toBe(true);
    expect(t.issues.filter((i) => i.code === 'narration_estimated')).toHaveLength(3);
    expect(t.segments[0]!.durationSec).toBeCloseTo(estimateDurationSec('This is the first sentence of the test.', 150), 5);
  });

  it('flags audio generated from different text as stale', () => {
    const p = withAudio(miniProject(), { n1: 3, n2: 4, n3: 2 });
    p.narration[0]!.text = 'Different words now.';
    const t = resolveTimeline(p);
    expect(t.segments[0]!.stale).toBe(true);
    expect(t.issues.some((i) => i.code === 'narration_stale')).toBe(true);
  });

  it('reports shots that end up out of order instead of silently reordering', () => {
    const p = withAudio(miniProject(), { n1: 3, n2: 4, n3: 2 });
    p.shots[2]!.anchor = { kind: 'segment', segmentId: 'n1', word: 0, offsetSec: 0 };
    const t = resolveTimeline(p);
    expect(t.issues.some((i) => i.code === 'shot_order' && i.severity === 'error')).toBe(true);
    for (let i = 1; i < t.shots.length; i++) expect(t.shots[i]!.startFrame).toBeGreaterThan(t.shots[i - 1]!.startFrame);
  });

  it('reports a missing segment and clamps a word index past the end', () => {
    const p = withAudio(miniProject(), { n1: 3, n2: 4, n3: 2 });
    p.shots[1]!.anchor = { kind: 'segment', segmentId: 'nope', word: 0, offsetSec: 0 };
    p.shots[2]!.anchor = { kind: 'segment', segmentId: 'n3', word: 99, offsetSec: 0 };
    const t = resolveTimeline(p);
    expect(t.issues.some((i) => i.code === 'missing_segment')).toBe(true);
    expect(t.issues.some((i) => i.code === 'anchor_word_clamped')).toBe(true);
  });

  it('computes crossfade frames without exceeding the neighbouring shots', () => {
    const p = withAudio(miniProject(), { n1: 3, n2: 4, n3: 2 });
    p.shots[1]!.transitionIn = { type: 'fade', durationSec: 0.6 };
    p.shots[2]!.transitionIn = { type: 'fade', durationSec: 3 };
    const t = resolveTimeline(p);
    expect(t.shots[1]!.transitionFrames).toBe(18);
    expect(t.shots[2]!.transitionFrames).toBeLessThanOrEqual(Math.floor(t.shots[2]!.durationFrames / 2));
  });

  it('every frame belongs to exactly one shot and the last shot ends at the total', () => {
    const t = resolveTimeline(withAudio(miniProject(), { n1: 3, n2: 4, n3: 2 }));
    expect(t.shots[0]!.startFrame).toBe(0);
    for (let i = 1; i < t.shots.length; i++) expect(t.shots[i]!.startFrame).toBe(t.shots[i - 1]!.endFrame);
    expect(t.shots.at(-1)!.endFrame).toBe(t.totalFrames);
  });

  it('groups consecutive shots into scenes', () => {
    const p = miniProject();
    p.shots[2]!.sceneId = 'sc2';
    const t = resolveTimeline(p);
    expect(t.scenes.map((s) => [s.sceneId, s.shotIds])).toEqual([['sc1', ['a', 'b']], ['sc2', ['c']]]);
  });

  it('tokenizes on whitespace only', () => {
    expect(tokenize('  a   b\nc ')).toEqual(['a', 'b', 'c']);
    void shot;
  });
});
