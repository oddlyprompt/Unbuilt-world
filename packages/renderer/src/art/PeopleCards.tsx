import React from 'react';
import { colors, fonts } from '@uw/core';
import { Fill, seg, useProgress } from '../shared';

export interface Person {
  name: string;
  role: string;
  years?: string;
}

const DEFAULT_PEOPLE: Person[] = [
  { name: 'Stafford Beer', role: 'British management cybernetician' },
  { name: 'Fernando Flores', role: 'Chilean engineer and government official' },
  { name: 'Gui Bonsiepe', role: 'Industrial designer' },
  { name: 'Salvador Allende', role: 'President of Chile, 1970–1973' },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}

/** Name plates. Portraits are drawn placeholders until licensed photographs are assigned. */
export const PeopleCards: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const people = (Array.isArray(props.people) ? (props.people as Person[]) : DEFAULT_PEOPLE).slice(0, 5);
  const gap = 28;
  const cw = Math.min(380, (1920 - 192 - gap * (people.length - 1)) / people.length);
  const start = (1920 - (cw * people.length + gap * (people.length - 1))) / 2;
  const stagger = typeof props.stagger === 'number' ? props.stagger : 0.55;
  return (
    <Fill style={{ background: 'radial-gradient(ellipse at 50% 40%, #26343d, #0e151a 78%)' }}>
      <div style={{ position: 'absolute', left: 96, top: 90, fontFamily: fonts.mono, fontSize: 22, letterSpacing: '0.28em', color: colors.amber, opacity: seg(sec, 0, 0.5) }}>THE PEOPLE BEHIND IT</div>
      {people.map((p, i) => {
        const a = seg(sec, 0.35 + i * stagger, 0.95 + i * stagger);
        return (
          <div key={p.name} style={{ position: 'absolute', left: start + i * (cw + gap), top: 250, width: cw, opacity: a, transform: `translateY(${(1 - a) * 28}px)` }}>
            <div style={{ position: 'relative', width: cw, height: cw * 1.15, background: 'linear-gradient(160deg,#33444e,#1a252c)', border: `1px solid ${colors.steel}`, overflow: 'hidden' }}>
              <svg viewBox="0 0 100 115" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                <circle cx={50} cy={44} r={19} fill="#4a5c66" />
                <path d="M12 115 C14 82 32 70 50 70 C68 70 86 82 88 115Z" fill="#4a5c66" />
              </svg>
              <div style={{ position: 'absolute', left: 14, top: 12, fontFamily: fonts.display, fontWeight: 600, fontSize: 40, color: colors.amber, opacity: 0.85 }}>{initials(p.name)}</div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '5px 12px', fontFamily: fonts.mono, fontSize: 12, letterSpacing: '0.12em', color: colors.fog, background: 'rgba(8,13,16,.7)' }}>PORTRAIT PLACEHOLDER</div>
            </div>
            <div style={{ marginTop: 18, paddingLeft: 14, borderLeft: `3px solid ${colors.amber}` }}>
              <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 42, lineHeight: 1.05, color: colors.paper }}>{p.name}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 17, letterSpacing: '0.06em', color: colors.sage, marginTop: 8, textTransform: 'uppercase', lineHeight: 1.35 }}>{p.role}</div>
            </div>
          </div>
        );
      })}
    </Fill>
  );
};
