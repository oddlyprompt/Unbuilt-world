import type { Project } from './schema';
import { assetProblems } from './ops';
import type { Timeline, TimelineIssue } from './timeline';

/** Project-level consistency checks that go beyond the timeline: assets, claims and disclosure. */
export function checkProject(project: Project, timeline: Timeline): TimelineIssue[] {
  const issues: TimelineIssue[] = [...timeline.issues];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const claims = new Map(project.claims.map((c) => [c.id, c]));
  const segs = new Set(project.narration.map((n) => n.id));

  for (const s of project.shots) {
    if (s.assetId && !assets.has(s.assetId)) issues.push({ severity: 'error', code: 'missing_asset_ref', shotId: s.id, message: `Shot "${s.id}" uses unknown asset "${s.assetId}". A placeholder will be shown.` });
    const a = s.assetId ? assets.get(s.assetId) : undefined;
    if (a) for (const p of assetProblems(a)) issues.push({ severity: 'warning', code: 'asset_problem', shotId: s.id, message: `Asset "${a.id}": ${p}.` });
    for (const c of s.soundCues) if (!assets.has(c.assetId)) issues.push({ severity: 'error', code: 'missing_asset_ref', shotId: s.id, message: `Sound cue "${c.id}" uses unknown asset "${c.assetId}".` });
    for (const cid of s.claimIds) if (!claims.has(cid)) issues.push({ severity: 'warning', code: 'unknown_claim', shotId: s.id, message: `Shot "${s.id}" cites unknown claim "${cid}".` });
    const needsLabel = ['ai_reconstruction', 'technical_illustration', 'animated_diagram'].includes(s.category);
    if (needsLabel && !s.reconstruction.isReconstruction && s.category === 'ai_reconstruction') issues.push({ severity: 'error', code: 'unlabelled_reconstruction', shotId: s.id, message: `Shot "${s.id}" is an AI reconstruction but is not labelled as one.` });
    if (s.category === 'historical_photo' && !s.assetId && s.status !== 'placeholder') issues.push({ severity: 'warning', code: 'no_archival_asset', shotId: s.id, message: `Shot "${s.id}" is a historical photograph with no photograph assigned.` });
  }
  for (const n of project.narration) for (const cid of n.claimIds) if (!claims.has(cid)) issues.push({ severity: 'warning', code: 'unknown_claim', segmentId: n.id, message: `Segment "${n.id}" cites unknown claim "${cid}".` });
  for (const c of project.claims) {
    if (c.status === 'verified' && !c.verification) issues.push({ severity: 'error', code: 'unreviewed_verified', message: `Claim "${c.id}" is marked verified but no reviewer is recorded.` });
    if (c.status === 'verified' && c.sourceIds.length === 0) issues.push({ severity: 'error', code: 'verified_without_source', message: `Claim "${c.id}" is verified but cites no source.` });
    for (const sid of c.sourceIds) if (!project.sources.some((x) => x.id === sid)) issues.push({ severity: 'warning', code: 'unknown_source', message: `Claim "${c.id}" cites unknown source "${sid}".` });
  }
  for (const m of project.audio.music) if (!assets.has(m.assetId)) issues.push({ severity: 'error', code: 'missing_asset_ref', message: `Music track "${m.id}" uses unknown asset "${m.assetId}".` });
  for (const n of project.narration) if (n.audio && !assets.has(n.audio.assetId)) issues.push({ severity: 'error', code: 'missing_asset_ref', segmentId: n.id, message: `Narration audio for "${n.id}" is not in the asset library.` });
  void segs;
  return issues;
}
