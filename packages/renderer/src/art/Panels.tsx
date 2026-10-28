import React from 'react';
import { colors, fonts } from '@uw/core';
import { rand } from '../shared';

/**
 * Content for the room's wall screens. The real displays were slides projected from behind, so the
 * art is deliberately flat: charts, dials and diagrams that change in discrete steps.
 */

export const PANEL_LABELS = ['PRODUCCION', 'ENERGIA', 'INVENTARIO', 'RED DE TELEX', 'ALERTAS', 'TENDENCIA'];

interface P {
  w: number;
  h: number;
  variant: number;
  sec: number;
  tint?: string;
  label?: string;
}

const Frame: React.FC<{ w: number; h: number; label: string; tint: string; children: React.ReactNode }> = ({ w, h, label, tint, children }) => (
  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
    <rect width={w} height={h} fill="#0d1519" />
    <rect x={4} y={4} width={w - 8} height={h - 8} fill="none" stroke={tint} strokeOpacity={0.6} strokeWidth={2} />
    <text x={18} y={30} fontFamily={fonts.mono} fontSize={Math.max(14, w * 0.045)} letterSpacing={3} fill={tint} fillOpacity={0.9}>
      {label}
    </text>
    <line x1={18} y1={42} x2={w - 18} y2={42} stroke={tint} strokeOpacity={0.35} />
    {children}
  </svg>
);

export const PanelArt: React.FC<P> = ({ w, h, variant, sec, tint = colors.amber, label }) => {
  const v = ((variant % 4) + 4) % 4;
  const lab = label ?? PANEL_LABELS[variant % PANEL_LABELS.length]!;
  const top = 58;
  const ph = h - top - 20;
  const px = 24;
  const pw = w - px * 2;

  if (v === 0) {
    // Line chart with a scanning cursor.
    const n = 24;
    const pts = Array.from({ length: n }, (_, i) => {
      const y = 0.5 + 0.28 * Math.sin(i * 0.5 + variant) + (rand(i + variant * 31) - 0.5) * 0.18;
      return [px + (i / (n - 1)) * pw, top + (1 - y) * ph] as const;
    });
    const cursor = ((sec * 0.35) % 1) * pw + px;
    return (
      <Frame w={w} h={h} label={lab} tint={tint}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={px} x2={px + pw} y1={top + g * ph} y2={top + g * ph} stroke={colors.steel} strokeOpacity={0.6} strokeDasharray="4 6" />
        ))}
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={tint} strokeWidth={3} />
        <line x1={cursor} x2={cursor} y1={top} y2={top + ph} stroke={colors.paper} strokeOpacity={0.5} />
      </Frame>
    );
  }
  if (v === 1) {
    const n = 9;
    const bw = pw / n;
    return (
      <Frame w={w} h={h} label={lab} tint={tint}>
        {Array.from({ length: n }, (_, i) => {
          const val = 0.25 + rand(i * 5 + variant * 11) * 0.7;
          const bh = val * ph;
          return <rect key={i} x={px + i * bw + 6} y={top + ph - bh} width={bw - 12} height={bh} fill={i % 4 === 3 ? colors.sage : tint} fillOpacity={0.85} />;
        })}
        <line x1={px} x2={px + pw} y1={top + ph} y2={top + ph} stroke={colors.paper} strokeOpacity={0.5} />
      </Frame>
    );
  }
  if (v === 2) {
    const r = Math.min(pw / 4, ph / 2.2);
    return (
      <Frame w={w} h={h} label={lab} tint={tint}>
        {[0, 1, 2].map((i) => {
          const cx = px + pw * (0.17 + i * 0.33);
          const cy = top + ph * 0.55;
          const val = 0.3 + rand(i * 9 + variant) * 0.6;
          const a = Math.PI * (1 + val);
          return (
            <g key={i}>
              <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={colors.steel} strokeWidth={8} />
              <line x1={cx} y1={cy} x2={cx + Math.cos(a) * r * 0.92} y2={cy + Math.sin(a) * r * 0.92} stroke={tint} strokeWidth={4} strokeLinecap="round" />
              <circle cx={cx} cy={cy} r={6} fill={colors.paper} />
            </g>
          );
        })}
      </Frame>
    );
  }
  // Network diagram.
  const nodes = Array.from({ length: 9 }, (_, i) => [px + 30 + rand(i * 3 + variant) * (pw - 60), top + 20 + rand(i * 7 + variant) * (ph - 40)] as const);
  return (
    <Frame w={w} h={h} label={lab} tint={tint}>
      {nodes.map((a, i) => {
        const b = nodes[(i * 2 + 3) % nodes.length]!;
        return <line key={`l${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={tint} strokeOpacity={0.5} />;
      })}
      {nodes.map((a, i) => (
        <circle key={i} cx={a[0]} cy={a[1]} r={i === 0 ? 10 : 6} fill={i === 0 ? colors.paper : tint} />
      ))}
    </Frame>
  );
};

/** A panel that changes slide in steps, with a brief projector flash between slides. */
export const SlidePanel: React.FC<P & { period?: number; phase?: number }> = ({ period = 3.2, phase = 0, ...p }) => {
  const s = p.sec + phase;
  const idx = Math.floor(s / period);
  const into = s - idx * period;
  const flash = into < 0.12 ? 1 - into / 0.12 : 0;
  return (
    <div style={{ position: 'relative', width: p.w, height: p.h }}>
      <PanelArt {...p} variant={p.variant + idx} />
      <div style={{ position: 'absolute', inset: 0, background: colors.paper, opacity: flash * 0.55 }} />
    </div>
  );
};
