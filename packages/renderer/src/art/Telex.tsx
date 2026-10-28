import React from 'react';
import { colors, fonts } from '@uw/core';
import { Fill, rand, seg, str, useProgress } from '../shared';

const DEFAULT_LINES = [
  'DE: PLANTA 14 - TEXTIL',
  'PARA: SANTIAGO - CENTRAL',
  'PRODUCCION DEL DIA: 112 UNIDADES',
  'INSUMOS: BAJOS',
  'ENERGIA: NORMAL',
  'FIN DE MENSAJE',
];

/** An illustrated teleprinter typing an invented, clearly illustrative message. */
export const Telex: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const lines = (typeof props.lines === 'string' ? String(props.lines).split('\n') : DEFAULT_LINES).slice(0, 8);
  const speed = 22; // characters per second
  const typed = Math.max(0, (sec - 0.5) * speed);
  let remaining = typed;
  const shown = lines.map((l) => {
    const n = Math.max(0, Math.min(l.length, Math.floor(remaining)));
    remaining -= l.length + 4;
    return l.slice(0, n);
  });
  const printing = typed > 0 && typed < lines.reduce((a, l) => a + l.length + 4, 0);
  const shake = printing ? (rand(Math.floor(sec * 30)) - 0.5) * 1.6 : 0;
  const feed = Math.min(shown.filter(Boolean).length, 6) * 30;
  const label = str(props, 'label', 'ILLUSTRATIVE MESSAGE · NOT A RECORDED TELEX');
  return (
    <Fill style={{ background: 'radial-gradient(ellipse at 38% 55%, #2c3b44, #0e151a 72%)' }}>
      <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="tx-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8d9a98" />
            <stop offset="1" stopColor="#4e5d62" />
          </linearGradient>
          <linearGradient id="tx-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b8c1bd" />
            <stop offset="1" stopColor="#7e8c8a" />
          </linearGradient>
        </defs>
        <ellipse cx={760} cy={900} rx={560} ry={40} fill="#000" opacity={0.5} />
        <g transform={`translate(${shake} 0)`}>
          {/* paper */}
          <g>
            <rect x={540} y={120 + (180 - feed)} width={440} height={430 + feed} fill={colors.paper} />
            <rect x={540} y={120 + (180 - feed)} width={440} height={430 + feed} fill="#000" opacity={0.04} />
            {shown.map((l, i) => (
              <text key={i} x={566} y={190 + (180 - feed) + i * 34 - 0} fontFamily={fonts.mono} fontSize={23} fill="#1c262c">
                {l}
              </text>
            ))}
          </g>
          {/* cabinet */}
          <path d="M420 560 L1100 560 L1180 880 L340 880Z" fill="url(#tx-body)" />
          <path d="M420 560 L1100 560 L1120 640 L400 640Z" fill="url(#tx-top)" />
          <rect x={470} y={520} width={540} height={44} rx={8} fill="#5f6e72" />
          <rect x={496} y={500} width={488} height={30} rx={6} fill="#2e3a40" />
          {/* keyboard */}
          {Array.from({ length: 4 }).map((_, r) =>
            Array.from({ length: 12 - r }).map((__, c) => (
              <rect key={`${r}-${c}`} x={470 + r * 18 + c * 44} y={690 + r * 36} width={34} height={26} rx={5} fill={(r + c) % 7 === 0 ? colors.amber : '#d6cfbf'} opacity={0.92} />
            )),
          )}
          <rect x={320} y={880} width={880} height={26} rx={6} fill="#2a363c" />
          <circle cx={1070} cy={600} r={12} fill={printing ? colors.amber : '#394850'} />
          <circle cx={1040} cy={600} r={7} fill={colors.sage} opacity={0.8} />
        </g>
      </svg>
      <Fill style={{ left: 1260, top: 260, width: 520, right: 'auto', bottom: 'auto', height: 300 }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 24, letterSpacing: '0.2em', color: colors.amber, opacity: seg(sec, 0.3, 0.9) }}>TELEX</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 16, letterSpacing: '0.1em', color: colors.fog, marginTop: 14, opacity: seg(sec, 0.8, 1.4) }}>{label}</div>
      </Fill>
    </Fill>
  );
};
