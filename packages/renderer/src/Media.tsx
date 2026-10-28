import React from 'react';
import { Img, OffthreadVideo, interpolate } from 'remotion';
import { colors, fonts } from '@uw/core';
import { Fill, str, useProgress } from './shared';
import type { RenderAsset, RenderShot } from './types';

/** Full-bleed image or video, cover-fitted. Camera movement is applied by the caller. */
export const MediaLayer: React.FC<{ asset: RenderAsset; fit?: 'cover' | 'contain'; filter?: string }> = ({ asset, fit = 'cover', filter }) => {
  const style: React.CSSProperties = { width: '100%', height: '100%', objectFit: fit, filter };
  if (asset.kind === 'video') return <OffthreadVideo src={asset.url} muted style={style} />;
  return <Img src={asset.url} style={style} />;
};

/** A visible stand-in. Never a silent blank: it says what is missing and why it matters. */
export const Slate: React.FC<{ title: string; detail?: string; tag?: string; backdrop?: boolean }> = ({ title, detail, tag = 'PLACEHOLDER', backdrop = true }) => {
  const { t } = useProgress();
  return (
    <Fill style={{ background: colors.deep }}>
      {backdrop && <Skyline progress={t} />}
      <Fill style={{ background: 'repeating-linear-gradient(135deg, rgba(212,161,106,.06) 0 14px, transparent 14px 28px)' }} />
      <Fill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18, textAlign: 'center' }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.3em', color: colors.amber, border: `1px solid ${colors.amber}`, padding: '8px 18px' }}>{tag}</div>
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 64, color: colors.paper, maxWidth: 1200, lineHeight: 1.05 }}>{title}</div>
        {detail && <div style={{ fontFamily: fonts.mono, fontSize: 24, color: colors.bone, maxWidth: 1100, lineHeight: 1.4 }}>{detail}</div>}
      </Fill>
    </Fill>
  );
};

/** Abstract Andes-and-city silhouette, used only behind placeholders. */
const Skyline: React.FC<{ progress: number }> = ({ progress }) => {
  const shift = interpolate(progress, [0, 1], [0, -40]);
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2b33" />
          <stop offset="0.7" stopColor="#3a4c57" />
          <stop offset="1" stopColor="#6f7f80" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#sky)" />
      <g transform={`translate(${shift * 0.3} 0)`}>
        <path d="M-100 700 L180 470 L330 580 L520 380 L700 560 L860 430 L1100 610 L1300 400 L1500 590 L1700 450 L2000 650 L2000 1080 L-100 1080Z" fill="#2c3b45" />
      </g>
      <g transform={`translate(${shift * 0.6} 0)`}>
        <path d="M-100 790 L120 640 L300 720 L470 600 L650 740 L880 650 L1080 760 L1260 620 L1480 770 L1700 660 L2000 800 L2000 1080 L-100 1080Z" fill="#1c2830" />
      </g>
      <g transform={`translate(${shift} 0)`} fill="#121b21">
        {Array.from({ length: 34 }).map((_, i) => {
          const x = i * 62 - 60;
          const h = 90 + ((i * 53) % 150);
          return <rect key={i} x={x} y={900 - h} width={44} height={h + 200} />;
        })}
      </g>
    </svg>
  );
};

/** Archival photo presentation: matte, paper border, credit plate. Honest about missing media. */
export const ArchivalPhoto: React.FC<{ shot: RenderShot }> = ({ shot }) => {
  const asset = shot.asset;
  const { t } = useProgress();
  const caption = str(shot.props, 'caption', '');
  const treatment = str(shot.props, 'treatment', 'none');
  if (!asset) {
    return <Slate title={str(shot.props, 'needs', 'Archival photograph required')} detail={str(shot.props, 'detail', 'Assign a licensed photograph to this shot in the Assets tab. The slate disappears and the photograph takes its place.')} tag="ARCHIVAL IMAGE SLOT" />;
  }
  const filter = treatment === 'mono' ? 'grayscale(1) contrast(1.08)' : treatment === 'duotone' ? 'grayscale(1) sepia(.55) contrast(1.05)' : undefined;
  const lift = interpolate(t, [0, 1], [0, -10]);
  return (
    <Fill style={{ background: `radial-gradient(ellipse at 50% 40%, ${colors.slate}, ${colors.ink})` }}>
      <div style={{ position: 'absolute', left: '50%', top: '47%', width: 1280, height: 720, transform: `translate(-50%, -50%) translateY(${lift}px)`, background: colors.paper, padding: 22, boxShadow: '0 40px 90px rgba(0,0,0,.6)' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: colors.ink }}>
          <MediaLayer asset={asset} filter={filter} />
        </div>
      </div>
      {(caption || asset.credit) && (
        <div style={{ position: 'absolute', left: 320, right: 320, bottom: 54, display: 'flex', justifyContent: 'space-between', gap: 40, fontFamily: fonts.mono, fontSize: 20, letterSpacing: '0.06em', color: colors.bone }}>
          <span>{caption}</span>
          <span style={{ color: colors.fog }}>{asset.credit ?? ''}</span>
        </div>
      )}
    </Fill>
  );
};
