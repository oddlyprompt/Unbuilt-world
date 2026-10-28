import React from 'react';
import { Composition } from 'remotion';
import { Episode } from '../Episode';
import type { EpisodeProps } from '../types';

const defaults: EpisodeProps = { fps: 30, width: 1920, height: 1080, totalFrames: 90, shots: [], captions: [], disclosures: true, channel: 'The Unbuilt World' };

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Episode"
    component={Episode as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={defaults.totalFrames}
    fps={defaults.fps}
    width={defaults.width}
    height={defaults.height}
    defaultProps={defaults as unknown as Record<string, unknown>}
    calculateMetadata={({ props }: { props: Record<string, unknown> }) => {
      const p = props as unknown as EpisodeProps;
      return { durationInFrames: Math.max(1, p.totalFrames), fps: p.fps, width: p.width, height: p.height };
    }}
  />
);
