import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { colors, fonts } from '@uw/core';
import { CameraMove } from './Camera';
import { FilmFinish } from './Finish';
import { Disclosure, Overlays } from './Overlays';
import { ShotContext } from './shared';
import { Visual } from './visuals';
import { loadFonts } from './fonts';
import type { EpisodeProps, RenderShot } from './types';

/** Opacity/clip applied to a shot by the transition INTO it. */
function transitionStyle(shot: RenderShot, frame: number): React.CSSProperties {
  const { type, frames } = shot.transitionIn;
  if (type === 'cut' || frames <= 0) return {};
  switch (type) {
    case 'fade':
      return { opacity: interpolate(frame, [0, frames], [0, 1], { extrapolateRight: 'clamp' }) };
    case 'wipe': {
      const p = interpolate(frame, [0, frames], [0, 100], { extrapolateRight: 'clamp' });
      return { clipPath: `inset(0 ${100 - p}% 0 0)` };
    }
    case 'dip_black':
    case 'dip_paper': {
      // The incoming half of a dip: the colour layer is drawn separately; here the picture only waits.
      const half = Math.max(1, Math.floor(frames / 2));
      return { opacity: frame < half ? 0 : 1 };
    }
  }
}

/** Colour layer for dips, in and out of a shot. */
const DipLayer: React.FC<{ shot: RenderShot; frame: number }> = ({ shot, frame }) => {
  const inn = shot.transitionIn;
  const out = shot.transitionOut;
  let alpha = 0;
  let color: string = colors.ink;
  if ((inn.type === 'dip_black' || inn.type === 'dip_paper') && inn.frames > 0) {
    const half = Math.max(1, Math.floor(inn.frames / 2));
    alpha = Math.max(alpha, interpolate(frame, [half, inn.frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
    if (frame < half) alpha = 1;
    color = inn.type === 'dip_paper' ? colors.paper : colors.ink;
  }
  if ((out.type === 'dip_black' || out.type === 'dip_paper') && out.frames > 0) {
    const half = Math.max(1, Math.floor(out.frames / 2));
    const start = shot.durationFrames - half;
    const a = interpolate(frame, [start, shot.durationFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    if (a > alpha) {
      alpha = a;
      color = out.type === 'dip_paper' ? colors.paper : colors.ink;
    }
  }
  if (alpha <= 0) return null;
  return <AbsoluteFill style={{ background: color, opacity: alpha }} />;
};

const ShotView: React.FC<{ shot: RenderShot; disclosures: boolean }> = ({ shot, disclosures }) => {
  const frame = useCurrentFrame();
  return (
    <ShotContext.Provider value={{ shot, duration: shot.durationFrames }}>
      <AbsoluteFill style={{ background: colors.ink, ...transitionStyle(shot, frame) }}>
        <CameraMove camera={shot.camera}>
          <Visual shot={shot} />
        </CameraMove>
        <Overlays overlays={shot.overlays} />
        {disclosures && <Disclosure />}
      </AbsoluteFill>
      <DipLayer shot={shot} frame={frame} />
    </ShotContext.Provider>
  );
};

const Captions: React.FC<{ lines: EpisodeProps['captions'] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const line = lines.find((l) => frame >= l.startFrame && frame < l.endFrame);
  if (!line) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 70 }}>
      <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 40, color: colors.paper, background: 'rgba(14,21,26,.66)', padding: '8px 22px', borderRadius: 4, maxWidth: 1500, textAlign: 'center' }}>{line.text}</div>
    </AbsoluteFill>
  );
};

export const Episode: React.FC<EpisodeProps> = (props) => {
  loadFonts();
  return (
    <AbsoluteFill style={{ background: colors.ink }}>
      {props.shots.map((s) => (
        <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durationFrames + s.tailFrames} name={s.id}>
          <ShotView shot={s} disclosures={props.disclosures} />
        </Sequence>
      ))}
      <FilmFinish />
      {props.captions.length > 0 && <Captions lines={props.captions} />}
      {props.audioUrl && <Audio src={props.audioUrl} />}
    </AbsoluteFill>
  );
};
