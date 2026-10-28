import React, { useRef } from 'react';
import { segmentTextHash, tokenize, wordCount, spokenSecondsAt } from '@uw/core';
import { fmt, mediaUrl } from '../api';
import { Badge, DemoNotice, DownloadButton, NumberInput } from '../ui';
import { getMode } from '../backend';
import { useCtx } from '../ProjectView';

export const ScriptTab: React.FC = () => {
  const { id, state, apply, startJob, toast, reload } = useCtx();
  const { project: p, timeline: t } = state;
  const words = wordCount(p);
  const missing = p.narration.filter((n) => !n.audio || n.audio.textHash !== segmentTextHash(n)).length;

  const importAudio = async (segId: string, f: File) => {
    const res = await fetch(`/api/projects/${id}/narration/${segId}/audio?filename=${encodeURIComponent(f.name)}`, { method: 'PUT', body: f });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return toast(j.error ?? 'Import failed', true);
    toast(`Imported narration for ${segId}. Word timings are estimated until adjusted.`);
    await reload();
  };

  return (
    <div>
      {getMode().kind === 'demo' && <DemoNotice>You can edit the script, pauses and locks, and import recordings. Generating or regenerating narration needs the speech engine on the backend.</DemoNotice>}
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Badge>{words} words</Badge>
        <Badge title="Words ÷ narration pace, without pauses">≈ {fmt(spokenSecondsAt(words, p.settings.narrationWpm))} at {p.settings.narrationWpm} wpm</Badge>
        <Badge tone="amber" title="Measured from the audio where it exists">timeline narration {fmt(t.narrationEndSec - t.narrationStartSec)}</Badge>
        <span className="grow" />
        <button className="btn primary" disabled={!missing} data-testid="narrate-missing" onClick={async () => { const j = await startJob('narrate', { provider: 'local-espeak' }); if (j) toast('Generating scratch narration…'); }}>
          Generate missing narration ({missing}) with the local voice
        </button>
        {(['md', 'json', 'txt'] as const).map((f) => <DownloadButton key={f} path={`/api/projects/${id}/script?format=${f}`} filename={`${id}-script.${f}`}>Export .{f}</DownloadButton>)}
      </div>
      <div className="muted" style={{ marginBottom: 14, maxWidth: 900 }}>
        The local voice is an offline scratch narrator so timing and mix can be checked without any account. A paid provider (ElevenLabs) is built in but needs your own key and an explicit confirmation before any batch.
      </div>
      {p.chapters.map((c) => {
        const segs = p.narration.filter((n) => n.chapterId === c.id);
        if (!segs.length) return null;
        return (
          <div key={c.id}>
            <h3 style={{ margin: '18px 0 8px', fontSize: 26 }}>{c.index}. {c.title}</h3>
            {segs.map((n) => {
              const r = t.segments.find((s) => s.id === n.id)!;
              const stale = n.audio && n.audio.textHash !== segmentTextHash(n);
              const a = n.audio ? p.assets.find((x) => x.id === n.audio!.assetId) : undefined;
              return (
                <div className="seg" key={n.id} data-testid={`segment-${n.id}`}>
                  <div className="row wrap" style={{ marginBottom: 6 }}>
                    <span className="mono">{n.id}</span>
                    <span className="mono muted">{fmt(r.startSec)} → {fmt(r.endSec)} ({r.durationSec.toFixed(1)}s, {tokenize(n.text).length} words)</span>
                    {!n.audio ? <Badge tone="warn">no audio · estimated</Badge> : stale ? <Badge tone="warn">audio out of date</Badge> : <Badge tone="ok">{n.audio.provider} · {n.audio.alignment} timing</Badge>}
                    {n.locked && <Badge tone="amber">locked</Badge>}
                    <span className="grow" />
                    {a && !stale && <audio controls preload="none" src={mediaUrl(id, a.relPath)} style={{ height: 28 }} />}
                  </div>
                  <textarea rows={Math.max(2, Math.ceil(n.text.length / 120))} defaultValue={n.text} disabled={n.locked} data-testid={`segment-text-${n.id}`} onBlur={(e) => e.target.value.trim() && e.target.value !== n.text && void apply({ op: 'updateNarration', segmentId: n.id, patch: { text: e.target.value } })} />
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <span className="muted mono">pause before (s)</span>
                    <NumberInput value={n.gapBeforeSec} step={0.1} onCommit={(v) => void apply({ op: 'updateNarration', segmentId: n.id, patch: { gapBeforeSec: v } })} />
                    <label className="row"><input type="checkbox" checked={n.locked} onChange={(e) => void apply({ op: 'updateNarration', segmentId: n.id, patch: { locked: e.target.checked } })} /> lock text and audio</label>
                    <span className="grow" />
                    <button className="btn small" disabled={n.locked} onClick={async () => { const j = await startJob('narrate', { provider: 'local-espeak', segmentIds: [n.id], force: true }); if (j) toast(`Regenerating ${n.id}…`); }}>Regenerate</button>
                    <label className="btn small">
                      Import audio…
                      <input type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && void importAudio(n.id, e.target.files[0])} />
                    </label>
                  </div>
                  <div className="muted mono" style={{ marginTop: 4 }}>
                    {n.claimIds.map((cid) => { const cl = p.claims.find((x) => x.id === cid); return <span key={cid} style={{ marginRight: 10 }}>{cl ? <Badge tone={cl.status === 'verified' ? 'ok' : cl.status === 'disputed' ? 'bad' : 'warn'} title={cl.text}>{cl.status.replace(/_/g, ' ')}</Badge> : cid}</span>; })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
