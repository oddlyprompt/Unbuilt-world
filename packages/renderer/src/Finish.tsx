import React, { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { rand } from './shared';

/** A 256px film-grain tile drawn once with a seeded generator, then jittered per frame. */
function useGrainTile(): string {
  return useMemo(() => {
    if (typeof document === 'undefined') return '';
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = Math.floor(rand(i * 7 + 13) * 255);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }, []);
}

export const FilmFinish: React.FC<{ grain?: number; vignette?: number }> = ({ grain = 0.09, vignette = 0.55 }) => {
  const frame = useCurrentFrame();
  const tile = useGrainTile();
  const jx = Math.floor(rand(frame * 3 + 1) * 256);
  const jy = Math.floor(rand(frame * 5 + 2) * 256);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${tile})`,
          backgroundPosition: `${jx}px ${jy}px`,
          opacity: grain,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 52%, rgba(6,10,13,${vignette}) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </>
  );
};
