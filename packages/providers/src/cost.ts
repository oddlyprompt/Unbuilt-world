import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hashString } from '@uw/core';

export interface UsageEntry {
  at: string;
  provider: string;
  kind: string;
  key: string;
  characters?: number;
  estimatedCostUsd: number;
  note?: string;
}

/**
 * Append-only usage log and a duplicate guard. A paid call with the same key (provider, voice, text)
 * as an earlier one is refused unless the caller passes `force`, so double clicks cost nothing.
 */
export class UsageLedger {
  constructor(private file: string) {}

  static keyFor(provider: string, voice: string, text: string): string {
    return hashString(`${provider}\u0000${voice}\u0000${text}`);
  }

  async entries(): Promise<UsageEntry[]> {
    try {
      const text = await fs.readFile(this.file, 'utf8');
      return text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as UsageEntry);
    } catch {
      return [];
    }
  }
  async has(key: string): Promise<boolean> {
    return (await this.entries()).some((e) => e.key === key);
  }
  async record(e: Omit<UsageEntry, 'at'>): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.appendFile(this.file, JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n');
  }
  async totalUsd(): Promise<number> {
    return (await this.entries()).reduce((a, e) => a + e.estimatedCostUsd, 0);
  }
}
