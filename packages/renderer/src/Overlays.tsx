import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { colors, fonts } from '@uw/core';
import { useShot } from './shared';
import type { RenderOverlay } from './types';

const M = 96; // safe margin, px at 1920x1080

const POS: Record<RenderOverlay['position'], React.CSSProperties> = {
  top_left: { left: M, top: M * 0.8, alignItems: 'flex-start' },
  top_right: { right: M, top: M * 0.8, alignItems: 'flex-end', textAlign: 'right' },
  bottom_left: { left: M, bottom: M * 0.9, alignItems: 'flex-start' },
  bottom_center: { left: 0, right: 0, bottom: M * 0.9, alignItems: 'center', textAlign: 'center' },
  center: { left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
};

const OverlayItem: React.FC<{ o: RenderOverlay }> = ({ o }) => {
  const frame = useCurrentFrame();
  const local = frame - o.atFrame;
  if (local < 0 || local > o.durFrames) return null;
  const fade = Math.min(12, Math.floor(o.durFrames / 3));
  const opacity = interpolate(local, [0, fade, o.durFrames - fade, o.durFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rise = interpolate(local, [0, fade * 1.5], [10, 0], { extrapolateRight: 'clamp' });
  const [main, sub] = o.text.split('|').map((s) => s.trim());
  const base: React.CSSProperties = { position: 'absolute', display: 'flex', flexDirection: 'column', gap: 8, opacity, transform: `translateY(${rise}px)`, ...POS[o.position] };

  switch (o.style) {
    case 'kicker':
      return (
        <div style={base}>
          <div style={{ width: 56, height: 2, background: colors.amber, marginBottom: 6 }} />
          <div style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 24, letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.amber, textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>{main}</div>
          {sub && <div style={{ fontFamily: fonts.mono, fontSize: 20, letterSpacing: '0.12em', color: colors.bone, textTransform: 'uppercase' }}>{sub}</div>}
        </div>
      );
    case 'lower_third':
      return (
        <div style={{ ...base, paddingLeft: 22, borderLeft: `3px solid ${colors.amber}` }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 54, lineHeight: 1.05, color: colors.paper, textShadow: '0 2px 16px rgba(0,0,0,.7)' }}>{main}</div>
          {sub && <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.1em', color: colors.sage, textTransform: 'uppercase' }}>{sub}</div>}
        </div>
      );
    case 'caption':
      return (
        <div style={base}>
          <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 40, lineHeight: 1.25, color: colors.paper, background: 'rgba(14,21,26,.62)', padding: '8px 22px', borderRadius: 4, maxWidth: 1500 }}>{main}</div>
        </div>
      );
    case 'title':
      return (
        <div style={base}>
          <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 120, lineHeight: 1, color: colors.paper, textShadow: '0 4px 30px rgba(0,0,0,.6)' }}>{main}</div>
          {sub && <div style={{ fontFamily: fonts.mono, fontSize: 28, letterSpacing: '0.2em', color: colors.amber, textTransform: 'uppercase' }}>{sub}</div>}
        </div>
      );
    default:
      return (
        <div style={base}>
          <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.08em', color: colors.paper, background: 'rgba(25,35,42,.78)', border: `1px solid ${colors.steel}`, padding: '8px 16px' }}>{main}</div>
        </div>
      );
  }
};

export const Overlays: React.FC<{ overlays: RenderOverlay[] }> = ({ overlays }) => (
  <>
    {overlays.map((o) => (
      <OverlayItem key={o.id} o={o} />
    ))}
  </>
);

/** Honest labelling: shown on anything that is a reconstruction, illustration or stand-in. */
export const Disclosure: React.FC = () => {
  const { shot, duration } = useShot();
  const frame = useCurrentFrame();
  const needs = shot.reconstruction.isReconstruction || shot.status === 'placeholder';
  if (!needs) return null;
  const label = shot.status === 'placeholder' ? 'PLACEHOLDER · NOT FINAL MEDIA' : (shot.reconstruction.label ?? 'ILLUSTRATIVE RECONSTRUCTION · NOT ARCHIVAL');
  const opacity = interpolate(frame, [15, 30, Math.max(31, duration - 10), duration], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', right: M, bottom: M * 0.9, opacity, display: 'flex', alignItems: 'center', gap: 12, fontFamily: fonts.mono, fontSize: 18, letterSpacing: '0.14em', color: colors.amber, background: 'rgba(14,21,26,.7)', border: `1px solid ${colors.amber}`, padding: '8px 14px', textTransform: 'uppercase' }}>
      <span style={{ width: 8, height: 8, borderRadius: 8, background: colors.amber }} />
      {label}
    </div>
  );
};
