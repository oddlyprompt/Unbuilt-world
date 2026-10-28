import React, { useEffect, useState } from 'react';
import { Dashboard } from './Dashboard';
import { ProjectView } from './ProjectView';
import { connect, disconnect, testBackend, type Mode } from './backend';
import { resetDemo } from './demo';
import { Badge } from './ui';

function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const m = hash.match(/^#\/p\/([^/]+)(?:\/(\w+))?/);
  return m ? { id: decodeURIComponent(m[1]!), tab: m[2] ?? 'storyboard' } : null;
}

const BackendDialog: React.FC<{ mode: Mode; onClose: () => void }> = ({ mode, onClose }) => {
  const [url, setUrl] = useState(mode.kind === 'remote' ? mode.url : '');
  const [token, setToken] = useState(mode.kind === 'remote' ? mode.token : '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await testBackend(url, token);
      connect(url, token);
      setMsg({ ok: true, text: `Connected${r.authRequired ? ' (token accepted)' : ''}. Reloading…` });
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 20, display: 'grid', placeItems: 'center' }} onClick={onClose}>
      <div className="panel" style={{ width: 'min(560px, 92vw)' }} onClick={(e) => e.stopPropagation()} data-testid="backend-dialog">
        <h3>Studio backend</h3>
        <p className="muted">The website edits and previews in your browser. To render MP4s, generate narration and mix audio, point it at a running studio backend. Your provider API keys stay on that server and are never entered here.</p>
        <div className="field"><label>Backend address (https)</label><input data-testid="backend-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://studio.example.com" /></div>
        <div className="field"><label>Studio token (if the backend requires one)</label><input data-testid="backend-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></div>
        <p className="muted mono">Stored only in this browser. It gates the studio; it is not a provider key.</p>
        {msg && <div className={`issue ${msg.ok ? 'info' : 'error'}`} data-testid="backend-msg">{msg.text}</div>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={busy || !url.trim()} onClick={save} data-testid="backend-connect">Test and connect</button>
          {mode.kind === 'remote' && <button className="btn" onClick={() => { disconnect(); location.reload(); }}>Disconnect (back to demo)</button>}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export const App: React.FC<{ mode: Mode }> = ({ mode }) => {
  const route = useRoute();
  const [dlg, setDlg] = useState(false);
  return (
    <>
      <div className="topbar">
        <a href="#/" style={{ textDecoration: 'none' }}>
          <div className="brand">
            The Unbuilt World <span className="muted">Studio</span>
            <small>Stories from the futures we left behind.</small>
          </div>
        </a>
        <span className="grow" />
        {mode.kind === 'local' ? (
          <Badge tone="ok" title="Served by the local studio">local studio</Badge>
        ) : mode.kind === 'demo' ? (
          <Badge tone="warn" title="Edits are saved in this browser only">demo mode · runs in your browser</Badge>
        ) : (
          <Badge tone="ok" title={mode.url}>backend · {new URL(mode.url).host}</Badge>
        )}
        {mode.kind !== 'local' && <button className="btn small" onClick={() => setDlg(true)} data-testid="backend-btn">Backend</button>}
        {mode.kind === 'demo' && <button className="btn small" title="Discard your edits and uploads in this browser and restore the pilot" onClick={async () => { if (confirm('Discard all demo edits and uploads in this browser?')) { await resetDemo(); location.hash = '#/'; location.reload(); } }}>Reset demo</button>}
      </div>
      {dlg && <BackendDialog mode={mode} onClose={() => setDlg(false)} />}
      <div className="page">{route ? <ProjectView key={route.id} id={route.id} tab={route.tab} mode={mode} /> : <Dashboard mode={mode} />}</div>
    </>
  );
};
