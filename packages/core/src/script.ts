import type { Project } from './schema';
import { formatTime, tokenize, type Timeline } from './timeline';

export type ScriptFormat = 'md' | 'json' | 'txt';

export function wordCount(project: Project): number {
  return project.narration.reduce((a, n) => a + tokenize(n.text).length, 0);
}

/** Spoken length by word count at a given pace (no pauses), in seconds. */
export const spokenSecondsAt = (words: number, wpm: number) => (words * 60) / wpm;

/** Export the narration script with timings, citations and open questions. */
export function exportScript(project: Project, timeline: Timeline, format: ScriptFormat): string {
  const claims = new Map(project.claims.map((c) => [c.id, c]));
  const seg = new Map(timeline.segments.map((s) => [s.id, s]));
  if (format === 'json') {
    return JSON.stringify(
      {
        title: project.title,
        channel: project.channel,
        words: wordCount(project),
        estimatedSpokenSec: spokenSecondsAt(wordCount(project), project.settings.narrationWpm),
        chapters: project.chapters.map((c) => ({
          ...c,
          segments: project.narration
            .filter((n) => n.chapterId === c.id)
            .map((n) => ({ id: n.id, text: n.text, startSec: seg.get(n.id)?.startSec, endSec: seg.get(n.id)?.endSec, claims: n.claimIds.map((id) => claims.get(id)) })),
        })),
      },
      null,
      2,
    );
  }
  const lines: string[] = [];
  if (format === 'md') {
    lines.push(`# ${project.title}`, '', `*${project.channel}* · ${project.subject}`, '', `Words: ${wordCount(project)} · estimated at ${project.settings.narrationWpm} wpm: ${formatTime(spokenSecondsAt(wordCount(project), project.settings.narrationWpm))}`, '');
  } else lines.push(project.title.toUpperCase(), '');
  for (const c of project.chapters) {
    const segs = project.narration.filter((n) => n.chapterId === c.id);
    if (!segs.length) continue;
    lines.push(format === 'md' ? `## ${c.index}. ${c.title}` : `${c.index}. ${c.title}`, '');
    for (const n of segs) {
      const r = seg.get(n.id);
      const t = r ? `[${formatTime(r.startSec)}–${formatTime(r.endSec)}${r.estimated ? ' est.' : ''}] ` : '';
      lines.push(format === 'md' ? `${t}${n.text}` : n.text, '');
      if (format === 'md') {
        for (const id of n.claimIds) {
          const cl = claims.get(id);
          if (cl) lines.push(`> **${cl.status.replace(/_/g, ' ')}** · ${cl.text}${cl.note ? ` — ${cl.note}` : ''}`, '');
        }
      }
    }
  }
  return lines.join('\n');
}
