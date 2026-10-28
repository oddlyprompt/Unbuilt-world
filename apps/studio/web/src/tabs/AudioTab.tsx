import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, DemoNotice, Field, NumberInput } from '../ui';
import { getMode } from '../backend';
import { useCtx } from '../ProjectView';

interface Analysis { peakDb: number; meanDb: number; integratedLufs?: number; truePeakDb?: number; loudnessRange?: number; silences: { start: number; duration: number }[]; warnings: string[]; clipped: boolean }

export const AudioTab: React.FC = () => {
  const { id, state, apply, startJob, jobs, toast } = useCtx();
  const a = state.project.audio;
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [note, setNote] = useState('');
  const load = () => api<Analysis>(`/api/projects/${id}/analyze-mix`).then((x) => { setAnalysis(x); setNote(''); }).catch((e) => { setAnalysis(null); setNote(e.message); });
  // Re-analyse when the mix changes AND when a mix job finishes (the file may only exist after that).
  const mixesDone = jobs.filter((j) => j.type === 'mix' && j.status === 'succeeded').length;
  useEffect(() => void load(), [state.mixHash, mixesDone]);
  const mixing = jobs.some((j) => j.type === 'mix' && (j.status === 'running' || j.status === 'queued'));

  const setMusic = (trackId: string, patch: Record<string, unknown>) => apply({ op: 'updateAudio', patch: { music: a.music.map((m) => (m.id === trackId ? { ...m, ...patch } : m)) } });

  return (
    <div>
    {getMode().kind === 'demo' && <DemoNotice>Gain, fade and ducking settings are editable and saved. Re-mixing and loudness analysis run on the backend, so the preview keeps playing the original mix.</DemoNotice>}
    <div className="split" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div>
        <div className="panel">
          <h3>Mix</h3>
          <div className="row wrap">
            <Field label="Narration gain (dB)"><NumberInput value={a.narrationGainDb} step={0.5} min={-30} onCommit={(v) => void apply({ op: 'updateAudio', patch: { narrationGainDb: v } })} /></Field>
            <Field label="Target loudness (LUFS)"><NumberInput value={a.targetLufs} step={0.5} min={-40} onCommit={(v) => void apply({ op: 'updateAudio', patch: { targetLufs: v } })} /></Field>
            <Field label="True-peak ceiling (dBTP)"><NumberInput value={a.truePeakDb} step={0.5} min={-9} onCommit={(v) => void apply({ op: 'updateAudio', patch: { truePeakDb: Math.min(0, v) } })} /></Field>
          </div>
          <div className="muted">Narration is the reference. Music ducks under it by a fixed amount computed from the actual word timings; the final mix is normalised in two passes so it does not clip.</div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={mixing} data-testid="rebuild-mix" onClick={async () => { await startJob('mix', {}); toast('Building the mix…'); }}>{mixing ? 'Mixing…' : 'Rebuild mix and analyse'}</button>
          </div>
        </div>
        <div className="panel" style={{ marginTop: 16 }} data-testid="analysis">
          <h3>Analysis of the current mix</h3>
          {!analysis && <div className="muted">{note || 'Analysing…'}</div>}
          {analysis && (
            <>
              <div className="row wrap">
                <Badge tone={analysis.integratedLufs !== undefined && Math.abs(analysis.integratedLufs - a.targetLufs) < 1 ? 'ok' : 'warn'}>{analysis.integratedLufs} LUFS</Badge>
                <Badge tone={analysis.clipped ? 'bad' : 'ok'}>peak {analysis.peakDb} dBFS</Badge>
                <Badge>true peak {analysis.truePeakDb} dBTP</Badge>
                <Badge>range {analysis.loudnessRange} LU</Badge>
              </div>
              {analysis.warnings.length === 0 ? <p className="muted">No clipping, no long silences.</p> : analysis.warnings.map((w) => <div key={w} className="issue warning">{w}</div>)}
            </>
          )}
        </div>
      </div>
      <div>
        {a.music.map((m) => (
          <div className="panel" key={m.id} style={{ marginBottom: 14 }} data-testid={`music-${m.id}`}>
            <h3>{m.id} <span className="muted mono">· {m.assetId}</span></h3>
            <div className="row wrap">
              <Field label="Gain (dB)"><NumberInput value={m.gainDb} step={1} min={-60} onCommit={(v) => void setMusic(m.id, { gainDb: Math.min(6, v) })} /></Field>
              <Field label="Fade in (s)"><NumberInput value={m.fadeInSec} onCommit={(v) => void setMusic(m.id, { fadeInSec: v })} /></Field>
              <Field label="Fade out (s)"><NumberInput value={m.fadeOutSec} onCommit={(v) => void setMusic(m.id, { fadeOutSec: v })} /></Field>
            </div>
            <div className="row wrap">
              <label className="row"><input type="checkbox" checked={m.duck.enabled} onChange={(e) => void setMusic(m.id, { duck: { ...m.duck, enabled: e.target.checked } })} /> duck under narration</label>
              <Field label="Duck depth (dB)"><NumberInput value={m.duck.amountDb} step={1} disabled={!m.duck.enabled} onCommit={(v) => void setMusic(m.id, { duck: { ...m.duck, amountDb: v } })} /></Field>
            </div>
            {m.keyframes.length > 0 && <div className="muted mono">Gain moves: {m.keyframes.map((k) => `${k.shotId ?? 'project'}+${k.atSec}s → ${k.gainDb} dB`).join(' · ')}</div>}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
};
