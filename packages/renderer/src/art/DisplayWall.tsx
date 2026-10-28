import React from 'react';
import { colors } from '@uw/core';
import { Fill, lerp, seg, useProgress } from '../shared';
import { SlidePanel } from './Panels';

/** A wall of back-projected slide screens in a shallow arc. Frontal and wide. */
export const DisplayWall: React.FC<{ props: Record<string, unknown> }> = () => {
  const { sec, t } = useProgress();
  const specs = [
    { x: -900, w: 340, h: 260, ry: 26, v: 1, tint: colors.sage },
    { x: -500, w: 420, h: 320, ry: 14, v: 2, tint: colors.amber },
    { x: 0, w: 560, h: 400, ry: 0, v: 0, tint: colors.amber },
    { x: 500, w: 420, h: 320, ry: -14, v: 3, tint: colors.sage },
    { x: 900, w: 340, h: 260, ry: -26, v: 1, tint: colors.amber },
  ];
  const slide = lerp(-50, 50, t);
  return (
    <Fill style={{ background: 'radial-gradient(ellipse at 50% 55%, #26343d, #0e151a 70%)' }}>
      <div style={{ position: 'absolute', inset: 0, perspective: 1500, perspectiveOrigin: '50% 45%' }}>
        <div style={{ position: 'absolute', left: '50%', top: '47%', transformStyle: 'preserve-3d', transform: `translate3d(${slide}px, 0, 0)` }}>
          {specs.map((s, i) => {
            const on = seg(sec, 0.2 + i * 0.25, 0.7 + i * 0.25, (x) => x);
            return (
              <div key={i} style={{ position: 'absolute', left: s.x - s.w / 2, top: -s.h / 2, width: s.w, height: s.h, transform: `rotateY(${s.ry}deg)`, opacity: 0.15 + 0.85 * on, boxShadow: `0 0 90px ${s.tint}33`, border: `6px solid #1b262d` }}>
                <SlidePanel w={s.w - 12} h={s.h - 12} variant={s.v} sec={sec} tint={s.tint} phase={i * 1.1} />
              </div>
            );
          })}
        </div>
      </div>
      <Fill style={{ background: 'linear-gradient(180deg, transparent 62%, rgba(7,11,14,.85))' }} />
    </Fill>
  );
};
