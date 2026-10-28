import React from 'react';
import { colors } from '@uw/core';
import { Fill, bool, clamp, lerp, num, rand, seg, str, useProgress } from '../shared';
import { SlidePanel } from './Panels';

/**
 * An illustrative 3D model of an operations room: seven swivel chairs in a ring, screens on the walls.
 * Original artwork; it is NOT a record of the real room and is always shown with a disclosure.
 * Real perspective (CSS 3D) lets the camera dolly through the room instead of just zooming a picture.
 */

const W = 1800; // room width
const H = 800; // height
const D = 1500; // depth
const FRONT = 1500; // the room continues this far toward the camera so a dolly never leaves it
const FLOOR = 330; // y of the floor, relative to the screen centre
const RING = { x: 0, z: -820, r: 330 };
const RING_RX = RING.r * 1.25;
/** Local y of the ring centre inside the floor plane (top of the plane is the back wall). */
const FLOOR_RING_Y = D + RING.z;

/** One chair, drawn flat and placed in 3D. A fibreglass-style swivel chair with armrest buttons. */
export const ChairSprite: React.FC<{ glow?: number; width?: number }> = ({ glow = 0.4, width = 200 }) => (
  <svg viewBox="0 0 200 330" width={width} height={(width * 330) / 200} style={{ overflow: 'visible' }}>
    <defs>
      <linearGradient id="shell" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#9aa7a8" />
        <stop offset="0.45" stopColor={colors.paper} />
        <stop offset="1" stopColor="#7d8b8c" />
      </linearGradient>
      <linearGradient id="seat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3b4a53" />
        <stop offset="1" stopColor="#1e2a31" />
      </linearGradient>
      <radialGradient id="knob" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#ffe3b8" />
        <stop offset="1" stopColor={colors.amber} />
      </radialGradient>
    </defs>
    <ellipse cx={100} cy={322} rx={82} ry={11} fill="#000" opacity={0.45} />
    {/* base and stem */}
    <ellipse cx={100} cy={312} rx={52} ry={8} fill="#aab4b4" />
    <path d="M86 312 C90 280 92 250 94 222 L106 222 C108 250 110 280 114 312Z" fill="url(#shell)" />
    {/* back shell */}
    <path d="M32 220 C18 150 28 70 70 30 C100 6 130 6 150 30 C176 70 184 150 168 220Z" fill="url(#shell)" />
    <path d="M52 205 C44 150 52 86 82 54 C100 38 118 38 128 54 C150 86 156 150 148 205Z" fill="url(#seat)" opacity={0.92} />
    {/* seat */}
    <ellipse cx={100} cy={226} rx={78} ry={20} fill="url(#shell)" />
    <ellipse cx={100} cy={221} rx={64} ry={14} fill="url(#seat)" />
    {/* armrests with large buttons */}
    <path d="M14 196 L56 204 L58 222 L14 214Z" fill="url(#shell)" />
    <path d="M186 196 L144 204 L142 222 L186 214Z" fill="url(#shell)" />
    {[24, 38, 52].map((x, i) => (
      <circle key={`l${i}`} cx={x} cy={200 + i * 2.5} r={5} fill="url(#knob)" opacity={0.6 + glow * 0.4} />
    ))}
    {[176, 162, 148].map((x, i) => (
      <circle key={`r${i}`} cx={x} cy={200 + i * 2.5} r={5} fill="url(#knob)" opacity={0.6 + glow * 0.4} />
    ))}
  </svg>
);

const Plane: React.FC<{ w: number; h: number; cx: number; cy: number; cz: number; rx?: number; ry?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ w, h, cx, cy, cz, rx = 0, ry = 0, style, children }) => (
  <div style={{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h, transform: `translate3d(${cx}px, ${cy}px, ${cz}px) rotateY(${ry}deg) rotateX(${rx}deg)`, backfaceVisibility: 'visible', ...style }}>{children}</div>
);

interface Props {
  props: Record<string, unknown>;
}

export const OpsRoom: React.FC<Props> = ({ props }) => {
  const { sec, t, duration, fps } = useProgress();
  const mode = str(props, 'mode', 'wide'); // reveal | wide | dark
  const dollyFrom = num(props, 'dollyFrom', 0);
  const dollyTo = num(props, 'dollyTo', 260);
  const yawFrom = num(props, 'yawFrom', 0);
  const yawTo = num(props, 'yawTo', 0);
  // Degrees of downward tilt, and rotation about the ring of chairs (an orbit) when yaw is non-zero.
  const pitchFrom = num(props, 'pitchFrom', 0);
  const pitchTo = num(props, 'pitchTo', 0);
  const heightFrom = num(props, 'heightFrom', 0);
  const heightTo = num(props, 'heightTo', 0);
  const darkFrom = num(props, 'darkFrom', 0.2); // fraction of the shot where the lights begin to fail
  const total = duration / fps;

  const e = t * t * (3 - 2 * t);
  const camZ = lerp(dollyFrom, dollyTo, e);
  const yaw = lerp(yawFrom, yawTo, e);
  const pitch = lerp(pitchFrom, pitchTo, e);
  const camY = lerp(heightFrom, heightTo, e);

  // Light level and per-panel power.
  let ambient = 1;
  let panelsOn = [1, 1, 1, 1, 1, 1, 1];
  if (mode === 'reveal') {
    ambient = lerp(0.2, 1, seg(sec, 0.1, Math.min(total, 5)));
    panelsOn = [0, 1, 2, 3, 4, 5, 6].map((i) => seg(sec, 0.8 + i * 0.35, 1.5 + i * 0.35, (x) => x));
  } else if (mode === 'dark') {
    const f = clamp((t - darkFrom) / (1 - darkFrom));
    ambient = lerp(1, 0.05, f * f);
    panelsOn = [0, 1, 2, 3, 4, 5, 6].map((i) => 1 - seg(f, 0.15 + i * 0.1, 0.3 + i * 0.1, (x) => x));
  }
  // Optional "unfinished" state: only some screens powered, only some chairs installed.
  const panelsCount = num(props, 'panels', 7);
  if (mode !== 'dark') panelsOn = panelsOn.map((v, i) => (i < panelsCount ? v : 0.05));
  const chairCount = num(props, 'chairs', 7);
  const grey = mode === 'dark' ? lerp(1, 0.15, clamp((t - darkFrom) / (1 - darkFrom))) : 1;

  const wall = (shade: number) => `linear-gradient(${shade > 0 ? 180 : 0}deg, #2e3f4a 0%, #1c2a33 70%, #141f26 100%)`;
  const chairs = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + Math.PI / 7;
    return { x: RING.x + Math.cos(a) * RING_RX, z: RING.z + Math.sin(a) * RING.r, a, i };
  }).sort((p, q) => p.z - q.z);

  const panel = (key: string, i: number, w: number, h: number, variant: number, tint: string, extra?: React.CSSProperties) => (
    <div key={key} style={{ position: 'absolute', width: w, height: h, opacity: panelsOn[i], boxShadow: `0 0 ${60 * panelsOn[i]!}px ${colors.amber}33`, ...extra }}>
      <SlidePanel w={w} h={h} variant={variant} sec={sec} tint={tint} phase={i * 0.9} />
    </div>
  );

  const buttonGlow = mode === 'dark' ? 0 : 0.5 + 0.5 * Math.sin(sec * 3);

  return (
    <Fill style={{ background: '#0b1115' }}>
      <div style={{ position: 'absolute', inset: 0, filter: `brightness(${0.1 + 0.9 * ambient}) saturate(${grey})` }}>
        <div style={{ position: 'absolute', inset: 0, perspective: 1100, perspectiveOrigin: '50% 44%', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transformStyle: 'preserve-3d', transformOrigin: `0px ${FLOOR - 120}px ${RING.z}px`, transform: `translate3d(0, ${camY}px, ${camZ}px) rotateX(${pitch}deg) rotateY(${yaw}deg)` }}>
            {/* shell */}
            <Plane w={W} h={H} cx={0} cy={FLOOR - H / 2} cz={-D} style={{ background: wall(1), borderBottom: `4px solid ${colors.steel}` }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 60%, rgba(212,161,106,.22), transparent 66%)' }} />
              {panel('c', 0, 760, 380, 0, colors.amber, { left: (W - 760) / 2, top: 150 })}
              {panel('l', 1, 300, 230, 1, colors.sage, { left: 140, top: 190 })}
              {panel('r', 2, 300, 230, 3, colors.sage, { left: W - 140 - 300, top: 190 })}
              <div style={{ position: 'absolute', left: (W - 760) / 2, top: 560, width: 760, height: 10, background: colors.steel, opacity: 0.6 }} />
            </Plane>
            <Plane w={D + FRONT} h={H} cx={-W / 2} cy={FLOOR - H / 2} cz={(FRONT - D) / 2} ry={90} style={{ background: wall(1) }}>
              {panel('l1', 3, 360, 250, 2, colors.amber, { left: FRONT + 160, top: 210 })}
              {panel('l2', 4, 360, 250, 0, colors.sage, { left: FRONT + 640, top: 210 })}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 70, height: 8, background: `linear-gradient(90deg, transparent, ${colors.amber}88, transparent)`, opacity: ambient }} />
            </Plane>
            <Plane w={D + FRONT} h={H} cx={W / 2} cy={FLOOR - H / 2} cz={(FRONT - D) / 2} ry={-90} style={{ background: wall(1) }}>
              {panel('r1', 5, 360, 250, 1, colors.amber, { left: D + FRONT - 160 - 360, top: 210 })}
              {panel('r2', 6, 360, 250, 3, colors.sage, { left: D + FRONT - 640 - 360, top: 210 })}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 70, height: 8, background: `linear-gradient(90deg, transparent, ${colors.amber}88, transparent)`, opacity: ambient }} />
            </Plane>
            <Plane w={W} h={D + FRONT} cx={0} cy={FLOOR} cz={(FRONT - D) / 2} rx={90} style={{ background: 'linear-gradient(180deg, #111a1f, #1a262d 60%, #26343d)' }}>
              <div style={{ position: 'absolute', left: W / 2 + RING.x - 620, top: FLOOR_RING_Y - 500, width: 1240, height: 1000, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(212,161,106,.26), rgba(212,161,106,.05) 70%, transparent)' }} />
              <div style={{ position: 'absolute', left: W / 2 + RING.x - RING_RX - 20, top: FLOOR_RING_Y - RING.r - 20, width: RING_RX * 2 + 40, height: RING.r * 2 + 40, borderRadius: '50%', border: `3px solid ${colors.amber}77` }} />
              <div style={{ position: 'absolute', left: W / 2 + RING.x - RING_RX + 70, top: FLOOR_RING_Y - RING.r + 70, width: RING_RX * 2 - 140, height: RING.r * 2 - 140, borderRadius: '50%', border: `1px solid ${colors.sage}77` }} />
            </Plane>
            <Plane w={W} h={D + FRONT} cx={0} cy={FLOOR - H} cz={(FRONT - D) / 2} rx={-90} style={{ background: '#0d151a' }}>
              {[-500, -170, 170, 500].map((x) => (
                <div key={x} style={{ position: 'absolute', left: W / 2 + x - 16, top: 160, width: 32, height: D + FRONT - 320, background: `linear-gradient(180deg, transparent, ${colors.bone}88 18%, ${colors.bone}88 82%, transparent)`, opacity: ambient * 0.38 }} />
              ))}
            </Plane>
            {/* chairs */}
            {chairs.filter((c) => c.i < chairCount).map((c) => (
              <Plane key={c.i} w={200} h={330} cx={c.x} cy={FLOOR - 165} cz={c.z} ry={clamp(-c.x / 14, -38, 38)} style={{ opacity: bool(props, 'hideChairs', false) ? 0 : 1 }}>
                <ChairSprite glow={buttonGlow} />
              </Plane>
            ))}
          </div>
        </div>
      </div>
      {mode === 'dark' && (
        <Fill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, #000 100%)', opacity: clamp((t - darkFrom) / (1 - darkFrom)) * 0.9 }} />
      )}
    </Fill>
  );
};
void rand;
