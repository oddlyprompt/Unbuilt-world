import React from 'react';
import { colors, fonts } from '@uw/core';
import { Fill, clamp, seg, useProgress } from '../shared';

// Simplified outline of Chile as [latitude, longitude]. A stylised map, not a survey.
const COAST: [number, number][] = [[-18.35, -70.38], [-19.6, -70.2], [-21, -70.15], [-22.5, -70.25], [-23.65, -70.45], [-25.4, -70.5], [-26.4, -70.7], [-27.4, -71], [-28.5, -71.3], [-30, -71.4], [-31.6, -71.6], [-32.9, -71.6], [-33.6, -71.65], [-35, -72.2], [-36.6, -73.1], [-37.2, -73.6], [-38.5, -73.5], [-39.8, -73.45], [-41.5, -73.9], [-42.4, -74.1], [-44, -74], [-45.5, -75], [-47, -75.4], [-49, -75.5], [-51, -75.4], [-52.5, -74.7], [-54, -73.5], [-55, -70.5], [-55.95, -67.3]];
const BORDER: [number, number][] = [[-54.9, -66.6], [-54.8, -68.6], [-53.5, -68.6], [-52.5, -69.4], [-52.2, -68.4], [-51.6, -69.2], [-50, -72.1], [-48, -72.9], [-46, -72], [-44, -71.7], [-42, -71.8], [-40, -71.5], [-38, -71], [-36, -70.6], [-34, -70], [-32.5, -70], [-30.5, -69.9], [-28.5, -69], [-27, -68.5], [-25, -68.4], [-23, -67.9], [-22, -68.2], [-20.5, -68.5], [-19.2, -68.7], [-18.5, -69.5], [-17.6, -69.6]];

export interface City {
  name: string;
  lat: number;
  lon: number;
}
export const CITIES: City[] = [
  { name: 'ARICA', lat: -18.48, lon: -70.31 },
  { name: 'IQUIQUE', lat: -20.21, lon: -70.15 },
  { name: 'ANTOFAGASTA', lat: -23.65, lon: -70.4 },
  { name: 'LA SERENA', lat: -29.9, lon: -71.25 },
  { name: 'CONCEPCION', lat: -36.83, lon: -73.05 },
  { name: 'TEMUCO', lat: -38.74, lon: -72.6 },
  { name: 'PUERTO MONTT', lat: -41.47, lon: -72.94 },
  { name: 'PUNTA ARENAS', lat: -53.16, lon: -70.91 },
];
const SANTIAGO: City = { name: 'SANTIAGO', lat: -33.45, lon: -70.67 };

const X0 = 160;
const LEN = 1600;
const LAT_N = -17.4;
const LAT_S = -56.2;
const PX = LEN / (LAT_N - LAT_S);
const Y0 = 300;
const EW = 1.75; // east-west exaggeration so the narrow country is legible; the map says it is not to scale
const LON_W = -76;
/** North points right, so the long country lies across the frame; the Pacific coast is on top. */
const proj = (lat: number, lon: number): [number, number] => [X0 + (lat - LAT_S) * PX, Y0 + (lon - LON_W) * Math.cos((35 * Math.PI) / 180) * PX * EW];

const outline = [...COAST, ...BORDER].map(([a, b]) => proj(a, b).map((n) => n.toFixed(1)).join(',')).join(' ');

/** Messages from provincial telex stations travelling to Santiago along curved links. */
export const NetworkMap: React.FC<{ props: Record<string, unknown> }> = () => {
  const { sec } = useProgress();
  const [sx, sy] = proj(SANTIAGO.lat, SANTIAGO.lon);
  const draw = seg(sec, 0, 1.6);
  return (
    <Fill style={{ background: 'radial-gradient(ellipse at 50% 50%, #22313a, #0d1519 75%)' }}>
      <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        {/* graticule */}
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={i} x1={X0 + (i * LEN) / 8} x2={X0 + (i * LEN) / 8} y1={200} y2={880} stroke={colors.steel} strokeOpacity={0.28} />
        ))}
        {[320, 540, 760].map((y) => (
          <line key={y} x1={X0 - 40} x2={X0 + LEN + 40} y1={y + 40} y2={y + 40} stroke={colors.steel} strokeOpacity={0.2} />
        ))}
        <polygon points={outline} fill="#2d3e47" fillOpacity={0.75 * draw} stroke={colors.amber} strokeOpacity={draw} strokeWidth={2.5} strokeLinejoin="round" />
        {CITIES.map((c, i) => {
          const [x, y] = proj(c.lat, c.lon);
          const on = seg(sec, 0.8 + i * 0.1, 1.2 + i * 0.1);
          const cx = (x + sx) / 2;
          const cy = Math.min(y, sy) - 130 - Math.abs(x - sx) * 0.09;
          const period = 2.2;
          const phase = (sec - 1.4 - i * 0.28) / period;
          const p = phase - Math.floor(phase);
          const live = phase > 0;
          const q = 1 - p;
          const bx = q * q * x + 2 * q * p * cx + p * p * sx;
          const by = q * q * y + 2 * q * p * cy + p * p * sy;
          const arrive = live ? clamp(1 - (p - 0.92) / 0.08) : 1;
          return (
            <g key={c.name} opacity={on}>
              <path d={`M ${x} ${y} Q ${cx} ${cy} ${sx} ${sy}`} fill="none" stroke={colors.sage} strokeOpacity={0.45} strokeWidth={1.6} strokeDasharray="3 7" />
              <circle cx={x} cy={y} r={7} fill={colors.paper} />
              <text x={x} y={y + 40} textAnchor="middle" fontFamily={fonts.mono} fontSize={16} letterSpacing={2} fill={colors.bone}>
                {c.name}
              </text>
              {live && p < 0.99 && (
                <>
                  <circle cx={bx} cy={by} r={14} fill={colors.amber} opacity={0.22 * arrive} />
                  <circle cx={bx} cy={by} r={6} fill={colors.amber} opacity={arrive} />
                </>
              )}
            </g>
          );
        })}
        {/* Santiago, with a ripple for every arrival */}
        {CITIES.map((_, i) => {
          const phase = (sec - 1.4 - i * 0.28) / 2.2;
          if (phase < 1) return null; // a ripple follows every arrival
          const p = phase - Math.floor(phase);
          if (p > 0.35) return null;
          const k = p / 0.35;
          return <circle key={i} cx={sx} cy={sy} r={14 + k * 60} fill="none" stroke={colors.amber} strokeOpacity={0.5 * (1 - k)} strokeWidth={2} />;
        })}
        <circle cx={sx} cy={sy} r={13} fill={colors.amber} opacity={seg(sec, 0.6, 1.0)} />
        <circle cx={sx} cy={sy} r={5} fill={colors.ink} opacity={seg(sec, 0.6, 1.0)} />
        <text x={sx} y={sy + 46} textAnchor="middle" fontFamily={fonts.mono} fontSize={24} letterSpacing={5} fill={colors.amber} opacity={seg(sec, 0.8, 1.3)}>
          SANTIAGO
        </text>
        {/* compass + note */}
        <g transform="translate(1760 230)" opacity={seg(sec, 0.4, 1)}>
          <line x1={-60} y1={0} x2={0} y2={0} stroke={colors.bone} strokeWidth={2} />
          <polygon points="0,-8 18,0 0,8" fill={colors.bone} />
          <text x={-72} y={7} textAnchor="end" fontFamily={fonts.mono} fontSize={18} fill={colors.bone}>N</text>
        </g>
        <text x={160} y={930} fontFamily={fonts.mono} fontSize={18} letterSpacing={3} fill={colors.fog}>
          SCHEMATIC MAP · NOT TO SCALE · TELEX LINKS ILLUSTRATIVE
        </text>
      </svg>
    </Fill>
  );
};
