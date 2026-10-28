import { z } from 'zod';
import { assignAsset, deleteShot, mergeWithPrevious, moveShot, setShotDuration, splitShot, updateShot } from './ops';
import type { Project } from './schema';
import { resolveTimeline } from './timeline';
import { nowIso } from './util';

/** An error with an HTTP-style status, so the server and the in-browser demo report edits the same way. */
export class OpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const Op = z.discriminatedUnion('op', [
  z.object({ op: z.literal('setShotDuration'), shotId: z.string(), durationSec: z.number().positive() }),
  z.object({ op: z.literal('splitShot'), shotId: z.string(), atSec: z.number() }),
  z.object({ op: z.literal('mergeWithPrevious'), shotId: z.string() }),
  z.object({ op: z.literal('moveShot'), from: z.number().int(), to: z.number().int() }),
  z.object({ op: z.literal('deleteShot'), shotId: z.string() }),
  z.object({ op: z.literal('assignAsset'), shotId: z.string(), assetId: z.string().nullable() }),
  z.object({ op: z.literal('updateShot'), shotId: z.string(), patch: z.record(z.unknown()) }),
  z.object({ op: z.literal('updateNarration'), segmentId: z.string(), patch: z.object({ text: z.string().min(1).optional(), gapBeforeSec: z.number().min(0).optional(), spokenText: z.string().optional(), locked: z.boolean().optional() }) }),
  z.object({ op: z.literal('updateSettings'), patch: z.record(z.unknown()) }),
  z.object({ op: z.literal('updateAudio'), patch: z.record(z.unknown()) }),
  z.object({ op: z.literal('updateAsset'), assetId: z.string(), patch: z.record(z.unknown()) }),
  z.object({ op: z.literal('updateClaim'), claimId: z.string(), patch: z.record(z.unknown()) }),
]);
export type Op = z.infer<typeof Op>;

/** Apply one edit to a project and return the new project. Pure; the caller validates and saves. */
export function applyOp(cur: Project, op: Op): Project {
  const t = resolveTimeline(cur);
  switch (op.op) {
    case 'setShotDuration':
      return setShotDuration(cur, t, op.shotId, op.durationSec);
    case 'splitShot':
      return splitShot(cur, t, op.shotId, op.atSec);
    case 'mergeWithPrevious':
      return mergeWithPrevious(cur, op.shotId);
    case 'moveShot':
      return moveShot(cur, op.from, op.to);
    case 'deleteShot':
      return deleteShot(cur, op.shotId);
    case 'assignAsset':
      return assignAsset(cur, op.shotId, op.assetId ?? undefined);
    case 'updateShot':
      return updateShot(cur, op.shotId, op.patch as never);
    case 'updateNarration': {
      const next = structuredClone(cur);
      const n = next.narration.find((x) => x.id === op.segmentId);
      if (!n) throw new OpError(404, `No segment "${op.segmentId}".`);
      if (n.locked && op.patch.text !== undefined) throw new OpError(409, 'This segment is locked. Unlock it to edit the text.');
      Object.assign(n, op.patch);
      return next;
    }
    case 'updateSettings':
      return { ...structuredClone(cur), settings: { ...cur.settings, ...op.patch } as Project['settings'] };
    case 'updateAudio':
      return { ...structuredClone(cur), audio: { ...cur.audio, ...op.patch } as Project['audio'] };
    case 'updateAsset': {
      const next = structuredClone(cur);
      const a = next.assets.find((x) => x.id === op.assetId);
      if (!a) throw new OpError(404, `No asset "${op.assetId}".`);
      const { id: _i, relPath: _r, sha256: _s, ...safe } = op.patch;
      Object.assign(a, safe);
      return next;
    }
    case 'updateClaim': {
      const next = structuredClone(cur);
      const cl = next.claims.find((x) => x.id === op.claimId);
      if (!cl) throw new OpError(404, `No claim "${op.claimId}".`);
      const patch = { ...op.patch } as Record<string, unknown>;
      if (patch.status === 'verified') {
        const v = patch.verification as { by?: string; note?: string } | undefined;
        if (!v?.by?.trim()) throw new OpError(400, 'Marking a claim verified needs the name of the person who checked it.');
        const sources = (patch.sourceIds as string[] | undefined) ?? cl.sourceIds;
        if (!sources.length) throw new OpError(400, 'A verified claim must cite at least one source.');
        patch.verification = { by: v.by.trim(), on: nowIso(), note: v.note };
      }
      Object.assign(cl, patch);
      return next;
    }
  }
}
