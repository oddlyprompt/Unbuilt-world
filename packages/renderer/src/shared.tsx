import React, { createContext, useContext } from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderShot } from './types';

export interface ShotCtx {
  shot: RenderShot;
  /** Frames this shot is on screen as its own (before the next shot's transition tail). */
  duration: number;
}
export const ShotContext = createContext<ShotCtx | null>(null);
export const useShot = (): ShotCtx => {
  const c = useContext(ShotContext);
  if (!c) throw new Error('useShot outside a shot');
  return c;
};

/** Progress through the shot, 0..1, and the raw frame. */
export function useProgress() {
  const frame = useCurrentFrame();
  const { duration } = useShot();
  const { fps } = useVideoConfig();
  return { frame, fps, duration, t: Math.min(1, Math.max(0, frame / Math.max(1, duration - 1))), sec: frame / fps };
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = {
  inOutSine: Easing.inOut(Easing.sin),
  outCubic: Easing.out(Easing.cubic),
  inOutCubic: Easing.inOut(Easing.cubic),
  linear: (x: number) => x,
};

/** Map a time window (seconds into the shot) to 0..1 with easing. */
export function seg(sec: number, from: number, to: number, e: (x: number) => number = ease.inOutSine) {
  return interpolate(sec, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e });
}

/** Deterministic pseudo-random in [0,1) from an integer seed (no Math.random: renders must repeat). */
export function rand(seed: number): number {
  let x = (seed | 0) + 0x6d2b79f5;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

export function str(props: Record<string, unknown>, key: string, fallback: string): string {
  const v = props[key];
  return typeof v === 'string' ? v : fallback;
}
export function num(props: Record<string, unknown>, key: string, fallback: number): number {
  const v = props[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
export function bool(props: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = props[key];
  return typeof v === 'boolean' ? v : fallback;
}

export const Fill: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: 'absolute', inset: 0, ...style }}>{children}</div>
);
