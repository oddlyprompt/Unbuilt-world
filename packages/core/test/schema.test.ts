import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ProjectSchema, SCHEMA_VERSION, exportScript, migrateProject, numberToWords, resolveTimeline, speakableText, yearToWords, hashString, slug, uniqueId } from '../src';
import { listProjects, loadProject, saveProject, safeJoin, listHistory, ProjectLoadError } from '../src/node';
import { miniProject, tmpDir } from '../../../tests/helpers/fixtures';

describe('project schema', () => {
  it('accepts the shipped Cybersyn pilot', async () => {
    const raw = JSON.parse(await fs.readFile(path.resolve(__dirname, '../../../projects/cybersyn-pilot/project.json'), 'utf8'));
    const p = ProjectSchema.parse(migrateProject(raw));
    expect(p.chapters.map((c) => c.title)).toContain('September 11, 1973');
    expect(p.narration.length).toBeGreaterThan(10);
    expect(p.claims.every((c) => c.status !== 'verified')).toBe(true); // nothing is verified by default
  });

  it('rejects shots with bad enums and ids', () => {
    const p = miniProject();
    expect(() => ProjectSchema.parse({ ...p, shots: [{ ...p.shots[0]!, component: 'sparkles' }] })).toThrow();
    expect(() => ProjectSchema.parse({ ...p, chapters: [{ id: 'bad id!', index: 1, title: 'x' }] })).toThrow();
    expect(() => ProjectSchema.parse({ ...p, schemaVersion: 2 })).toThrow();
  });

  it('fills defaults so older minimal files still load', () => {
    const p = miniProject();
    expect(p.settings.fps).toBe(30);
    expect(p.audio.targetLufs).toBe(-16);
    expect(p.claims).toEqual([]);
  });
});

describe('migrations', () => {
  it('steps one version at a time and refuses newer files', () => {
    const migs = {
      0: (r: Record<string, unknown>) => ({ ...r, schemaVersion: 1, renamed: r.old }),
      1: (r: Record<string, unknown>) => ({ ...r, schemaVersion: 2, again: true }),
    };
    const out = migrateProject({ schemaVersion: 0, old: 'x' }, migs, 2) as Record<string, unknown>;
    expect(out).toMatchObject({ schemaVersion: 2, renamed: 'x', again: true });
    expect(() => migrateProject({ schemaVersion: 9 }, migs, 2)).toThrow(/newer version/);
    expect(() => migrateProject({ schemaVersion: 0 }, {}, 1)).toThrow(/No migration/);
    expect(() => migrateProject({ schemaVersion: 0 }, { 0: (r) => r }, 1)).toThrow(/did not advance/);
    expect(() => migrateProject(null)).toThrow();
    expect(migrateProject(miniProject())).toBeTruthy();
    expect(SCHEMA_VERSION).toBe(1);
  });
});

describe('project storage', () => {
  it('saves atomically, bumps the revision, snapshots history and trims it', async () => {
    const dir = path.join(await tmpDir(), 'p');
    let p = await saveProject(dir, miniProject(), { touch: false });
    expect(p.revision).toBe(1);
    for (let i = 0; i < 5; i++) p = await saveProject(dir, p, { keepHistory: 3 });
    expect(p.revision).toBe(6);
    expect((await listHistory(dir)).length).toBe(3);
    expect((await loadProject(dir)).revision).toBe(6);
    expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('reports damaged files with a readable message', async () => {
    const root = await tmpDir();
    await fs.mkdir(path.join(root, 'bad'));
    await fs.writeFile(path.join(root, 'bad', 'project.json'), '{not json');
    await fs.mkdir(path.join(root, 'odd'));
    await fs.writeFile(path.join(root, 'odd', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'odd' }));
    const list = await listProjects(root);
    expect(list[0]!.error).toContain('not valid JSON');
    expect(list[1]!.error).toContain('does not match the project schema');
    await expect(loadProject(path.join(root, 'bad'))).rejects.toBeInstanceOf(ProjectLoadError);
    await expect(loadProject(path.join(root, 'missing'))).rejects.toThrow(/Cannot read/);
  });

  it('refuses paths that escape the project', () => {
    expect(() => safeJoin('/a/b', '../c')).toThrow(/escapes/);
    expect(() => safeJoin('/a/b', 'media/../../c')).toThrow();
    expect(safeJoin('/a/b', 'media/x.png')).toBe('/a/b/media/x.png');
  });
});

describe('script export and text helpers', () => {
  it('exports markdown, text and json with timings and claims', () => {
    const p = miniProject();
    p.claims.push({ id: 'k', text: 'A claim', status: 'disputed', sourceIds: [], origin: 'human', scope: 'intended', note: 'check it' });
    p.narration[0]!.claimIds = ['k'];
    const t = resolveTimeline(p);
    const md = exportScript(p, t, 'md');
    expect(md).toContain('# Mini');
    expect(md).toContain('**disputed**');
    expect(md).toContain('est.');
    expect(exportScript(p, t, 'txt')).toContain('This is the first sentence of the test.');
    const j = JSON.parse(exportScript(p, t, 'json'));
    expect(j.chapters[0].segments).toHaveLength(3);
  });

  it('says numbers and years the way a narrator would', () => {
    expect(yearToWords(1972)).toBe('nineteen seventy-two');
    expect(yearToWords(1900)).toBe('nineteen hundred');
    expect(yearToWords(2007)).toBe('two thousand seven');
    expect(yearToWords(1905)).toBe('nineteen oh five');
    expect(numberToWords(1234)).toBe('one thousand two hundred thirty-four');
    expect(speakableText('In 1972, 7 chairs and 1,500 telexes.')).toBe('In nineteen seventy-two, seven chairs and one thousand five hundred telexes.');
  });

  it('hashes and ids behave', () => {
    expect(hashString('a')).toBe(hashString('a'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(slug('The Computer That Almost Ran a Country!')).toBe('the-computer-that-almost-ran-a-country');
    expect(uniqueId('x', ['x', 'x-2'])).toBe('x-3');
  });
});
