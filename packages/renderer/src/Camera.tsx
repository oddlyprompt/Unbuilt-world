import React from 'react';
import type { Camera as CameraSpec } from '@uw/core';
import { ease, lerp, useProgress } from './shared';

interface View {
  s0: number;
  s1: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Turn a camera preset into start/end scale and offsets (fractions of the frame). */
export function viewFor(cam: CameraSpec): View {
  const k = cam.intensity;
  const fx = (cam.focus.x - 0.5) * 0.5;
  const fy = (cam.focus.y - 0.5) * 0.5;
  switch (cam.preset) {
    case 'static':
      return { s0: 1, s1: 1, x0: 0, x1: 0, y0: 0, y1: 0 };
    case 'push_in':
      return { s0: 1, s1: 1 + 0.2 * k, x0: 0, x1: -fx * 0.4 * k, y0: 0, y1: -fy * 0.4 * k };
    case 'pull_out':
      return { s0: 1 + 0.2 * k, s1: 1, x0: -fx * 0.4 * k, x1: 0, y0: -fy * 0.4 * k, y1: 0 };
    case 'pan_left':
      return { s0: 1.12, s1: 1.12, x0: 0.05 * k, x1: -0.05 * k, y0: 0, y1: 0 };
    case 'pan_right':
      return { s0: 1.12, s1: 1.12, x0: -0.05 * k, x1: 0.05 * k, y0: 0, y1: 0 };
    case 'pan_up':
      return { s0: 1.12, s1: 1.12, x0: 0, x1: 0, y0: 0.05 * k, y1: -0.05 * k };
    case 'pan_down':
      return { s0: 1.12, s1: 1.12, x0: 0, x1: 0, y0: -0.05 * k, y1: 0.05 * k };
    case 'drift':
      return { s0: 1.04, s1: 1.04 + 0.06 * k, x0: -0.012 * k, x1: 0.016 * k, y0: 0.01 * k, y1: -0.01 * k };
  }
}

/** Applies the shot's camera move to whatever it wraps. The move spans the whole shot. */
export const CameraMove: React.FC<{ camera: CameraSpec; children: React.ReactNode }> = ({ camera, children }) => {
  const { t } = useProgress();
  const v = viewFor(camera);
  const e = ease[camera.easing](t);
  const s = lerp(v.s0, v.s1, e);
  const x = lerp(v.x0, v.x1, e) * 100;
  const y = lerp(v.y0, v.y1, e) * 100;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transformOrigin: `${camera.focus.x * 100}% ${camera.focus.y * 100}%`,
        transform: `translate(${x}%, ${y}%) scale(${s})`,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
};
