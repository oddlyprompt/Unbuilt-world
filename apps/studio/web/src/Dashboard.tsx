import React, { useEffect, useRef, useState } from 'react';
import { api, fmt, post, type ProjectSummary } from './api';
import { Badge, useToast } from './ui';
import { mediaUrl, type Mode } from './backend';

export const Dashboard: React.FC<{ mode: Mode }> = ({ mode }) => {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [form, setForm] = useState({ title: '', subject: '', minutes: 27 });
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api<ProjectSummary[]>('/api/projects').then(setList).catch((e) => toast.show(e.message, true));
  useEffect(() => void load(), []);

  const create = async () => {
    try {
      const r = await post<{ id: string }>('/api/projects', { title: form.title, subject: form.subject, targetRuntimeSec: form.minutes * 60 });
      window.location.hash = `#/p/${r.id}/storyboard`;
    } catch (e) {
      toast.show((e as Error).message, true);
    }
  };
  const importFile = async (f: File) => {
    try {
      const r = await post<{ id: string; warning: string }>('/api/projects/import', JSON.parse(await f.text()));
      toast.show(r.warning);
      await load();
      window.location.hash = `#/p/${r.id}/storyboard`;
    } catch (e) {
      toast.show(`Import failed: ${(e as Error).message}`, true);
    }
  };

  return (
    <>
      <div className="row wrap">
        <h2 className="grow" style={{ fontSize: 36 }}>Projects</h2>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden data-testid="import-input" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        <button className="btn" onClick={() => fileRef.current?.click()}>Import project.json</button>
      </div>
      {mode.kind === 'demo' && <div className="issue info" style={{ marginTop: 12, maxWidth: 900 }}>This is the live demo. Projects, edits and uploads live in <b>this browser</b> and the storyboard preview runs here. Rendering MP4s and generating narration need a studio backend (see the Backend button).</div>}
      <div className="cards" data-testid="project-cards">
        {list === null && <div className="muted">Loading…</div>}
        {list?.map((p) =>
          p.error ? (
            <div className="card" key={p.id}>
              <h3>{p.id}</h3>
              <Badge tone="bad">cannot open</Badge>
              <p className="muted">{p.error}</p>
            </div>
          ) : (
            <div className="card" key={p.id} data-testid={`project-card-${p.id}`}>
              <div className="row">
                <h3 className="grow">{p.title}</h3>
                <Badge tone="amber">{p.stage}</Badge>
              </div>
              <div className="muted">{p.subject}</div>
              <div className="stats">
                <div className="stat"><b>{fmt(p.timelineSec)}</b><span>this timeline</span></div>
                <div className="stat"><b>{fmt(p.targetRuntimeSec)}</b><span>target runtime</span></div>
                <div className="stat"><b>{p.chapters}</b><span>chapters</span></div>
                <div className="stat"><b>{p.shots}</b><span>shots</span></div>
                <div className="stat"><b>{p.narrationReady}/{p.narrationTotal}</b><span>narrated</span></div>
                <div className="stat"><b>{p.placeholders}</b><span>placeholders</span></div>
              </div>
              <div className="row wrap" style={{ marginBottom: 12 }}>
                {p.outstanding > 0 ? <Badge tone="warn">{p.outstanding} open item{p.outstanding === 1 ? '' : 's'}</Badge> : <Badge tone="ok">no open items</Badge>}
                {p.lastRender ? <Badge tone="ok" title={p.lastRender.createdAt}>last render {p.lastRender.kind}</Badge> : <Badge>not rendered</Badge>}
                <Badge>cost ${p.usageUsd.toFixed(2)}</Badge>
              </div>
              <div className="muted mono">updated {new Date(p.updatedAt).toLocaleString()}</div>
              <div className="row" style={{ marginTop: 12 }}>
                <a className="btn primary" href={`#/p/${p.id}/storyboard`} data-testid={`open-${p.id}`}>Open</a>
                <a className="btn" href={`#/p/${p.id}/render`}>Renders</a>
                {p.lastRender && <a className="btn" href={mediaUrl(p.id, p.lastRender.relPath)} target="_blank" rel="noreferrer">Open last video</a>}
              </div>
            </div>
          ),
        )}
      </div>
      <div className="panel" style={{ marginTop: 28, maxWidth: 640 }}>
        <h3>New documentary project</h3>
        <div className="field"><label>Title</label><input data-testid="new-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="The Computer That Almost Ran a Country" /></div>
        <div className="field"><label>Subject</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Project Cybersyn, Chile, 1971–1973" /></div>
        <div className="field"><label>Target runtime (minutes)</label><input type="number" min={1} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} style={{ width: 90 }} /></div>
        <button className="btn primary" disabled={!form.title.trim()} onClick={create} data-testid="create-project">Create project</button>
      </div>
      {toast.node}
    </>
  );
};
