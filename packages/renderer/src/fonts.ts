import { continueRender, delayRender } from 'remotion';
import cormorant500 from '../assets/fonts/cormorant-latin-500-normal.woff2';
import cormorant600 from '../assets/fonts/cormorant-latin-600-normal.woff2';
import cormorant500i from '../assets/fonts/cormorant-latin-500-italic.woff2';
import sans400 from '../assets/fonts/ibm-plex-sans-latin-400-normal.woff2';
import sans500 from '../assets/fonts/ibm-plex-sans-latin-500-normal.woff2';
import sans600 from '../assets/fonts/ibm-plex-sans-latin-600-normal.woff2';
import mono400 from '../assets/fonts/ibm-plex-mono-latin-400-normal.woff2';
import mono500 from '../assets/fonts/ibm-plex-mono-latin-500-normal.woff2';

const FACES: [string, string, string, string][] = [
  ['Cormorant', cormorant500, '500', 'normal'],
  ['Cormorant', cormorant600, '600', 'normal'],
  ['Cormorant', cormorant500i, '500', 'italic'],
  ['IBM Plex Sans', sans400, '400', 'normal'],
  ['IBM Plex Sans', sans500, '500', 'normal'],
  ['IBM Plex Sans', sans600, '600', 'normal'],
  ['IBM Plex Mono', mono400, '400', 'normal'],
  ['IBM Plex Mono', mono500, '500', 'normal'],
];

let started: Promise<void> | null = null;

/** Load the bundled fonts once and hold the render until they are ready. */
export function loadFonts(): void {
  if (started || typeof document === 'undefined') return;
  const handle = delayRender('Loading fonts', { timeoutInMilliseconds: 30000 });
  started = Promise.all(
    FACES.map(async ([family, url, weight, style]) => {
      const face = new FontFace(family, `url(${url}) format('woff2')`, { weight, style });
      await face.load();
      document.fonts.add(face);
    }),
  )
    .then(() => undefined)
    .catch((e) => {
      console.error('Font loading failed', e);
    })
    .finally(() => continueRender(handle));
}
