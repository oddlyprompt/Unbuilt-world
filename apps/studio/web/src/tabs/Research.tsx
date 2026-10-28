import React from 'react';
import { ClaimStatus } from '@uw/core';
import { Badge } from '../ui';
import { useCtx } from '../ProjectView';

const tone = (s: string) => (s === 'verified' ? 'ok' : s === 'disputed' ? 'bad' : s === 'creative_reconstruction' ? 'amber' : 'warn');

export const ResearchTab: React.FC = () => {
  const { state, apply, toast } = useCtx();
  const p = state.project;
  const setStatus = async (claimId: string, status: string) => {
    if (status === 'verified') {
      const cl = p.claims.find((c) => c.id === claimId)!;
      if (!cl.sourceIds.length) return toast('Attach at least one source before verifying.', true);
      const by = prompt(`Who checked "${cl.text}" against its sources? (This is recorded with today's date.)`);
      if (!by?.trim()) return;
      await apply({ op: 'updateClaim', claimId, patch: { status, verification: { by, on: '', note: 'Checked against the cited sources.' } } });
    } else await apply({ op: 'updateClaim', claimId, patch: { status, verification: undefined } });
  };
  const counts = ClaimStatus.options.map((s) => [s, p.claims.filter((c) => c.status === s).length] as const);
  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {counts.map(([s, n]) => <Badge key={s} tone={tone(s)}>{n} {s.replace(/_/g, ' ')}</Badge>)}
      </div>
      <div className="muted" style={{ maxWidth: 860, marginBottom: 14 }}>
        Nothing generated or drafted is verified automatically. A claim becomes <b>verified</b> only when a named person records that they checked it against its cited sources. Intended capabilities and demonstrated functionality are tracked separately.
      </div>
      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table data-testid="claims">
          <thead><tr><th>Claim</th><th>Scope</th><th>Status</th><th>Sources</th><th>Note</th></tr></thead>
          <tbody>
            {p.claims.map((c) => (
              <tr key={c.id}>
                <td style={{ maxWidth: 420 }}>{c.text}<div className="muted mono">{c.id} · {c.origin.replace(/_/g, ' ')}</div></td>
                <td>{c.scope}</td>
                <td>
                  <select value={c.status} onChange={(e) => void setStatus(c.id, e.target.value)}>
                    {ClaimStatus.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                  {c.verification && <div className="muted mono">by {c.verification.by}</div>}
                </td>
                <td className="mono">{c.sourceIds.map((s) => <div key={s}>{p.sources.find((x) => x.id === s)?.title.slice(0, 40) ?? s}</div>)}</td>
                <td style={{ maxWidth: 360 }} className="muted">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ margin: '20px 0 8px', fontSize: 24 }}>Sources</h3>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Source</th><th>Kind</th><th>Tier</th><th>Checked</th></tr></thead>
          <tbody>
            {p.sources.map((s) => (
              <tr key={s.id}><td>{s.title}<div className="muted mono">{[s.author, s.publisher, s.year].filter(Boolean).join(' · ')}</div></td><td>{s.kind}</td><td>{s.tier}</td><td>{s.checked ? <Badge tone="ok">{s.checked.by}</Badge> : <Badge tone="warn">not yet read</Badge>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
