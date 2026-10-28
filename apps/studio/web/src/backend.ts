import { handleDemo, demoMediaUrl, initDemo } from './demo';

/**
 * How the interface reaches the studio:
 *  - demo:   everything runs in this browser (projects in localStorage, uploads in IndexedDB, the
 *            Remotion Player renders previews). Works on GitHub Pages with no server.
 *  - remote: the same interface talks to the Node studio service at a URL you provide, with a studio
 *            token. Rendering MP4s, narration generation and mixing happen there.
 * The choice lives in this browser's localStorage. No key or token is part of the built website.
 */
export type Mode = { kind: 'demo' } | { kind: 'remote'; url: string; token: string } | { kind: 'local' };

/** The build served by the Node studio itself (`--mode server`) always talks to that server. */
const SERVER_BUILD = import.meta.env.MODE === 'server';

const KEY = 'uw-backend';

export function getMode(): Mode {
  if (SERVER_BUILD) return { kind: 'local' };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as { url?: string; token?: string };
      if (j.url) return { kind: 'remote', url: j.url.replace(/\/+$/, ''), token: j.token ?? '' };
    }
  } catch {
    /* storage blocked: stay in demo mode */
  }
  return { kind: 'demo' };
}

export function connect(url: string, token: string) {
  localStorage.setItem(KEY, JSON.stringify({ url, token }));
}
export function disconnect() {
  localStorage.removeItem(KEY);
}

/** Check a backend answers and whether it wants a token. Throws a readable message otherwise. */
export async function testBackend(url: string, token: string): Promise<{ authRequired: boolean }> {
  const base = url.replace(/\/+$/, '');
  if (location.protocol === 'https:' && /^http:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
    throw new Error('This page is https, so the backend must be https too (browsers block plain http). Put the backend behind https, for example a tunnel or a reverse proxy.');
  }
  let health: { ok?: boolean; authRequired?: boolean };
  try {
    health = (await (await realFetch(`${base}/api/health`)).json()) as typeof health;
  } catch {
    throw new Error('Could not reach the backend. Check the address, that it is running, and that its UW_ALLOWED_ORIGINS includes this site.');
  }
  if (!health.ok) throw new Error('That address answered, but it is not a studio backend.');
  const r = await realFetch(`${base}/api/projects`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (r.status === 401) throw new Error('The backend rejected the studio token.');
  if (!r.ok) throw new Error(`The backend returned ${r.status}.`);
  return { authRequired: !!health.authRequired };
}

const realFetch: typeof fetch = window.fetch.bind(window);

export const isApiPath = (p: string) => p.startsWith('/api/') || p.startsWith('/media/');

/** Turns any app URL (`/media/…`) into one the browser can load in the current mode. */
export function mediaUrl(id: string, rel: string): string {
  const m = getMode();
  const enc = rel.split('/').map(encodeURIComponent).join('/');
  if (m.kind === 'local') return `/media/${encodeURIComponent(id)}/${enc}`;
  if (m.kind === 'remote') return `${m.url}/media/${encodeURIComponent(id)}/${enc}${m.token ? `?token=${encodeURIComponent(m.token)}` : ''}`;
  return demoMediaUrl(id, rel);
}

/** Server previews return `/media/...` paths; in remote mode they must point at the backend and carry the token. */
function absolutize(value: unknown, m: Extract<Mode, { kind: 'remote' }>): unknown {
  if (typeof value === 'string' && value.startsWith('/media/')) return `${m.url}${value}${m.token ? `?token=${encodeURIComponent(m.token)}` : ''}`;
  if (Array.isArray(value)) return value.map((v) => absolutize(v, m));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, absolutize(v, m)]));
  return value;
}

export async function installBackend(): Promise<Mode> {
  const mode = getMode();
  if (mode.kind === 'local') return mode; // same-origin API: leave fetch alone
  if (mode.kind === 'demo') await initDemo();
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, location.href);
    const m = getMode();
    if (u.origin !== location.origin || !isApiPath(u.pathname)) return realFetch(input, init);
    if (m.kind === 'demo') return handleDemo(init?.method ?? 'GET', u, init?.body ?? null);
    if (m.kind === 'local') return realFetch(input, init);
    const headers = new Headers(init?.headers);
    if (m.token) headers.set('authorization', `Bearer ${m.token}`);
    const res = await realFetch(`${m.url}${u.pathname}${u.search}`, { ...init, headers });
    if (u.pathname.endsWith('/preview') && res.ok) {
      const j = absolutize(await res.json(), m);
      return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return res;
  };
  return mode;
}
