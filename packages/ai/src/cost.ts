/** USD rates used for Phase 3 estimates (standard API, per 1M text tokens). */
export const CHAT_PRICING_USD_PER_MTOK = {
  'gpt-5.5': { input: 5, cachedInput: 0.5, output: 30 },
  'gpt-5.4': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.2': { input: 1.75, cachedInput: 0.175, output: 14 },
} as const;
export const EMBED_SMALL_PER_MTOK = 0.02;

function priceKey(modelId: string): keyof typeof CHAT_PRICING_USD_PER_MTOK {
  if (modelId.startsWith('gpt-5.5')) return 'gpt-5.5';
  if (modelId.startsWith('gpt-5.4-mini')) return 'gpt-5.4-mini';
  if (modelId.startsWith('gpt-5.4')) return 'gpt-5.4';
  return 'gpt-5.2';
}

export function estimateChatCost(
  inputTokens: number,
  outputTokens: number,
  modelId = 'gpt-5.2',
  cachedInputTokens = 0,
): number {
  const pricing = CHAT_PRICING_USD_PER_MTOK[priceKey(modelId)];
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  return (
    (uncachedInputTokens / 1_000_000) * pricing.input +
    (cachedInputTokens / 1_000_000) * pricing.cachedInput +
    (outputTokens / 1_000_000) * pricing.output
  );
}

export function estimateEmbedCost(tokens: number): number {
  return (tokens / 1_000_000) * EMBED_SMALL_PER_MTOK;
}

export function checkBudget(
  spentUsd: number,
  pendingUsd: number,
  ceilingUsd: number,
): 'ok' | 'exceeded' {
  if (spentUsd + pendingUsd > ceilingUsd + 1e-9) return 'exceeded';
  return 'ok';
}
