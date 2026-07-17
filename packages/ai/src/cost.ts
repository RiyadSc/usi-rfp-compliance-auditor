/** Approximate USD rates for budgeting (not billing truth). Update when pricing changes. */
export const GPT52_INPUT_PER_MTOK = 1.75;
export const GPT52_OUTPUT_PER_MTOK = 14.0;
export const EMBED_SMALL_PER_MTOK = 0.02;

export function estimateChatCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * GPT52_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * GPT52_OUTPUT_PER_MTOK
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
