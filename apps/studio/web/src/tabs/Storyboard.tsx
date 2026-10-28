import React, { useRef } from 'react';
import { ComponentName, VisualCategory, CameraPreset, type Shot } from '@uw/core';
import { fmt, mediaUrl } from '../api';
import { NumberInput, Field } from '../ui';
import { PreviewPlayer } from '../PreviewPlayer';
import { useCtx } from '../ProjectView';
import { Badge } from '../ui';

export const Storyboard: React.FC = () => {
  const { state, selected, select, seek, playhead } = useCtx();
  const { project: p, timeline: t } = state;
  const total = t.totalFrames;
  const current = t.shots.find((s) => playhead >= s.startFrame && playhead < s.endFrame);
  const sel = p.shots.find((s) => s.id === selected) ?? p.shots.find((s) => s.id === current?.id) ?? p.shots[0];

  return (
    <div className="split">
      <div>
        <PreviewPlayer />
        <div className="timeline" data-testid="timeline">
          {t.shots.map((r) => {
            const s = p.shots[r.index]!;
            return (
              <div key={r.id} className={`tl-shot ${sel?.id === r.id ? 'sel' : ''} ${s.status === 'placeholder' ? 'ph' : ''}`} style={{ width: `${((r.endFrame - r.startFrame) / total) * 100}%` }} title={`${r.id} · ${fmt(r.startSec)}–${fmt(r.endSec)} · ${s.component}`} onClick={() => { select(r.id); seek(r.startFrame); }}>
                {r.id}
              </div>
            );
          })}
          <div className="tl-narr">
            {t.segments.map((s) => (
              <i key={s.id} title={`${s.id}: ${s.text}`} style={{ left: `${(s.startSec / t.totalSec) * 100}%`, width: `${(s.durationSec / t.totalSec) * 100}%`, background: s.estimated || s.stale ? 'var(--warn)' : undefined }} />
            ))}
          </div>
          <div className="playhead" style={{ left: `${(playhead / total) * 100}%` }} />
        </div>
        <div className="muted mono" style={{ marginTop: 14 }}>
          <span style={{ color: 'var(--sage)' }}>■</span> narration &nbsp; <span style={{ color: 'var(--warn)' }}>■</span> estimated or out of date &nbsp; hatched shot = placeholder media
        </div>
        <h3 style={{ marginTop: 18, fontSize: 22 }}>Checks</h3>
        <div data-testid="issues">
          {state.issues.filter((i) => i.severity !== 'info').length === 0 && <div className="muted">No errors or warnings.</div>}
          {state.issues.filter((i) => i.severity !== 'info').slice(0, 12).map((i, k) => (
            <div key={k} className={`issue ${i.severity}`}>{i.message}</div>
          ))}
        </div>
      </div>
      <div>
        <div className="panel" style={{ maxHeight: 360, overflow: 'auto', padding: 0 }}>
          <table data-testid="shot-table">
            <thead>
              <tr><th>Shot</th><th>Start</th><th>Length (s)</th><th>Visual</th><th>Media</th></tr>
            </thead>
            <tbody>
              {p.shots.map((s, i) => {
                const r = t.shots[i]!;
                const a = s.assetId ? p.assets.find((x) => x.id === s.assetId) : undefined;
                return (
                  <tr key={s.id} className={`clickable ${sel?.id === s.id ? 'sel' : ''}`} onClick={() => { select(s.id); seek(r.startFrame); }} data-testid={`shot-row-${s.id}`}>
                    <td className="mono">{s.id}</td>
                    <td className="mono">{fmt(r.startSec)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <DurationInput shotId={s.id} value={r.endSec - r.startSec} />
                    </td>
                    <td>{s.component.replace(/_/g, ' ')}</td>
                    <td>{a ? <Badge tone="ok">{a.id}</Badge> : s.status === 'placeholder' ? <Badge tone="warn">placeholder</Badge> : <Badge>built-in art</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sel && <ShotEditor key={sel.id} shot={sel} />}
      </div>
    </div>
  );
};

const DurationInput: React.FC<{ shotId: string; value: number }> = ({ shotId, value }) => {
  const { apply } = useCtx();
  return <NumberInput testId={`duration-input-${shotId}`} value={value} step={0.1} min={0.25} onCommit={(v) => void apply({ op: 'setShotDuration', shotId, durationSec: v })} />;
};

const CATEGORY_LABEL: Record<string, string> = {
  historical_photo: 'Historical photograph', historical_video: 'Historical video', ai_reconstruction: 'AI-assisted reconstruction', animated_diagram: 'Original animated diagram',
  animated_map: 'Original animated map', technical_illustration: 'Technical illustration', typography: 'Typography and motion graphics', atmospheric_broll: 'Atmospheric B-roll', timeline: 'Timeline animation',
};

const ShotEditor: React.FC<{ shot: Shot }> = ({ shot }) => {
  const { id, state, apply, playhead, startJob, toast, reload } = useCtx();
  const { project: p, timeline: t } = state;
  const idx = p.shots.findIndex((s) => s.id === shot.id);
  const r = t.shots[idx]!;
  const fileRef = useRef<HTMLInputElement>(null);
  const patch = (pt: Partial<Shot>) => apply({ op: 'updateShot', shotId: shot.id, patch: pt });
  const segs = t.segments.filter((s) => r.segmentIds.includes(s.id));
  const media = p.assets.filter((a) => a.kind === 'image' || a.kind === 'video');

  const upload = async (f: File) => {
    const res = await fetch(`/api/projects/${id}/upload?filename=${encodeURIComponent(f.name)}`, { method: 'PUT', body: f });
    const j = (await res.json()) as { asset?: { id: string }; error?: string };
    if (!res.ok || !j.asset) return toast(j.error ?? 'Upload failed', true);
    await apply({ op: 'assignAsset', shotId: shot.id, assetId: j.asset.id });
    await reload();
    toast(`Assigned ${j.asset.id} to ${shot.id}.`);
  };

  return (
    <div className="panel" style={{ marginTop: 14 }} data-testid="shot-editor">
      <div className="row">
        <h3 className="grow">{shot.id}</h3>
        <span className="mono muted">{fmt(r.startSec)} → {fmt(r.endSec)} · scene {shot.sceneId}</span>
      </div>
      <div className="muted" style={{ fontStyle: 'italic', marginBottom: 10 }}>{segs.map((s) => s.text).join(' ') || 'No narration in this shot.'}</div>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <button className="btn small" onClick={() => void apply({ op: 'splitShot', shotId: shot.id, atSec: playhead / t.fps })} title="Split at the playhead" data-testid="split-btn">Split at playhead</button>
        <button className="btn small" disabled={idx === 0} onClick={() => void apply({ op: 'mergeWithPrevious', shotId: shot.id })}>Merge into previous</button>
        <button className="btn small" disabled={idx === 0} onClick={() => void apply({ op: 'moveShot', from: idx, to: idx - 1 })}>Move earlier</button>
        <button className="btn small" disabled={idx === p.shots.length - 1} onClick={() => void apply({ op: 'moveShot', from: idx, to: idx + 1 })}>Move later</button>
        <button className="btn small danger" disabled={idx === 0} onClick={() => confirm(`Delete ${shot.id}?`) && void apply({ op: 'deleteShot', shotId: shot.id })}>Delete</button>
        <button className="btn small primary" onClick={async () => { const j = await startJob('render', { kind: 'scene', shotId: shot.id, quality: 'draft' }); if (j) toast(`Rendering a preview of ${shot.id}…`); }} data-testid="render-shot-btn">Render this shot</button>
      </div>
      <Field label="Visual component">
        <select value={shot.component} onChange={(e) => void patch({ component: e.target.value as Shot['component'] })}>
          {ComponentName.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </select>
      </Field>
      <Field label="Category">
        <select value={shot.category} onChange={(e) => void patch({ category: e.target.value as Shot['category'] })}>
          {VisualCategory.options.map((o) => <option key={o} value={o}>{CATEGORY_LABEL[o]}</option>)}
        </select>
      </Field>
      <Field label="Media (replaces the built-in artwork)">
        <div className="row wrap">
          <select value={shot.assetId ?? ''} data-testid="asset-select" onChange={(e) => void apply({ op: 'assignAsset', shotId: shot.id, assetId: e.target.value || null })}>
            <option value="">— built-in artwork / placeholder —</option>
            {media.map((a) => <option key={a.id} value={a.id}>{a.id}{a.placeholder ? ' (placeholder)' : ''}</option>)}
          </select>
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden data-testid="shot-upload" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <button className="btn small" onClick={() => fileRef.current?.click()}>Upload and assign…</button>
          {shot.assetId && <img className="thumb" alt="" src={mediaUrl(id, p.assets.find((a) => a.id === shot.assetId)?.relPath ?? '')} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
        </div>
      </Field>
      <div className="row wrap">
        <Field label="Camera">
          <select value={shot.camera.preset} onChange={(e) => void patch({ camera: { ...shot.camera, preset: e.target.value as Shot['camera']['preset'] } })}>
            {CameraPreset.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <Field label="Intensity (0–1)"><NumberInput value={shot.camera.intensity} step={0.05} onCommit={(v) => void patch({ camera: { ...shot.camera, intensity: Math.min(1, v) } })} /></Field>
        <Field label="Transition in">
          <select value={shot.transitionIn.type} disabled={idx === 0} onChange={(e) => void patch({ transitionIn: { type: e.target.value as Shot['transitionIn']['type'], durationSec: e.target.value === 'cut' ? 0 : Math.max(0.4, shot.transitionIn.durationSec) } })}>
            {['cut', 'fade', 'dip_black', 'dip_paper', 'wipe'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Transition (s)"><NumberInput value={shot.transitionIn.durationSec} step={0.1} disabled={idx === 0 || shot.transitionIn.type === 'cut'} onCommit={(v) => void patch({ transitionIn: { ...shot.transitionIn, durationSec: Math.min(3, v) } })} /></Field>
      </div>
      <Field label="Status">
        <select value={shot.status} onChange={(e) => void patch({ status: e.target.value as Shot['status'] })}>
          {['draft', 'placeholder', 'ready', 'approved'].map((o) => <option key={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Reconstruction label (shown on screen)">
        <div className="row">
          <label className="row"><input type="checkbox" checked={shot.reconstruction.isReconstruction} onChange={(e) => void patch({ reconstruction: { ...shot.reconstruction, isReconstruction: e.target.checked } })} /> reconstruction</label>
          <input className="grow" value={shot.reconstruction.label ?? ''} placeholder="ILLUSTRATIVE RECONSTRUCTION · NOT ARCHIVAL" onChange={() => {}} onBlur={(e) => e.target.value !== (shot.reconstruction.label ?? '') && void patch({ reconstruction: { ...shot.reconstruction, label: e.target.value || undefined } })} defaultValue={shot.reconstruction.label ?? ''} />
        </div>
      </Field>
      <Field label="On-screen text">
        {shot.overlays.map((o) => (
          <div className="row" key={o.id} style={{ marginBottom: 4 }}>
            <input className="grow" defaultValue={o.text} onBlur={(e) => e.target.value !== o.text && void patch({ overlays: shot.overlays.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
            <span className="muted mono">{o.style}</span>
            <button className="btn small" onClick={() => void patch({ overlays: shot.overlays.filter((x) => x.id !== o.id) })}>×</button>
          </div>
        ))}
        <button className="btn small" onClick={() => void patch({ overlays: [...shot.overlays, { id: `o${shot.overlays.length + 1}-${Date.now() % 1000}`, text: 'New label', style: 'label', atSec: 0.5, durSec: Math.min(3, Math.max(1, r.endSec - r.startSec - 1)), position: 'bottom_left' }] })}>Add text</button>
      </Field>
      <Field label="Notes">
        <textarea rows={2} defaultValue={shot.notes ?? ''} onBlur={(e) => e.target.value !== (shot.notes ?? '') && void patch({ notes: e.target.value })} />
      </Field>
      <div className="muted mono">Sources: {shot.claimIds.length ? shot.claimIds.join(', ') : 'none cited'}</div>
    </div>
  );
};
