import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * API keys live OUTSIDE every project: in environment variables or in ~/.config/unbuilt-world/secrets.json
 * (mode 0600). They are never written to project files, logs, exports or job records.
 */
export const SECRET_ENV: Record<string, string> = {
  elevenlabs: 'ELEVENLABS_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export const secretsPath = () => process.env.UW_SECRETS_FILE || path.join(os.homedir(), '.config', 'unbuilt-world', 'secrets.json');

async function readFileSecrets(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(secretsPath(), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function getSecret(provider: string): Promise<string | undefined> {
  const env = SECRET_ENV[provider];
  if (env && process.env[env]) return process.env[env];
  const v = (await readFileSecrets())[provider];
  return v || undefined;
}

export async function setSecret(provider: string, value: string): Promise<void> {
  const file = secretsPath();
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const cur = await readFileSecrets();
  cur[provider] = value;
  await fs.writeFile(file, JSON.stringify(cur, null, 2), { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

export async function clearSecret(provider: string): Promise<void> {
  const cur = await readFileSecrets();
  delete cur[provider];
  await fs.writeFile(secretsPath(), JSON.stringify(cur, null, 2), { mode: 0o600 });
}

/** Which providers have a key. Never returns the key. */
export async function configuredProviders(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const p of Object.keys(SECRET_ENV)) out[p] = !!(await getSecret(p));
  return out;
}

/** Remove any known key from text before it is logged or returned to a client. */
export async function redact(text: string): Promise<string> {
  let out = text;
  for (const p of Object.keys(SECRET_ENV)) {
    const v = await getSecret(p);
    if (v && v.length > 6) out = out.split(v).join('[redacted]');
  }
  return out.replace(/(xi-api-key|authorization|x-api-key)(["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1$2[redacted]');
}
