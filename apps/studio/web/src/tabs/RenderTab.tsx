import React, { useEffect, useState } from 'react';
import { api, fmt, mediaUrl, post, type Job } from '../api';
import { Badge } from '../ui';
import { useCtx } from '../ProjectView';

interface Check { name: string; ok: boolean; detail: string; required: boolean }
interface Validation { checks: Check[]; ok: boolean }

const label = (j: Job) => {
  const p = j.params as { kind?: string; shotId?: string; sceneId?: string; chapterId?: string; quality?: string; segmentIds?: string[] };
  if (j.type === 'render') return `render ${p.kind}${p.shotId ? ` ${p.shotId}` : p.sceneId ? ` ${p.sceneId}` : p.chapterId ? ` ${p.chapterId}` : ''} · ${p.quality ?? (p.kind === 'full' ? 'final' : 'draft')}`;
  if (j.type === 'narrate') return `narration${p.segmentIds ? ` ${p.segmentIds.join(', ')}` : ''}`;
  return j.type;
};

const JobRow: React.FC<{ j: Job }> = ({ j }) => {
  const [open, setOpen] = useState(false);
  const tone = j.status === 'succeeded' ? 'ok' : j.status === 'failed' ? 'bad' : j.status === 'cancelled' ? 'warn' : 'amber';
  return (
    <div className="seg" data-testid={`job-${j.id}`} data-status={j.status}>
      <div className="row wrap">
        <span className="mono">#{j.id}</span>
        <b>{label(j)}</b>
        <Badge tone={tone}>{j.status}</Badge>
        {(j.status === 'running' || j.status === 'queued') && <span className="mono muted">{j.stage} {Math.round(j.progress * 100)}%</span>}
        <span className="grow" />
        {(j.status === 'running' || j.status === 'queued') && <button className="btn small danger" onClick={() => void post(`/api/jobs/${j.id}/cancel`, {})} data-testid={`cancel-${j.id}`}>Cancel</button>}
        {(j.status === 'failed' || j.status === 'cancelled') && <button className="btn small" onClick={() => void post(`/api/jobs/${j.id}/retry`, {})} data-testid={`retry-${j.id}`}>Retry</button>}
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide log' : 'Log'}</button>
      </div>
      {(j.status === 'running' || j.status === 'queued') && <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${j.progress * 100}%` }} /></div>}
      {j.error && <div className="issue error" style={{ marginTop: 6 }}>{j.error}</div>}
      {open && <div className="log" style={{ marginTop: 6 }}>{j.log.join('\n') || '(no output yet)'}</div>}
    </div>
  );
};

const RenderResult: React.FC<{ renderId: string; relPath: string; ok: boolean; kind: string; dur?: number; exp?: number }> = ({ renderId, relPath, ok, kind, dur, exp }) => {
  const { id } = useCtx();
  const [v, setV] = useState<Validation | null>(null);
  const [show, setShow] = useState(false);
  const base = `renders/${renderId}`;
  useEffect(() => {
    if (!show) return;
    void fetch(mediaUrl(id, `${base}/validation.json`)).then((r) => r.json()).then(setV).catch(() => setV(null));
  }, [show, id, base]);
  return (
    <div className="seg" data-testid={`render-${renderId}`}>
      <div className="row wrap">
        <b className="mono">{renderId}</b>
        <Badge tone={ok ? 'ok' : 'bad'}>{ok ? 'validated' : 'failed validation'}</Badge>
        <Badge>{kind}</Badge>
        {dur !== undefined && <span className="mono muted">{fmt(dur)} (expected {fmt(exp ?? 0)})</span>}
        <span className="grow" />
        <a className="btn small" href={mediaUrl(id, relPath)} target="_blank" rel="noreferrer">Open video</a>
        <button className="btn small" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Checks and frames'}</button>
      </div>
      {show && (
        <div style={{ marginTop: 10 }}>
          <video controls preload="metadata" style={{ width: '100%', maxWidth: 760, background: '#000' }} src={mediaUrl(id, relPath)} data-testid="result-video" />
          {v?.checks.map((c) => <div key={c.name} className={`check ${c.ok ? 'pass' : c.required ? 'fail' : 'warn'}`}><b>{c.ok ? 'PASS' : c.required ? 'FAIL' : 'WARN'}</b><span>{c.name} — <span className="muted">{c.detail}</span></span></div>)}
          <img alt="Frames taken from the rendered video" style={{ width: '100%', maxWidth: 960, marginTop: 10, border: '1px solid var(--steel)' }} src={mediaUrl(id, `${base}/frames/contact-sheet.jpg`)} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
        </div>
      )}
    </div>
  );
};

export const RenderTab: React.FC = () => {
  const { state, jobs, startJob, toast, select } = useCtx();
  const p = state.project;
  const [scene, setScene] = useState(state.timeline.scenes[0]?.sceneId ?? '');
  const [chapter, setChapter] = useState(p.shots[0]?.chapterId ?? 'ch1');
  const missing = p.narration.filter((n) => !n.audio).length;
  const go = async (params: Record<string, unknown>, text: string) => {
    const j = await startJob('render', params);
    if (j) toast(text);
  };
  void select;
  return (
    <div className="split" style={{ gridTemplateColumns: 'minmax(420px, 1fr) minmax(480px, 1.2fr)' }}>
      <div>
        <div className="panel">
          <h3>Render</h3>
          <div className="muted" style={{ marginBottom: 10 }}>Every render is decoded and measured afterwards. A file that exists but fails a required check is reported as failed.</div>
          {missing > 0 && <div className="issue warning">{missing} narration segment(s) have no audio; final renders refuse to run until they do.</div>}
          <div className="row wrap" style={{ margin: '10px 0' }}>
            <button className="btn primary" data-testid="render-preview" onClick={() => void go({ kind: 'preview', quality: 'draft' }, 'Rendering a fast preview of the whole project…')}>Fast preview (960×540)</button>
            <button className="btn primary" data-testid="render-full" disabled={missing > 0} onClick={() => void go({ kind: 'full', quality: 'final' }, 'Rendering the full 1080p export…')}>Full export (1920×1080)</button>
            <button className="btn" disabled={missing > 0} data-testid="render-4k" onClick={() => void go({ kind: 'full', quality: 'ultra' }, 'Rendering 4K…')}>4K (3840×2160)</button>
          </div>
          <div className="row wrap" style={{ marginBottom: 8 }}>
            <select value={scene} onChange={(e) => setScene(e.target.value)} data-testid="scene-select">{state.timeline.scenes.map((s) => <option key={s.sceneId}>{s.sceneId}</option>)}</select>
            <button className="btn" data-testid="render-scene" onClick={() => void go({ kind: 'scene', sceneId: scene, quality: 'draft' }, `Rendering scene ${scene}…`)}>Scene preview</button>
          </div>
          <div className="row wrap">
            <select value={chapter} onChange={(e) => setChapter(e.target.value)}>{p.chapters.filter((c) => p.shots.some((s) => s.chapterId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.index}. {c.title}</option>)}</select>
            <button className="btn" onClick={() => void go({ kind: 'chapter', chapterId: chapter, quality: 'draft' }, `Rendering chapter ${chapter}…`)}>Chapter preview</button>
          </div>
        </div>
        <h3 style={{ margin: '20px 0 8px', fontSize: 24 }}>Queue</h3>
        <div data-testid="jobs">{jobs.length === 0 ? <div className="muted">No jobs yet.</div> : jobs.slice(0, 12).map((j) => <JobRow key={j.id} j={j} />)}</div>
      </div>
      <div>
        <h3 style={{ marginBottom: 8, fontSize: 24 }}>Finished renders</h3>
        <div data-testid="renders">
          {p.renders.length === 0 && <div className="muted">Nothing rendered yet.</div>}
          {[...p.renders].reverse().map((r) => <RenderResult key={r.id} renderId={r.id} relPath={r.relPath} ok={r.ok} kind={r.kind} dur={r.durationSec} exp={r.expectedDurationSec} />)}
        </div>
      </div>
    </div>
  );
};
