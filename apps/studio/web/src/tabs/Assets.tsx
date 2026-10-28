import React, { useRef, useState } from 'react';
import { LicenseStatus, assetProblems } from '@uw/core';
import { mediaUrl } from '../api';
import { Badge, bytes } from '../ui';
import { useCtx } from '../ProjectView';

export const AssetsTab: React.FC = () => {
  const { id, state, apply, toast, reload } = useCtx();
  const { project: p, files } = state;
  const addRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (f: File, replaceId?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}/upload?filename=${encodeURIComponent(f.name)}${replaceId ? `&replaceId=${encodeURIComponent(replaceId)}` : ''}`, { method: 'PUT', body: f });
      const j = (await res.json()) as { asset?: { id: string }; error?: string };
      if (!res.ok) return toast(j.error ?? 'Upload failed', true);
      toast(replaceId ? `Replaced the file behind ${replaceId}. Shots keep using it.` : `Added ${j.asset?.id}.`);
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const used = (assetId: string) => p.shots.filter((s) => s.assetId === assetId || s.soundCues.some((c) => c.assetId === assetId)).map((s) => s.id);

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="muted grow" style={{ maxWidth: 820 }}>
          Public does not mean reusable. Every asset keeps its origin, rights holder, licence and attribution. Anything marked placeholder, uncleared or AI-generated is flagged until a person resolves it.
        </div>
        <input ref={addRef} type="file" hidden data-testid="asset-add-input" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <button className="btn primary" disabled={busy} onClick={() => addRef.current?.click()}>Add asset…</button>
      </div>
      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table data-testid="asset-table">
          <thead><tr><th></th><th>Asset</th><th>Origin</th><th>Licence</th><th>Rights holder / attribution</th><th>Status</th><th>Used by</th><th></th></tr></thead>
          <tbody>
            {p.assets.filter((a) => !a.id.startsWith('narr-')).map((a) => {
              const f = files[a.id];
              const probs = assetProblems(a);
              return (
                <tr key={a.id} data-testid={`asset-row-${a.id}`}>
                  <td>{a.kind === 'image' && f?.exists ? <img className="thumb" alt="" src={mediaUrl(id, a.relPath)} /> : <span className="muted mono">{a.kind}</span>}</td>
                  <td><b className="mono">{a.id}</b><div className="muted mono">{a.filename}{a.width ? ` · ${a.width}×${a.height}` : ''}{a.durationSec ? ` · ${a.durationSec.toFixed(1)}s` : ''} · {f?.exists ? bytes(f.bytes) : <span style={{ color: 'var(--danger)' }}>file missing</span>}</div></td>
                  <td>{a.origin.replace(/_/g, ' ')}{a.aiGenerated && <> <Badge tone="amber">AI</Badge></>}</td>
                  <td>
                    <select value={a.licenseStatus} onChange={(e) => void apply({ op: 'updateAsset', assetId: a.id, patch: { licenseStatus: e.target.value } })}>
                      {LicenseStatus.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td>
                    <input placeholder="rights holder" defaultValue={a.rightsHolder ?? ''} onBlur={(e) => e.target.value !== (a.rightsHolder ?? '') && void apply({ op: 'updateAsset', assetId: a.id, patch: { rightsHolder: e.target.value } })} style={{ width: 150 }} />{' '}
                    <input placeholder="attribution" defaultValue={a.attribution ?? ''} onBlur={(e) => e.target.value !== (a.attribution ?? '') && void apply({ op: 'updateAsset', assetId: a.id, patch: { attribution: e.target.value, attributionRequired: !!e.target.value } })} style={{ width: 170 }} />
                  </td>
                  <td>
                    <select value={a.approval} onChange={(e) => void apply({ op: 'updateAsset', assetId: a.id, patch: { approval: e.target.value } })}>
                      {['pending', 'approved', 'rejected'].map((o) => <option key={o}>{o}</option>)}
                    </select>
                    {probs.map((x) => <div key={x}><Badge tone="warn">{x}</Badge></div>)}
                  </td>
                  <td className="mono">{used(a.id).join(', ') || '—'}</td>
                  <td>
                    <label className="btn small" title="Keeps the id: shots using it change automatically">
                      Replace file…
                      <input type="file" hidden data-testid={`replace-${a.id}`} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0], a.id)} />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted mono">{p.assets.filter((a) => a.id.startsWith('narr-')).length} narration clips are managed in the Script tab.</p>
    </div>
  );
};
