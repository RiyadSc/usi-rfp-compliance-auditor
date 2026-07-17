import { MockProvider } from './mock-provider';
import { OpenAIProvider } from './openai-provider';
import type { ModelProvider } from './provider';

export * from './schemas';
export * from './provider';
export * from './cost';
export * from './prompts';
export * from './chunking';
export * from './retrieval';
export * from './retry';
export { MockProvider } from './mock-provider';
export { OpenAIProvider } from './openai-provider';

export type ProviderEnv = {
  OPENAI_API_KEY?: string | undefined;
  OPENAI_EXTRACT_MODEL?: string | undefined;
  OPENAI_EMBED_MODEL?: string | undefined;
};

/** Prefer OpenAI when a server-only key is present; otherwise MockProvider. */
export function createProvider(env: ProviderEnv = {}): ModelProvider {
  const key = env.OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (key) {
    return new OpenAIProvider({
      apiKey: key,
      extractModel:
        env.OPENAI_EXTRACT_MODEL ?? process.env.OPENAI_EXTRACT_MODEL ?? 'gpt-5.2-2025-12-11',
      embedModel:
        env.OPENAI_EMBED_MODEL ?? process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small',
    });
  }
  return new MockProvider();
}
