/**
 * Builds the Project Cybersyn pilot (cold open) as data. Run with `npm run pilot:init`.
 * It never overwrites an existing project.json unless --force is passed, so editorial work is safe.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectSchema, SCHEMA_VERSION, tokenize, type Anchor, type Project, type Shot } from '@uw/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PILOT_DIR = path.join(root, 'projects', 'cybersyn-pilot');

const now = new Date().toISOString();

// ------------------------------------------------------------ narration (the owner's draft, split at sentences)
const N: [string, string][] = [
  ['n01', 'In 1972, a group of engineers in Chile were building something that looked like it belonged on the bridge of a science-fiction spaceship.'],
  ['n02', 'Seven futuristic chairs.'],
  ['n03', 'Wall-mounted screens.'],
  ['n04', 'Buttons built into the armrests.'],
  ['n05', 'And the whole thing was designed to help run a country’s economy.'],
  ['n06', 'Now, before you picture some enormous supercomputer quietly making decisions about an entire nation, there’s something you should know.'],
  ['n07', 'Most of the information feeding this system arrived through machines that were essentially glorified electric typewriters.'],
  ['n08', 'And the displays? They were considerably less sophisticated than they looked.'],
  ['n09', 'But here’s the fascinating part.'],
  ['n10', 'The people building it weren’t just trying to invent a better computer. They were trying to invent a different way to organize an economy.'],
  ['n11', 'One where factories could respond to problems faster. Where government decisions could be informed by current production data. And where the people doing the work might actually have some influence over how the system operated.'],
  ['n12', 'Some of it worked. Much of it was never finished.'],
  ['n13', 'And less than two years after the project began, the entire future it represented was gone.'],
  ['n14', 'This is Project Cybersyn.'],
  ['n15', 'And it’s one of the strangest technological experiments of the twentieth century.'],
];
const text = new Map(N);

/** Anchor to the word of a segment where `phrase` begins (a mistake here throws, not silently misplaces). */
function at(seg: string, phrase = '', offsetSec = 0): Anchor {
  const toks = tokenize(text.get(seg)!);
  if (!phrase) return { kind: 'segment', segmentId: seg, word: 0, offsetSec };
  const want = tokenize(phrase);
  for (let i = 0; i + want.length <= toks.length; i++) {
    if (want.every((w, k) => toks[i + k]!.replace(/[.,?]/g, '').toLowerCase() === w.replace(/[.,?]/g, '').toLowerCase())) return { kind: 'segment', segmentId: seg, word: i, offsetSec };
  }
  throw new Error(`"${phrase}" not found in ${seg}`);
}

const RECON = { isReconstruction: true, label: 'ILLUSTRATIVE RECONSTRUCTION · NOT ARCHIVAL' };
const sc = {
  room: 'sc-room',
  nation: 'sc-nation',
  promise: 'sc-promise',
  end: 'sc-end',
};

const shot = (s: Partial<Shot> & Pick<Shot, 'id' | 'sceneId' | 'anchor' | 'category' | 'component'>): Shot =>
  ({
    chapterId: 'ch1',
    narrationText: '',
    props: {},
    camera: { preset: 'static', intensity: 0.5, focus: { x: 0.5, y: 0.5 }, easing: 'inOutSine' },
    overlays: [],
    transitionIn: { type: 'cut', durationSec: 0 },
    soundCues: [],
    claimIds: [],
    reconstruction: { isReconstruction: false },
    status: 'draft',
    ...s,
  }) as Shot;

const fade = (d = 0.6) => ({ type: 'fade' as const, durationSec: d });

const shots: Shot[] = [
  shot({ id: 's01', sceneId: sc.room, anchor: { kind: 'start' }, category: 'technical_illustration', component: 'ops_room', props: { mode: 'reveal', dollyFrom: 60, dollyTo: 330, heightFrom: -40, heightTo: 0 }, overlays: [{ id: 'o1', text: 'Chile | 1972', style: 'kicker', atSec: 0.7, durSec: 4, position: 'top_left' }], reconstruction: RECON, status: 'ready', claimIds: ['c-engineers-1972'], notes: 'Slow reveal. The room is original illustration; replace with licensed archival photographs of the real room when cleared.' }),
  shot({ id: 's02', sceneId: sc.room, anchor: at('n01', 'that looked'), category: 'technical_illustration', component: 'ops_room', props: { mode: 'wide', dollyFrom: 380, dollyTo: 430, yawFrom: -34, yawTo: 14, heightFrom: -20, heightTo: -30 }, transitionIn: fade(0.7), reconstruction: RECON, status: 'ready' }),
  shot({ id: 's03', sceneId: sc.room, anchor: at('n02'), category: 'technical_illustration', component: 'ops_room', props: { mode: 'wide', dollyFrom: 560, dollyTo: 700, yawFrom: 6, yawTo: -4, heightFrom: -170, heightTo: -150, pitchFrom: -4, pitchTo: -2 }, reconstruction: RECON, status: 'ready', claimIds: ['c-seven-chairs'] }),
  shot({ id: 's04', sceneId: sc.room, anchor: at('n03'), category: 'technical_illustration', component: 'display_wall', camera: { preset: 'push_in', intensity: 0.45, focus: { x: 0.5, y: 0.5 }, easing: 'inOutSine' }, reconstruction: RECON, status: 'ready', claimIds: ['c-wall-screens'] }),
  shot({ id: 's05', sceneId: sc.room, anchor: at('n04'), category: 'technical_illustration', component: 'chair_closeup', camera: { preset: 'push_in', intensity: 0.6, focus: { x: 0.62, y: 0.6 }, easing: 'inOutSine' }, soundCues: [{ id: 'q1', assetId: 'sfx-button', atSec: 1.0, gainDb: -8 }], reconstruction: RECON, status: 'ready', claimIds: ['c-armrest-buttons'] }),

  shot({ id: 's06', sceneId: sc.nation, anchor: at('n05'), category: 'historical_photo', component: 'archival_photo', props: { needs: 'Archival photograph: street scene, Santiago, early 1970s', detail: 'Assign a licensed or public-domain photograph in the Assets tab. This slate then gives way to the photograph.', caption: 'Santiago, early 1970s' }, camera: { preset: 'push_in', intensity: 0.35, focus: { x: 0.5, y: 0.5 }, easing: 'inOutSine' }, transitionIn: fade(0.6), status: 'placeholder', claimIds: ['c-run-economy'] }),
  shot({ id: 's07', sceneId: sc.nation, anchor: at('n06'), category: 'technical_illustration', component: 'ops_room', props: { mode: 'wide', panels: 3, chairs: 5, dollyFrom: 380, dollyTo: 300, yawFrom: 0, yawTo: 8, heightFrom: 330, heightTo: 280, pitchFrom: 17, pitchTo: 15 }, transitionIn: fade(0.6), reconstruction: RECON, status: 'ready' }),
  shot({ id: 's08', sceneId: sc.nation, anchor: at('n06', 'about an entire'), category: 'animated_map', component: 'network_map', camera: { preset: 'push_in', intensity: 0.25, focus: { x: 0.5, y: 0.52 }, easing: 'inOutSine' }, transitionIn: fade(0.6), reconstruction: { isReconstruction: true, label: 'SCHEMATIC MAP · ILLUSTRATIVE' }, status: 'ready', claimIds: ['c-telex-network'] }),
  shot({ id: 's09', sceneId: sc.nation, anchor: at('n07', 'machines that'), category: 'technical_illustration', component: 'telex', soundCues: [{ id: 'q1', assetId: 'sfx-telex', atSec: 0.3, gainDb: -11 }], camera: { preset: 'push_in', intensity: 0.35, focus: { x: 0.4, y: 0.6 }, easing: 'inOutSine' }, transitionIn: fade(0.4), reconstruction: { isReconstruction: true, label: 'ILLUSTRATION · MESSAGE INVENTED' }, status: 'ready', claimIds: ['c-telex-input'] }),
  shot({ id: 's10', sceneId: sc.nation, anchor: at('n08'), category: 'technical_illustration', component: 'display_wall', props: {}, camera: { preset: 'pan_right', intensity: 0.5, focus: { x: 0.5, y: 0.5 }, easing: 'inOutSine' }, soundCues: [{ id: 'q1', assetId: 'sfx-slide-click', atSec: 0.7, gainDb: -10 }], transitionIn: fade(0.4), reconstruction: RECON, status: 'ready', claimIds: ['c-displays-simple'] }),

  shot({ id: 's11', sceneId: sc.promise, anchor: at('n09'), category: 'technical_illustration', component: 'ops_room', props: { mode: 'wide', hideChairs: true, dollyFrom: 640, dollyTo: 900, yawFrom: -3, yawTo: 3, heightFrom: -150, heightTo: -120 }, transitionIn: fade(0.6), reconstruction: RECON, status: 'ready' }),
  shot({ id: 's12', sceneId: sc.promise, anchor: at('n10'), category: 'typography', component: 'people_cards', props: { stagger: 0.7 }, camera: { preset: 'drift', intensity: 0.3, focus: { x: 0.5, y: 0.5 }, easing: 'inOutSine' }, transitionIn: fade(0.6), status: 'placeholder', claimIds: ['c-people'], notes: 'Portraits are drawn placeholders. Assign licensed photographs when cleared.' }),
  shot({ id: 's13', sceneId: sc.promise, anchor: at('n11'), category: 'animated_map', component: 'network_map', camera: { preset: 'drift', intensity: 0.45, focus: { x: 0.45, y: 0.52 }, easing: 'inOutSine' }, transitionIn: fade(0.6), reconstruction: { isReconstruction: true, label: 'SCHEMATIC MAP · ILLUSTRATIVE' }, status: 'ready', claimIds: ['c-aim-factories'] }),
  shot({ id: 's14', sceneId: sc.promise, anchor: at('n11', 'Where government'), category: 'technical_illustration', component: 'ops_room', props: { mode: 'wide', dollyFrom: 300, dollyTo: 420, yawFrom: 38, yawTo: 22, heightFrom: -40, heightTo: -40, pitchFrom: 2, pitchTo: 2 }, transitionIn: fade(0.5), reconstruction: RECON, status: 'ready', claimIds: ['c-aim-decisions'] }),
  shot({ id: 's15', sceneId: sc.promise, anchor: at('n11', 'And where the'), category: 'historical_photo', component: 'archival_photo', props: { needs: 'Archival photograph: workers at a Chilean factory, early 1970s', detail: 'Assign a licensed or public-domain photograph in the Assets tab.', caption: 'Chile, early 1970s' }, camera: { preset: 'push_in', intensity: 0.3, focus: { x: 0.5, y: 0.5 }, easing: 'inOutSine' }, transitionIn: fade(0.6), status: 'placeholder', claimIds: ['c-aim-workers'] }),
  shot({ id: 's16', sceneId: sc.promise, anchor: at('n12'), category: 'technical_illustration', component: 'ops_room', props: { mode: 'wide', dollyFrom: 420, dollyTo: 560, yawFrom: -26, yawTo: -30, heightFrom: -110, heightTo: -90 }, transitionIn: fade(0.5), reconstruction: RECON, status: 'ready', claimIds: ['c-some-worked'] }),
  shot({ id: 's17', sceneId: sc.promise, anchor: at('n12', 'Much of'), category: 'technical_illustration', component: 'ops_room', props: { mode: 'wide', panels: 3, chairs: 4, dollyFrom: 520, dollyTo: 300, yawFrom: 0, yawTo: 0, heightFrom: 10, heightTo: 60 }, transitionIn: fade(0.5), reconstruction: RECON, status: 'ready', claimIds: ['c-unfinished'] }),

  shot({ id: 's18', sceneId: sc.end, anchor: at('n13'), category: 'technical_illustration', component: 'tonal_shift', props: { dollyFrom: 340, dollyTo: 200, darkFrom: 0.2, yawFrom: 18, yawTo: -6, heightFrom: 70, heightTo: 30, pitchFrom: 6, pitchTo: 3 }, soundCues: [{ id: 'q1', assetId: 'sfx-powerdown', atSec: 1.2, gainDb: -9 }], transitionIn: fade(0.8), reconstruction: RECON, status: 'ready', claimIds: ['c-under-two-years'] }),
  shot({ id: 's19', sceneId: sc.end, anchor: at('n14'), category: 'typography', component: 'title_reveal', props: { kicker: 'The Unbuilt World', title: 'Project Cybersyn', subtitle: 'Chile · 1971–1973', fadeOutSec: 1.6 }, camera: { preset: 'push_in', intensity: 0.12, focus: { x: 0.5, y: 0.5 }, easing: 'inOutSine' }, soundCues: [{ id: 'q1', assetId: 'sfx-title-hit', atSec: -0.15, gainDb: -6 }], transitionIn: { type: 'dip_black', durationSec: 0.8 }, status: 'ready', claimIds: ['c-strangest'] }),
];

// ------------------------------------------------------------ research dossier (a draft, nothing here is verified)
const sources: Project['sources'] = [
  { id: 'src-medina-2011', title: 'Cybernetic Revolutionaries: Technology and Politics in Allende’s Chile', kind: 'book', author: 'Eden Medina', publisher: 'MIT Press', year: 2011, url: 'https://mitpress.mit.edu/9780262515962/cybernetic-revolutionaries/', tier: 'secondary' },
  { id: 'src-medina-2006', title: 'Designing Freedom, Regulating a Nation: Socialist Cybernetics in Allende’s Chile', kind: 'article', author: 'Eden Medina', publisher: 'Journal of Latin American Studies 38(3)', year: 2006, tier: 'secondary' },
  { id: 'src-beer-1981', title: 'Brain of the Firm (2nd ed.)', kind: 'book', author: 'Stafford Beer', publisher: 'John Wiley & Sons', year: 1981, tier: 'primary' },
  { id: 'src-beer-1975', title: 'Platform for Change', kind: 'book', author: 'Stafford Beer', publisher: 'John Wiley & Sons', year: 1975, tier: 'primary' },
];

const claim = (id: string, text: string, rest: Partial<Project['claims'][number]> = {}): Project['claims'][number] => ({ id, text, status: 'needs_verification', sourceIds: [], origin: 'draft_narration', scope: 'context', ...rest });
const claims: Project['claims'] = [
  claim('c-engineers-1972', 'During 1972 a group of engineers in Chile was building the operations room.', { sourceIds: ['src-medina-2011'], note: 'Check construction dates of the room (1972–73) against Medina ch. 4–5.', scope: 'context' }),
  claim('c-seven-chairs', 'The operations room had seven chairs.', { sourceIds: ['src-medina-2011'], note: 'Check count and arrangement against Medina and photographs.', scope: 'demonstrated' }),
  claim('c-wall-screens', 'The room had wall-mounted screens.', { sourceIds: ['src-medina-2011'], scope: 'demonstrated' }),
  claim('c-armrest-buttons', 'The chairs had buttons built into the armrests.', { sourceIds: ['src-medina-2011'], note: 'Check what the buttons were wired to. The narration does not claim they controlled the live system.', scope: 'demonstrated' }),
  claim('c-run-economy', 'The system was designed to help run the Chilean economy.', { status: 'interpretation', sourceIds: ['src-medina-2011', 'src-beer-1981'], note: 'Intent, not demonstrated capability: "help coordinate state-managed industry" is closer to the sources than "run".', scope: 'intended' }),
  claim('c-telex-network', 'A telex network linked enterprises to the centre in Santiago.', { sourceIds: ['src-medina-2011'], note: 'Check the extent of the network and which enterprises were connected. The map in the video is schematic.', scope: 'demonstrated' }),
  claim('c-telex-input', 'Most of the information fed to the system arrived by telex machines.', { sourceIds: ['src-medina-2011'], note: '"Glorified electric typewriters" is a narrator’s characterisation. Confirm the "most" and the machines used.', scope: 'demonstrated' }),
  claim('c-displays-simple', 'The room’s displays were much less sophisticated than they appeared (not computer-driven graphics).', { sourceIds: ['src-medina-2011'], note: 'Confirm how the screens produced their images before this line is final.', scope: 'demonstrated' }),
  claim('c-people', 'Stafford Beer, Fernando Flores, Gui Bonsiepe and Salvador Allende were central people in the story.', { sourceIds: ['src-medina-2011'], note: 'Check each role description on the name cards.' }),
  claim('c-aim-factories', 'One aim was for factories to respond to problems faster.', { status: 'interpretation', sourceIds: ['src-medina-2011', 'src-beer-1975'], scope: 'intended' }),
  claim('c-aim-decisions', 'One aim was for government decisions to be informed by current production data.', { status: 'interpretation', sourceIds: ['src-medina-2011', 'src-beer-1975'], scope: 'intended' }),
  claim('c-aim-workers', 'One aim was for workers to have some influence over how the system operated.', { status: 'disputed', sourceIds: ['src-medina-2011'], note: 'Worker participation was an ideal of the design; scholarship disagrees about how far it was realised. The narration says "might", which is right. Keep it as intent.', scope: 'intended' }),
  claim('c-some-worked', 'Some parts of the system worked, including use during the October 1972 truck owners’ strike.', { status: 'disputed', sourceIds: ['src-medina-2011'], note: 'How much the system mattered in the strike is contested. The line "Some of it worked" is safe; any stronger claim needs a source.', scope: 'demonstrated' }),
  claim('c-unfinished', 'Much of the project was never finished.', { sourceIds: ['src-medina-2011'], scope: 'demonstrated' }),
  claim('c-under-two-years', 'The project ended less than two years after it began (Sept 1973 coup).', { status: 'interpretation', sourceIds: ['src-medina-2011'], note: 'Depends on the start date: first contact with Beer was in 1971. Check the month so "less than two years" holds.' }),
  claim('c-strangest', '"One of the strangest technological experiments of the twentieth century."', { status: 'interpretation', note: 'Editorial judgement, presented as the narrator’s view.' }),
];

export function buildPilotProject(): Project {
  const gen = (id: string, file: string, kind: 'music' | 'sfx', durationSec: number, notes: string) => ({
    id,
    filename: file,
    relPath: `media/generated/audio/${file}`,
    kind,
    mime: 'audio/wav',
    durationSec,
    origin: 'synthesized' as const,
    licenseStatus: 'own_work' as const,
    licenseName: 'Synthesized by scripts/synth_audio.py (original, no samples)',
    attributionRequired: false,
    aiGenerated: false,
    placeholder: false,
    approval: 'approved' as const,
    notes,
  });
  const project: Project = {
    schemaVersion: SCHEMA_VERSION,
    id: 'cybersyn-pilot',
    title: 'The Computer That Almost Ran a Country',
    channel: 'The Unbuilt World',
    subject: 'Project Cybersyn, Chile, 1971–1973',
    tone: 'Cinematic but conversational',
    perspective: 'Curious, thoughtful and historically grounded',
    targetRuntimeSec: 27 * 60,
    sliceRuntimeSec: 90,
    stage: 'edit',
    createdAt: now,
    updatedAt: now,
    revision: 1,
    settings: { fps: 30, width: 1920, height: 1080, narrationWpm: 160, leadInSec: 2, tailSec: 3, narrationVoice: { voice: 'en-gb-x-rp', rate: 168, pitch: 34 }, captions: false, disclosures: true },
    chapters: [
      { id: 'ch1', index: 1, title: 'The Room That Shouldn’t Exist', plannedStart: '00:00', plannedEnd: '02:00', summary: 'Cold open (this slice, about 90 seconds) and the opening of the story.' },
      { id: 'ch2', index: 2, title: 'A Country Trying Something Different', plannedStart: '02:00', plannedEnd: '06:00' },
      { id: 'ch3', index: 3, title: 'The Eccentric British Cybernetician', plannedStart: '06:00', plannedEnd: '10:00' },
      { id: 'ch4', index: 4, title: 'Building Tomorrow With Yesterday’s Machines', plannedStart: '10:00', plannedEnd: '15:00' },
      { id: 'ch5', index: 5, title: 'The System’s First Real Test', plannedStart: '15:00', plannedEnd: '20:00' },
      { id: 'ch6', index: 6, title: 'September 11, 1973', plannedStart: '20:00', plannedEnd: '23:00' },
      { id: 'ch7', index: 7, title: 'The Future That Never Happened', plannedStart: '23:00', plannedEnd: '27:00' },
    ],
    narration: N.map(([id, t]) => ({
      id,
      chapterId: 'ch1',
      text: t,
      gapBeforeSec: id === 'n02' || id === 'n03' || id === 'n04' ? 0.45 : id === 'n09' ? 0.7 : id === 'n13' ? 0.9 : id === 'n14' ? 1.1 : 0.4,
      claimIds: shots.filter((s) => s.anchor.kind === 'segment' && s.anchor.segmentId === id).flatMap((s) => s.claimIds).filter((c, k, a) => a.indexOf(c) === k),
      locked: false,
    })),
    shots,
    assets: [
      gen('music-ambient', 'music_ambient.wav', 'music', 96, 'Ambient bed: D-minor pads with sparse plucks.'),
      gen('ambience-room', 'ambience_room.wav', 'sfx', 38, 'Low mains hum and air, loops.'),
      gen('sfx-telex', 'sfx_telex.wav', 'sfx', 4, 'Teleprinter clatter ending in a carriage bell.'),
      gen('sfx-button', 'sfx_button.wav', 'sfx', 0.9, 'Soft press and chime.'),
      gen('sfx-slide-click', 'sfx_slide_click.wav', 'sfx', 0.5, 'Slide projector change.'),
      gen('sfx-powerdown', 'sfx_powerdown.wav', 'sfx', 4, 'Descending power-down.'),
      gen('sfx-title-hit', 'sfx_title_hit.wav', 'sfx', 5, 'Low boom with shimmer for the title.'),
    ],
    audio: {
      narrationGainDb: 0,
      targetLufs: -16,
      truePeakDb: -1.5,
      music: [
        {
          id: 'bed',
          assetId: 'music-ambient',
          startSec: 0,
          gainDb: -20,
          fadeInSec: 2.5,
          fadeOutSec: 4,
          loop: true,
          keyframes: [
            { shotId: 's18', atSec: 0.5, gainDb: 0 },
            { shotId: 's18', atSec: 5, gainDb: -24 },
            { shotId: 's19', atSec: 0.3, gainDb: -24 },
            { shotId: 's19', atSec: 3.2, gainDb: 1 },
          ],
          duck: { enabled: true, amountDb: 8, attackMs: 90, releaseMs: 700 },
        },
        {
          id: 'room',
          assetId: 'ambience-room',
          startSec: 0,
          gainDb: -32,
          fadeInSec: 3,
          fadeOutSec: 1,
          loop: true,
          keyframes: [
            { shotId: 's18', atSec: 0.5, gainDb: 0 },
            { shotId: 's18', atSec: 4.5, gainDb: -40 },
          ],
          duck: { enabled: false, amountDb: 0, attackMs: 80, releaseMs: 500 },
        },
      ],
    },
    sources,
    claims,
    renders: [],
    editorialNotes: [
      { id: 'e1', createdAt: now, text: 'Narration is the owner’s draft, split at sentence level only. Nothing was reworded. Historical wording marked in the dossier still needs checking against the sources.' },
      { id: 'e2', createdAt: now, text: 'The voice is an offline scratch voice (espeak-ng). It exists so timing, mix and render can be proven without an account. Replace it with a real narration by importing audio or using a TTS provider.' },
      { id: 'e3', createdAt: now, text: 'All room, map, telex and screen imagery is original illustration drawn in code and is labelled as reconstruction on screen. Archival photographs and portraits are placeholders until licensed material is assigned.' },
    ],
  };
  return ProjectSchema.parse(project);
}

async function main() {
  const file = path.join(PILOT_DIR, 'project.json');
  const exists = await fs.stat(file).then(() => true, () => false);
  if (exists && !process.argv.includes('--force')) {
    console.log(`${file} exists; keeping it (use --force to rebuild).`);
    return;
  }
  await fs.mkdir(PILOT_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(buildPilotProject(), null, 2) + '\n');
  console.log(`wrote ${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
