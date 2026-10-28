import React from 'react';
import { colors, brand, fonts } from '@uw/core';
import { Fill, lerp, seg, str, useProgress, num } from '../shared';

/** The title card that closes the cold open. A thin line draws, then the name settles into place. */
export const TitleReveal: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec, duration, fps } = useProgress();
  const kicker = str(props, 'kicker', brand.name);
  const title = str(props, 'title', 'Project Cybersyn');
  const subtitle = str(props, 'subtitle', 'Chile · 1971–1973');
  const line = seg(sec, 0.3, 1.5);
  const t1 = seg(sec, 0.9, 2.2);
  const t2 = seg(sec, 1.8, 2.8);
  const track = lerp(0.35, 0.02, t1);
  const fadeOut = num(props, 'fadeOutSec', 0);
  const total = duration / fps;
  const out = fadeOut > 0 ? 1 - seg(sec, total - fadeOut, total, (x) => x) : 1;
  return (
    <Fill style={{ background: 'radial-gradient(ellipse at 50% 55%, #1f2c34, #0b1115 75%)', opacity: out }}>
      <Fill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 24, letterSpacing: '0.42em', color: colors.amber, opacity: seg(sec, 0.2, 0.9), textTransform: 'uppercase' }}>{kicker}</div>
        <div style={{ width: 760 * line, height: 2, background: colors.amber, margin: '34px 0 40px', opacity: 0.9 }} />
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 168, lineHeight: 1, color: colors.paper, letterSpacing: `${track}em`, opacity: t1, transform: `translateY(${(1 - t1) * 18}px)`, textShadow: '0 6px 40px rgba(0,0,0,.5)' }}>{title}</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 30, letterSpacing: '0.3em', color: colors.sage, marginTop: 38, opacity: t2, textTransform: 'uppercase' }}>{subtitle}</div>
      </Fill>
    </Fill>
  );
};

export const OpeningTitle: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const a = seg(sec, 0.3, 1.6);
  return (
    <Fill style={{ background: colors.midnight }}>
      <Fill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 120, color: colors.paper, opacity: a, letterSpacing: '0.04em' }}>{brand.name}</div>
        <div style={{ width: 320 * a, height: 2, background: colors.amber, margin: '26px 0' }} />
        <div style={{ fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 500, fontSize: 40, color: colors.bone, opacity: seg(sec, 1, 2) }}>{str(props, 'tagline', brand.tagline)}</div>
      </Fill>
    </Fill>
  );
};

export const ChapterTitle: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const n = num(props, 'number', 1);
  return (
    <Fill style={{ background: 'linear-gradient(120deg,#19232a,#101920)' }}>
      <Fill style={{ left: 160, display: 'flex', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 26, letterSpacing: '0.4em', color: colors.amber, opacity: seg(sec, 0.1, 0.6) }}>CHAPTER {String(n).padStart(2, '0')}</div>
        <div style={{ width: 120 * seg(sec, 0.3, 1.0), height: 3, background: colors.amber, margin: '28px 0' }} />
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 110, lineHeight: 1.04, color: colors.paper, maxWidth: 1400, opacity: seg(sec, 0.6, 1.4), transform: `translateX(${(1 - seg(sec, 0.6, 1.4)) * -24}px)` }}>{str(props, 'title', 'Untitled')}</div>
      </Fill>
    </Fill>
  );
};

/** A quotation card. A quotation without a stated source is shown with a visible warning, never as fact. */
export const Quotation: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const source = str(props, 'source', '');
  return (
    <Fill style={{ background: 'radial-gradient(ellipse at 40% 45%, #26343d, #0e151a 78%)' }}>
      <Fill style={{ left: 220, right: 220, display: 'flex', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontFamily: fonts.display, fontSize: 220, lineHeight: 0.6, color: colors.amber, opacity: 0.8 }}>“</div>
        <div style={{ fontFamily: fonts.display, fontStyle: 'italic', fontWeight: 500, fontSize: 70, lineHeight: 1.18, color: colors.paper, opacity: seg(sec, 0.3, 1.4) }}>{str(props, 'text', '')}</div>
        <div style={{ marginTop: 40, fontFamily: fonts.mono, fontSize: 24, letterSpacing: '0.14em', color: source ? colors.sage : colors.danger, textTransform: 'uppercase', opacity: seg(sec, 1.2, 2) }}>
          {source ? `— ${str(props, 'speaker', 'Unattributed')} · ${source}` : 'UNSOURCED QUOTATION · VERIFY BEFORE PUBLISHING'}
        </div>
      </Fill>
    </Fill>
  );
};

export const DataCard: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const rows = (Array.isArray(props.rows) ? (props.rows as { label: string; value: string }[]) : []).slice(0, 6);
  return (
    <Fill style={{ background: 'linear-gradient(135deg,#19232a,#0f181e)' }}>
      <Fill style={{ left: 200, right: 200, display: 'flex', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 24, letterSpacing: '0.3em', color: colors.amber, marginBottom: 20 }}>{str(props, 'heading', 'DATA')}</div>
        {rows.map((r, i) => {
          const a = seg(sec, 0.3 + i * 0.25, 0.8 + i * 0.25);
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${colors.steel}`, padding: '16px 0', opacity: a, transform: `translateX(${(1 - a) * 20}px)` }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 28, color: colors.bone, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{r.label}</span>
              <span style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 54, color: colors.paper }}>{r.value}</span>
            </div>
          );
        })}
      </Fill>
    </Fill>
  );
};

export const TimelineCard: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const events = (Array.isArray(props.events) ? (props.events as { date: string; label: string }[]) : []).slice(0, 7);
  const draw = seg(sec, 0.2, 1.4);
  const x0 = 200;
  const x1 = 1720;
  return (
    <Fill style={{ background: 'linear-gradient(135deg,#19232a,#0f181e)' }}>
      <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <line x1={x0} x2={x0 + (x1 - x0) * draw} y1={560} y2={560} stroke={colors.amber} strokeWidth={3} />
        {events.map((e, i) => {
          const x = x0 + ((x1 - x0) * i) / Math.max(1, events.length - 1);
          const a = seg(sec, 0.6 + i * 0.35, 1.1 + i * 0.35);
          const up = i % 2 === 0;
          return (
            <g key={i} opacity={a}>
              <circle cx={x} cy={560} r={11} fill={colors.paper} />
              <line x1={x} x2={x} y1={560} y2={up ? 470 : 650} stroke={colors.steel} />
              <text x={x} y={up ? 440 : 700} textAnchor="middle" fontFamily={fonts.display} fontWeight={600} fontSize={46} fill={colors.paper}>{e.date}</text>
              <text x={x} y={up ? 410 : 736} textAnchor="middle" fontFamily={fonts.mono} fontSize={17} letterSpacing={2} fill={colors.sage}>{e.label.toUpperCase()}</text>
            </g>
          );
        })}
      </svg>
    </Fill>
  );
};

export const BeforeAfter: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const p = seg(sec, 0.6, 2.4);
  return (
    <Fill style={{ background: colors.deep }}>
      <Fill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1d2b33' }}>
        <div style={{ fontFamily: fonts.display, fontSize: 90, color: colors.paper }}>{str(props, 'before', 'Before')}</div>
      </Fill>
      <Fill style={{ clipPath: `inset(0 0 0 ${(1 - p) * 100}%)`, background: '#26343d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: fonts.display, fontSize: 90, color: colors.amber }}>{str(props, 'after', 'After')}</div>
      </Fill>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(1 - p) * 100}%`, width: 3, background: colors.amber }} />
    </Fill>
  );
};

export const Closing: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  return (
    <Fill style={{ background: colors.midnight }}>
      <Fill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 100, color: colors.paper, opacity: seg(sec, 0.2, 1.2) }}>{brand.name}</div>
        <div style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 38, color: colors.amber, marginTop: 20, opacity: seg(sec, 0.9, 1.8) }}>{str(props, 'tagline', brand.tagline)}</div>
      </Fill>
    </Fill>
  );
};

export const Attribution: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
  const { sec } = useProgress();
  const items = (Array.isArray(props.items) ? (props.items as string[]) : []).slice(0, 12);
  return (
    <Fill style={{ background: '#0e151a' }}>
      <Fill style={{ left: 160, right: 160, display: 'flex', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 24, letterSpacing: '0.3em', color: colors.amber, marginBottom: 30 }}>SOURCES & CREDITS</div>
        {items.map((it, i) => (
          <div key={i} style={{ fontFamily: fonts.body, fontSize: 28, color: colors.bone, padding: '8px 0', opacity: seg(sec, 0.2 + i * 0.12, 0.6 + i * 0.12) }}>{it}</div>
        ))}
      </Fill>
    </Fill>
  );
};
