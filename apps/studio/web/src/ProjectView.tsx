import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, fmt, op, post, type Job, type ProjectState } from './api';
import { Badge, DownloadButton, useToast } from './ui';
import type { Mode } from './backend';
import { Storyboard } from './tabs/Storyboard';
import { ScriptTab } from './tabs/Script';
import { AssetsTab } from './tabs/Assets';
import { AudioTab } from './tabs/AudioTab';
import { ResearchTab } from './tabs/Research';
import { RenderTab } from './tabs/RenderTab';

export interface Ctx {
  id: string;
  state: ProjectState;
  reload: () => Promise<void>;
  apply: (body: Record<string, unknown>) => Promise<boolean>;
  jobs: Job[];
  startJob: (type: string, params: Record<string, unknown>) => Promise<Job | undefined>;
  toast: (text: string, error?: boolean) => void;
  selected: string | null;
  select: (id: string | null) => void;
  seek: (frame: number) => void;
  playhead: number;
  setPlayhead: (f: number) => void;
  registerSeek: (fn: (frame: number) => void) => void;
}
const C = createContext<Ctx | null>(null);
export const useCtx = () => {
  const c = useContext(C);
  if (!c) throw new Error('outside project');
  return c;
};

const TABS: [string, string][] = [
  ['storyboard', 'Storyboard'],
  ['script', 'Script'],
  ['assets', 'Assets'],
  ['audio', 'Audio'],
  ['research', 'Research'],
  ['render', 'Render'],
];

export const ProjectView: React.FC<{ id: string; tab: string; mode: Mode }> = ({ id, tab }) => {
  const [state, setState] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, select] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const seekRef = useRef<(f: number) => void>(() => {});
  const toast = useToast();
  const prevActive = useRef<Set<number>>(new Set());

  const reload = useCallback(async () => {
    try {
      setState(await api<ProjectState>(`/api/projects/${id}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => void reload(), [reload]);

  // Poll jobs; when one finishes, refresh the project (narration audio, renders, etc. changed).
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const list = await api<Job[]>(`/api/jobs?projectId=${id}`);
        if (stop) return;
        setJobs(list);
        const active = new Set(list.filter((j) => j.status === 'running' || j.status === 'queued').map((j) => j.id));
        let finished = false;
        for (const a of prevActive.current) if (!active.has(a)) finished = true;
        prevActive.current = active;
        if (finished) void reload();
        timer = setTimeout(tick, active.size ? 800 : 3000);
      } catch {
        timer = setTimeout(tick, 4000);
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, reload]);

  const apply = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        setState(await op(id, body));
        return true;
      } catch (e) {
        toast.show((e as Error).message, true);
        void reload();
        return false;
      }
    },
    [id, reload, toast],
  );

  const startJob = useCallback(
    async (type: string, params: Record<string, unknown>) => {
      try {
        const r = await post<{ job: Job; duplicate?: boolean }>(`/api/projects/${id}/jobs`, { type, params });
        if (r.duplicate) toast.show('An identical job is already running.');
        setJobs((js) => [r.job, ...js.filter((j) => j.id !== r.job.id)]);
        prevActive.current.add(r.job.id);
        return r.job;
      } catch (e) {
        toast.show((e as Error).message, true);
        return undefined;
      }
    },
    [id, toast],
  );

  if (error) return <div className="panel"><h3>Cannot open this project</h3><p className="muted" data-testid="open-error">{error}</p><a href="#/">Back to projects</a></div>;
  if (!state) return <div className="muted">Loading…</div>;
  const p = state.project;
  const errs = state.issues.filter((i) => i.severity === 'error').length;
  const warns = state.issues.filter((i) => i.severity === 'warning').length;

  const ctx: Ctx = { id, state, reload, apply, jobs, startJob, toast: toast.show, selected, select, seek: (f) => seekRef.current(f), playhead, setPlayhead, registerSeek: (fn) => (seekRef.current = fn) };
  return (
    <C.Provider value={ctx}>
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <div className="grow">
          <div className="muted mono">{p.channel} · {p.subject}</div>
          <h2 style={{ fontSize: 38 }} data-testid="project-title">{p.title}</h2>
        </div>
        <Badge tone="amber">{p.stage}</Badge>
        <Badge title="This project's timeline">{fmt(state.timeline.totalSec)} · {state.timeline.shots.length} shots</Badge>
        {p.sliceRuntimeSec && <Badge title="Expected length of this slice">target ≈ {fmt(p.sliceRuntimeSec)}</Badge>}
        {errs > 0 && <Badge tone="bad">{errs} error{errs > 1 ? 's' : ''}</Badge>}
        {warns > 0 && <Badge tone="warn">{warns} warning{warns > 1 ? 's' : ''}</Badge>}
        <span className="muted mono">rev {p.revision}</span>
      </div>
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <a key={k} href={`#/p/${id}/${k}`} className={`tab ${tab === k ? 'active' : ''}`} style={{ textDecoration: 'none' }} data-testid={`tab-${k}`}>
            {label}
          </a>
        ))}
        <span className="grow" />
        <DownloadButton small path={`/api/projects/${id}/export`} filename={`${id}.project.json`}>Export project.json</DownloadButton>
      </div>
      {tab === 'storyboard' && <Storyboard />}
      {tab === 'script' && <ScriptTab />}
      {tab === 'assets' && <AssetsTab />}
      {tab === 'audio' && <AudioTab />}
      {tab === 'research' && <ResearchTab />}
      {tab === 'render' && <RenderTab />}
      {toast.node}
    </C.Provider>
  );
};
