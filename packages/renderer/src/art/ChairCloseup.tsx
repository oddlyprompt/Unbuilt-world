import React from 'react';
import { colors } from '@uw/core';
import { Fill, lerp, seg, useProgress, rand } from '../shared';

/** Close-up of an armrest with large control buttons, shallow focus on a glowing wall behind it. */
export const ChairCloseup: React.FC<{ props: Record<string, unknown> }> = () => {
  const { sec, t } = useProgress();
  // One button is pressed around 1.1s; its ring of light spreads and the wall behind answers.
  const press = seg(sec, 1.0, 1.15) - seg(sec, 1.5, 1.9);
  const ring = seg(sec, 1.15, 2.4, (x) => x);
  const buttons = [
    { x: 640, y: 640, c: colors.amber },
    { x: 840, y: 610, c: colors.paper },
    { x: 1040, y: 580, c: colors.amber },
    { x: 1240, y: 550, c: colors.sage },
    { x: 1440, y: 520, c: '#c9684f' },
  ];
  return (
    <Fill style={{ background: 'linear-gradient(180deg, #0f171c, #1b2830 60%, #101a20)' }}>
      {/* out-of-focus wall screens */}
      <Fill style={{ filter: 'blur(22px)', opacity: 0.9 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ position: 'absolute', left: 120 + i * 470, top: 70 + (i % 2) * 60, width: 360, height: 250, background: i === 1 ? colors.amber : colors.sage, opacity: 0.28 + 0.16 * Math.sin(sec * 1.7 + i) + (i === 2 ? press * 0.3 : 0) }} />
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={`b${i}`} style={{ position: 'absolute', left: rand(i + 3) * 1800, top: 340 + rand(i + 9) * 160, width: 40 + rand(i) * 40, height: 40 + rand(i) * 40, borderRadius: '50%', background: colors.amber, opacity: 0.12 + rand(i + 21) * 0.18 }} />
        ))}
      </Fill>
      {/* armrest */}
      <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="arm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e8e0d0" />
            <stop offset="0.5" stopColor="#bdb6a6" />
            <stop offset="1" stopColor="#6e7a7b" />
          </linearGradient>
          <linearGradient id="armTop" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#d9d1c0" />
            <stop offset="1" stopColor="#f3ecdc" />
          </linearGradient>
          <radialGradient id="bk" cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M-60 760 L2000 380 L2000 560 L-60 1080Z" fill="url(#arm)" />
        <path d="M-60 700 L2000 330 L2000 470 L-60 800Z" fill="url(#armTop)" />
        <path d="M-60 780 L2000 440 L2000 460 L-60 800Z" fill="#000" opacity={0.18} />
        {buttons.map((b, i) => {
          const y = b.y + (i === 2 ? press * 10 : 0);
          const lit = i === 2 ? 0.5 + press * 0.5 : 0.45 + 0.2 * Math.sin(sec * 2 + i);
          return (
            <g key={i} transform={`translate(${lerp(b.x, b.x, t)} ${y})`}>
              <ellipse cx={4} cy={24} rx={78} ry={24} fill="#000" opacity={0.4} />
              <ellipse cx={0} cy={10} rx={74} ry={26} fill="#3a4c57" />
              <ellipse cx={0} cy={i === 2 ? -4 + press * 8 : -6} rx={72} ry={26} fill={b.c} opacity={0.55 + lit * 0.4} />
              <ellipse cx={-14} cy={-14} rx={36} ry={10} fill="url(#bk)" />
              {i === 2 && <ellipse cx={0} cy={0} rx={72 + ring * 320} ry={26 + ring * 110} fill="none" stroke={colors.amber} strokeWidth={3} opacity={(1 - ring) * 0.8} />}
            </g>
          );
        })}
      </svg>
    </Fill>
  );
};
