/**
 * Provider-independent contracts for services that arrive in later milestones (3 and beyond).
 * They are defined now so storyboards, jobs and the UI never depend on one vendor.
 */

export interface ProviderCapability {
  id: 'openai' | 'anthropic' | 'gemini' | 'elevenlabs' | 'local-espeak';
  kind: 'llm' | 'image' | 'video' | 'tts';
  name: string;
  /** Whether an adapter exists in this build. */
  implemented: boolean;
  supports: string[];
  note?: string;
}

export interface LlmRequest {
  system?: string;
  prompt: string;
  /** Ask for JSON that matches a Zod schema the caller validates afterwards. */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
}
export interface LlmResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
  model: string;
}
export interface LlmProvider {
  id: string;
  capabilities: { json: boolean; webSearch: boolean; vision: boolean };
  complete(req: LlmRequest, opts?: { signal?: AbortSignal }): Promise<LlmResponse>;
}

export interface ImageRequest {
  prompt: string;
  referenceImagePath?: string;
  aspectRatio: '16:9' | '1:1' | '4:3' | '9:16';
  resolution: { width: number; height: number };
  stylePreset?: string;
  outPath: string;
}
export interface ImageResult {
  path: string;
  metadata: { provider: string; model: string; prompt: string; seed?: number; generatedAt: string };
}
export interface ImageProvider {
  id: string;
  generate(req: ImageRequest, opts?: { signal?: AbortSignal }): Promise<ImageResult>;
}

export interface VideoRequest {
  prompt: string;
  imagePath?: string;
  durationSec: number;
  outPath: string;
}
export interface VideoProvider {
  id: string;
  generate(req: VideoRequest, opts?: { signal?: AbortSignal }): Promise<{ path: string }>;
}

/** What this build offers, shown on the settings screen. Adapters not yet written say so. */
export const PROVIDER_CATALOG: ProviderCapability[] = [
  { id: 'local-espeak', kind: 'tts', name: 'Local espeak-ng (offline scratch voice)', implemented: true, supports: ['word timings', 'offline', 'free'] },
  { id: 'elevenlabs', kind: 'tts', name: 'ElevenLabs', implemented: true, supports: ['voice selection', 'character-level timings', 'segment regeneration'], note: 'Tested against a mock server only; no live call has been made.' },
  { id: 'openai', kind: 'llm', name: 'OpenAI (language and image models)', implemented: false, supports: ['json output', 'vision', 'image generation'], note: 'Adapter planned for Milestone 3.' },
  { id: 'anthropic', kind: 'llm', name: 'Anthropic Claude', implemented: false, supports: ['json output', 'vision', 'long context'], note: 'Adapter planned for Milestone 3.' },
  { id: 'gemini', kind: 'llm', name: 'Google Gemini', implemented: false, supports: ['json output', 'vision', 'image generation'], note: 'Adapter planned for Milestone 3.' },
];
