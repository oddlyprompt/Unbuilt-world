import React from 'react';
import { AbsoluteFill } from 'remotion';
import { colors } from '@uw/core';
import { ArchivalPhoto, MediaLayer, Slate } from './Media';
import { ChairCloseup } from './art/ChairCloseup';
import { DisplayWall } from './art/DisplayWall';
import { NetworkMap } from './art/NetworkMap';
import { OpsRoom } from './art/OpsRoom';
import { PeopleCards } from './art/PeopleCards';
import { Telex } from './art/Telex';
import { Attribution, BeforeAfter, ChapterTitle, Closing, DataCard, OpeningTitle, Quotation, TimelineCard, TitleReveal } from './art/Typography';
import type { RenderShot } from './types';

/**
 * Chooses what a shot shows. An assigned asset always wins over built-in artwork (that is how a
 * placeholder is swapped for the real thing without touching the storyboard).
 */
export const Visual: React.FC<{ shot: RenderShot }> = ({ shot }) => {
  const { component: c, props, asset } = shot;

  if (shot.assetMissing) {
    return <Slate title="Asset file missing" detail={`Shot "${shot.id}" refers to asset "${shot.assetMissing}", which is not in the library or its file is gone. Replace it in the Assets tab.`} tag="MISSING ASSET" backdrop={false} />;
  }
  if (c === 'archival_photo') return <ArchivalPhoto shot={shot} />;
  if (asset && c !== 'title_reveal' && c !== 'opening_title' && c !== 'closing') {
    return (
      <AbsoluteFill style={{ background: colors.ink }}>
        <MediaLayer asset={asset} />
      </AbsoluteFill>
    );
  }
  switch (c) {
    case 'ops_room':
      return <OpsRoom props={props} />;
    case 'tonal_shift':
      return <OpsRoom props={{ mode: 'dark', ...props }} />;
    case 'chair_closeup':
      return <ChairCloseup props={props} />;
    case 'display_wall':
      return <DisplayWall props={props} />;
    case 'telex':
      return <Telex props={props} />;
    case 'network_map':
      return <NetworkMap props={props} />;
    case 'people_cards':
      return <PeopleCards props={props} />;
    case 'title_reveal':
      return <TitleReveal props={props} />;
    case 'opening_title':
      return <OpeningTitle props={props} />;
    case 'chapter_title':
      return <ChapterTitle props={props} />;
    case 'quotation':
      return <Quotation props={props} />;
    case 'data_card':
      return <DataCard props={props} />;
    case 'timeline':
      return <TimelineCard props={props} />;
    case 'before_after':
      return <BeforeAfter props={props} />;
    case 'closing':
      return <Closing props={props} />;
    case 'attribution':
      return <Attribution props={props} />;
    case 'media':
      return <Slate title="No media assigned" detail="Assign an image or video to this shot." backdrop={false} />;
    case 'blank':
    default:
      return <AbsoluteFill style={{ background: colors.ink }} />;
  }
};
