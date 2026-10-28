/** The Unbuilt World design tokens. Compositions and the studio UI both read these. */
export const colors = {
  midnight: '#19232A',
  amber: '#D4A16A',
  paper: '#F1E8D8',
  sage: '#75958B',
  // Neutral range derived from midnight/paper for depth and legibility.
  ink: '#0E151A',
  deep: '#121B21',
  slate: '#26343D',
  steel: '#3A4C57',
  fog: '#8E9DA3',
  bone: '#CFC6B4',
  // States.
  danger: '#C9684F',
  warn: '#D9B65C',
  ok: '#75958B',
} as const;

export const fonts = {
  display: "'Cormorant', 'Times New Roman', serif",
  body: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
} as const;

export const motion = {
  /** Frames per second the compositions are authored for; the project may override. */
  baseFps: 30,
  slow: 1.4,
} as const;

export const brand = {
  name: 'The Unbuilt World',
  tagline: 'Stories from the futures we left behind.',
} as const;

export type Colors = typeof colors;
