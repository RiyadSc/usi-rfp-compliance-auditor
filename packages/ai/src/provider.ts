import type { RequirementCandidate } from './schemas';
import type { ModelVerificationFinding } from './verification-schemas';

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

export type VerificationCandidateInput = Pick<
  RequirementCandidate,
  | 'id'
  | 'documentId'
  | 'category'
  | 'title'
  | 'obligation'
  | 'mandatoryClass'
  | 'preliminaryPage'
  | 'evidenceQuote'
>;

export type VerificationContext = {
  chunkId: string;
  documentId: string;
  documentType: 'primary_rfp' | 'addendum' | 'attachment' | 'reference' | string;
  pageNumber: number;
  text: string;
  extractionStatus: 'ok' | 'empty' | 'error' | string;
  parserWarnings: string[];
  retrievalReason: string;
};

export type VerifyInput = {
  workspaceId: string;
  analysisRunId: string;
  verificationRunId: string;
  candidates: VerificationCandidateInput[];
  contexts: VerificationContext[];
  promptVersion: string;
  schemaVersion: string;
  maxOutputTokens: number;
};

export type VerifyOutput = {
  findings: ModelVerificationFinding[];
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
  verifyCandidates(input: VerifyInput): Promise<VerifyOutput>;
  embed(texts: string[]): Promise<{
    vectors: number[][];
    modelId: string;
    tokens: number;
    estimatedCostUsd: number;
    requestId: string | null;
  }>;
}
