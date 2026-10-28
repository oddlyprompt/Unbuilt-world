import React, { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Episode } from '@uw/renderer/player';
import type { EpisodeProps } from '@uw/renderer/player';
import { api } from './api';
import { useCtx } from './ProjectView';

interface Preview {
  props: EpisodeProps;
  mixReady: boolean;
  mixHash: string;
}

/** The composition played in the browser with the real mix. Rebuilt whenever the project revision changes. */
export const PreviewPlayer: React.FC = () => {
  const { id, state, registerSeek, setPlayhead } = useCtx();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<PlayerRef>(null);
  const rev = state.project.revision;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const p = await api<Preview>(`/api/projects/${id}/preview`);
        if (stop) return;
        setPreview(p);
        setErr(null);
        if (!p.mixReady) timer = setTimeout(load, 1500);
      } catch (e) {
        if (!stop) setErr((e as Error).message);
      }
    };
    void load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, rev]);

  useEffect(() => {
    registerSeek((f) => {
      ref.current?.seekTo(f);
    });
  }, [registerSeek]);

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    const on = (e: { detail: { frame: number } }) => setPlayhead(e.detail.frame);
    p.addEventListener('frameupdate', on);
    return () => p.removeEventListener('frameupdate', on);
  }, [preview, setPlayhead]);

  if (err) return <div className="panel">Preview unavailable: {err}</div>;
  if (!preview) return <div className="player-wrap" />;
  const pr = preview.props;
  return (
    <div>
      <div className="player-wrap" data-testid="player">
        <Player
          ref={ref}
          component={Episode as unknown as React.ComponentType<Record<string, unknown>>}
          inputProps={pr as unknown as Record<string, unknown>}
          durationInFrames={Math.max(1, pr.totalFrames)}
          fps={pr.fps}
          compositionWidth={pr.width}
          compositionHeight={pr.height}
          controls
          style={{ width: '100%', height: '100%' }}
          clickToPlay
          doubleClickToFullscreen
          acknowledgeRemotionLicense
          initialFrame={0}
        />
      </div>
      <div className="muted mono" style={{ marginTop: 4 }} data-testid="mix-status">
        {preview.mixReady ? 'Audio: current mix loaded.' : 'Audio: building the mix for the latest edits… (picture is live, sound follows)'}
      </div>
    </div>
  );
};
