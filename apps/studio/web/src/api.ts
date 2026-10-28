import type { Project, Timeline, TimelineIssue } from '@uw/core';

export interface ProjectState {
  project: Project;
  timeline: Timeline;
  issues: TimelineIssue[];
  files: Record<string, { exists: boolean; bytes?: number }>;
  historyCount: number;
  mixHash: string;
}

export interface ProjectSummary {
  id: string;
  error?: string;
  title: string;
  subject: string;
  stage: string;
  targetRuntimeSec: number;
  sliceRuntimeSec?: number;
  timelineSec: number;
  chapters: number;
  shots: number;
  narrationReady: number;
  narrationTotal: number;
  placeholders: number;
  outstanding: number;
  lastRender?: { id: string; kind: string; createdAt: string; relPath: string };
  updatedAt: string;
  usageUsd: number;
}

export interface Job {
  id: number;
  type: string;
  projectId: string;
  params: Record<string, unknown>;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  stage: string;
  log: string[];
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: init?.body && typeof init.body === 'string' ? { 'content-type': 'application/json' } : undefined, ...init });
  const text = await r.text();
  let j: unknown = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    j = { error: text.slice(0, 200) };
  }
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `${r.status} ${r.statusText}`);
  return j as T;
}

export const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const op = (id: string, body: Record<string, unknown>) => post<ProjectState>(`/api/projects/${id}/ops`, body);
export { mediaUrl } from './backend';

export const fmt = (sec: number) => {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(1).padStart(4, '0')}`;
};
