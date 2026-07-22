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
export * from './verification-schemas';
export * from './deterministic-verification';
export * from './verification-v3-schemas';
export * from './verification-decision-engine';
export * from './candidate-verification-pipeline';
export * from './verification-semantic-contract';
export * from './phase4-qualified-config';
export * from './public-rfp-evaluation';
export * from './large-document';
export { MockProvider } from './mock-provider';
export { OpenAIProvider } from './openai-provider';

export type ProviderEnv = {
  LIVE_PROVIDER_ENABLED?: boolean | undefined;
  OPENAI_API_KEY?: string | undefined;
  OPENAI_EXTRACT_MODEL?: string | undefined;
  OPENAI_EMBED_MODEL?: string | undefined;
  OPENAI_VERIFY_MODEL?: string | undefined;
  OPENAI_REASONING_EFFORT?: 'low' | 'medium' | 'high' | undefined;
};

/**
 * Mock is the application default. A key alone is never authority to construct a paid provider;
 * controlled callers must also opt in explicitly after their budget/provenance preflight.
 */
export function createProvider(env: ProviderEnv = {}): ModelProvider {
  const key = env.OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (key && env.LIVE_PROVIDER_ENABLED === true) {
    return new OpenAIProvider({
      apiKey: key,
      extractModel:
        env.OPENAI_EXTRACT_MODEL ?? process.env.OPENAI_EXTRACT_MODEL ?? 'gpt-5.4-mini-2026-03-17',
      embedModel:
        env.OPENAI_EMBED_MODEL ?? process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small',
      verifyModel:
        env.OPENAI_VERIFY_MODEL ?? process.env.OPENAI_VERIFY_MODEL ?? 'gpt-5.5-2026-04-23',
      reasoningEffort: 'low',
      verifyReasoningEffort:
        env.OPENAI_REASONING_EFFORT ??
        (process.env.OPENAI_REASONING_EFFORT as 'low' | 'medium' | 'high' | undefined) ??
        'low',
    });
  }
  return new MockProvider();
}
