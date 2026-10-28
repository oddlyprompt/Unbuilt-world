import { describe, expect, it } from 'vitest';
import { anchorAtTime, assignAsset, assetProblems, deleteShot, mergeWithPrevious, moveShot, resolveTimeline, segmentTextHash, setShotDuration, splitShot, estimateWords, ProjectSchema, checkProject, type Project } from '../src';
import { miniProject } from '../../../tests/helpers/fixtures';

const base = (): Project => {
  const p = miniProject();
  for (const [n, d] of [['n1', 3], ['n2', 4], ['n3', 2]] as const) {
    const seg = p.narration.find((x) => x.id === n)!;
    seg.audio = { assetId: `narr-${n}`, durationSec: d, words: estimateWords(seg.text, d), alignment: 'engine', provider: 't', textHash: segmentTextHash(seg) };
  }
  return p;
};

describe('edit operations', () => {
  it('setShotDuration slides the next cut and leaves later narration-anchored cuts alone', () => {
    const p = base();
    const t = resolveTimeline(p);
    const next = setShotDuration(p, t, 'a', 5);
    const t2 = resolveTimeline(next);
    expect(t2.shots[0]!.endSec - t2.shots[0]!.startSec).toBeCloseTo(5, 1);
    expect(t2.shots[2]!.startSec).toBeCloseTo(t.shots[2]!.startSec, 3); // c is anchored to n3, untouched
    expect(next).not.toBe(p); // pure
    expect(resolveTimeline(p).shots[0]!.endSec).toBeCloseTo(t.shots[0]!.endSec, 5);
  });

  it('setShotDuration on the last shot changes the tail', () => {
    const p = base();
    const t = resolveTimeline(p);
    const last = t.shots.at(-1)!;
    const next = setShotDuration(p, t, 'c', last.endSec - last.startSec + 2);
    expect(next.settings.tailSec).toBeCloseTo(p.settings.tailSec + 2, 3);
  });

  it('splitShot anchors the new shot to narration and keeps timeline valid', () => {
    const p = base();
    const t = resolveTimeline(p);
    const mid = (t.shots[1]!.startSec + t.shots[1]!.endSec) / 2;
    const next = splitShot(p, t, 'b', mid);
    expect(next.shots.map((s) => s.id)).toEqual(['a', 'b', 'b-b', 'c']);
    expect(next.shots[2]!.anchor.kind).toBe('segment');
    const t2 = resolveTimeline(next);
    expect(t2.shots[2]!.startSec).toBeCloseTo(mid, 1);
    expect(t2.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(() => splitShot(p, t, 'b', t.shots[1]!.startSec + 0.05)).toThrow(/inside the shot/);
  });

  it('mergeWithPrevious removes the later shot so the earlier one runs through', () => {
    const p = base();
    const next = mergeWithPrevious(p, 'b');
    const t = resolveTimeline(next);
    expect(next.shots.map((s) => s.id)).toEqual(['a', 'c']);
    expect(t.shots[0]!.endSec).toBeCloseTo(t.shots[1]!.startSec, 5);
    expect(() => mergeWithPrevious(p, 'a')).toThrow();
  });

  it('moveShot swaps content but keeps the timing slots', () => {
    const p = base();
    p.shots[0]!.component = 'title_reveal';
    p.shots[1]!.component = 'network_map';
    const t = resolveTimeline(p);
    const next = moveShot(p, 0, 1);
    const t2 = resolveTimeline(next);
    expect(next.shots.map((s) => s.component).slice(0, 2)).toEqual(['network_map', 'title_reveal']);
    expect(t2.shots.map((s) => s.startFrame)).toEqual(t.shots.map((s) => s.startFrame));
  });

  it('deleteShot refuses the first shot', () => {
    expect(() => deleteShot(base(), 'a')).toThrow();
    expect(deleteShot(base(), 'c').shots).toHaveLength(2);
  });

  it('anchorAtTime round-trips inside a segment and after the narration', () => {
    const t = resolveTimeline(base());
    const seg = t.segments[1]!;
    const sec = seg.startSec + 1.3;
    const a = anchorAtTime(t, sec);
    expect(a.kind).toBe('segment');
    expect(anchorAtTime(t, t.narrationEndSec + 0.5)).toEqual({ kind: 'after_narration', offsetSec: 0.5 });
  });

  it('assignAsset marks the shot ready only for real (non-placeholder) assets and rejects unknown ids', () => {
    const p = base();
    p.assets.push({ id: 'img', filename: 'x.png', relPath: 'media/original/x.png', kind: 'image', origin: 'user_supplied', licenseStatus: 'unknown', attributionRequired: false, aiGenerated: false, placeholder: false, approval: 'pending' });
    expect(assignAsset(p, 'a', 'img').shots[0]!.status).toBe('ready');
    expect(assignAsset(p, 'a', 'img').shots[0]!.assetId).toBe('img');
    expect(() => assignAsset(p, 'a', 'nope')).toThrow(/No asset/);
    expect(assignAsset(assignAsset(p, 'a', 'img'), 'a', undefined).shots[0]!.assetId).toBeUndefined();
  });

  it('asset problems name what is unresolved; checks flag unknown references', () => {
    expect(assetProblems({ id: 'x', filename: 'x', relPath: 'x', kind: 'image', origin: 'placeholder', licenseStatus: 'needs_clearance', attributionRequired: true, aiGenerated: true, placeholder: true, approval: 'pending' })).toEqual([
      'placeholder: replace before publication', 'license not cleared', 'attribution required but missing', 'AI-generated: needs approval and disclosure',
    ]);
    const p = base();
    p.shots[0]!.assetId = 'ghost';
    expect(checkProject(p, resolveTimeline(p)).some((i) => i.code === 'missing_asset_ref')).toBe(true);
  });

  it('never lets an unreviewed claim count as verified', () => {
    const p = base();
    p.claims.push({ id: 'c1', text: 't', status: 'verified', sourceIds: [], origin: 'ai_proposed', scope: 'context' });
    const issues = checkProject(p, resolveTimeline(p));
    expect(issues.some((i) => i.code === 'unreviewed_verified')).toBe(true);
    expect(issues.some((i) => i.code === 'verified_without_source')).toBe(true);
  });

  it('every edit result still parses against the schema', () => {
    const p = base();
    const t = resolveTimeline(p);
    for (const q of [splitShot(p, t, 'b', t.shots[1]!.startSec + 1), mergeWithPrevious(p, 'c'), moveShot(p, 1, 2)]) expect(() => ProjectSchema.parse(q)).not.toThrow();
  });
});
