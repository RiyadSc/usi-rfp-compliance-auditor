import type { RequirementCandidate } from './schemas';

export type PageContext = {
  pageNumber: number;
  text: string;
};

export type ExtractInput = {
  workspaceId: string;
  documentId: string;
  analysisRunId: string;
  pages: PageContext[];
  promptVersion: string;
  schemaVersion: string;
  maxOutputTokens: number;
};

export type ExtractOutput = {
  candidates: RequirementCandidate[];
  providerRequestId: string | null;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  retries: number;
  repairAttempts: number;
  schemaAdherent: boolean;
  refused?: boolean;
  incomplete?: boolean;
  notes?: string | undefined;
};

export interface ModelProvider {
  readonly name: string;
  extractCandidates(input: ExtractInput): Promise<ExtractOutput>;
  embed(texts: string[]): Promise<{
    vectors: number[][];
    modelId: string;
    tokens: number;
    estimatedCostUsd: number;
    requestId: string | null;
  }>;
}
