/** Creates the pilot project if missing and generates its audio. Safe to run repeatedly. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PILOT_DIR } from './pilot-project';
import { syncAssetMetadata } from '../apps/worker/src/pipeline';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const initRun = spawnSync('npx', ['tsx', path.join(root, 'scripts/pilot-project.ts')], { stdio: 'inherit' });
if (initRun.status !== 0) process.exit(initRun.status ?? 1);
const synth = spawnSync('python3', [path.join(root, 'scripts/synth_audio.py'), path.join(PILOT_DIR, 'media/generated/audio'), ...process.argv.slice(2).filter((a) => a === '--force')], { stdio: 'inherit' });
if (synth.status !== 0) {
  console.error('Audio synthesis failed. Is numpy installed? Run: python3 -m pip install -r requirements.txt');
  process.exit(synth.status ?? 1);
}
const p = await syncAssetMetadata(PILOT_DIR);
console.log(`Pilot ready: ${p.assets.length} assets registered, ${p.shots.length} shots, ${p.narration.length} narration segments.`);
