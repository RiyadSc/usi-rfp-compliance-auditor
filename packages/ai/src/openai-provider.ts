import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { estimateChatCost, estimateEmbedCost } from './cost';
import type {
  ExtractInput,
  ExtractOutput,
  ModelProvider,
  VerifyInput,
  VerifyOutput,
} from './provider';
import {
  EXTRACTION_PROMPT_VERSION,
  buildExtractionSystemPrompt,
  buildExtractionUserPayload,
  buildVerificationSystemPrompt,
  buildVerificationUserPayload,
} from './prompts';
import { withRetries } from './retry';
import {
  SCHEMA_VERSION,
  modelExtractionJsonSchema,
  modelExtractionSchema,
  type RequirementCandidate,
} from './schemas';
import { modelVerificationJsonSchema, modelVerificationOutputSchema } from './verification-schemas';

export type OpenAIProviderOptions = {
  apiKey: string;
  extractModel?: string;
  verifyModel?: string;
  embedModel?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  verifyReasoningEffort?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
};

function outputTextFromResponse(response: OpenAI.Responses.Response): string {
  if (typeof response.output_text === 'string' && response.output_text.length > 0) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text') parts.push(content.text);
    }
  }
  return parts.join('');
}

function hasRefusal(response: OpenAI.Responses.Response): boolean {
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'refusal') return true;
    }
  }
  return false;
}

export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly extractModel: string;
  private readonly embedModel: string;
  private readonly verifyModel: string;
  private readonly reasoningEffort: 'low' | 'medium' | 'high';
  private readonly verifyReasoningEffort: 'low' | 'medium' | 'high';

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 60_000,
      maxRetries: 0,
    });
    this.extractModel = options.extractModel ?? 'gpt-5.4-mini-2026-03-17';
    this.embedModel = options.embedModel ?? 'text-embedding-3-small';
    this.verifyModel = options.verifyModel ?? 'gpt-5.5-2026-04-23';
    this.reasoningEffort = options.reasoningEffort ?? 'low';
    this.verifyReasoningEffort = options.verifyReasoningEffort ?? 'medium';
  }

  async verifyCandidates(input: VerifyInput): Promise<VerifyOutput> {
    const started = Date.now();
    let attempts = 0;
    let repairAttempts = 0;
    const create = async (repairMessage?: string) =>
      this.client.responses.create({
        model: this.verifyModel,
        store: false,
        max_output_tokens: input.maxOutputTokens,
        reasoning: { effort: this.verifyReasoningEffort },
        input: [
          { role: 'system', content: buildVerificationSystemPrompt() },
          { role: 'user', content: buildVerificationUserPayload(input) },
          ...(repairMessage ? [{ role: 'user' as const, content: repairMessage }] : []),
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'requirement_verification',
            strict: true,
            schema: modelVerificationJsonSchema as unknown as Record<string, unknown>,
          },
        },
      });
    let response = await withRetries(
      (attempt) => {
        attempts = attempt;
        return create();
      },
      { maxAttempts: 3, baseDelayMs: 400 },
    );
    const billableResponses = [response];

    const parse = (res: OpenAI.Responses.Response) => {
      if (res.status === 'incomplete' || hasRefusal(res)) return null;
      const raw = outputTextFromResponse(res);
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return null;
      }
      const validated = modelVerificationOutputSchema.safeParse(json);
      return validated.success ? validated.data : null;
    };
    let parsed = parse(response);
    if (!parsed && response.status !== 'incomplete' && !hasRefusal(response)) {
      repairAttempts = 1;
      response = await create(
        'The previous output failed strict validation. Return the complete result matching the schema exactly; do not add prose.',
      );
      billableResponses.push(response);
      parsed = parse(response);
    }

    const promptTokens = billableResponses.reduce(
      (sum, item) => sum + (item.usage?.input_tokens ?? 0),
      0,
    );
    const completionTokens = billableResponses.reduce(
      (sum, item) => sum + (item.usage?.output_tokens ?? 0),
      0,
    );
    const reasoningTokens = billableResponses.reduce(
      (sum, item) => sum + (item.usage?.output_tokens_details?.reasoning_tokens ?? 0),
      0,
    );
    const cachedTokens = billableResponses.reduce(
      (sum, item) => sum + (item.usage?.input_tokens_details?.cached_tokens ?? 0),
      0,
    );
    const base = {
      providerRequestId: response.id,
      modelId: response.model,
      promptTokens,
      completionTokens,
      reasoningTokens,
      cachedTokens,
      latencyMs: Date.now() - started,
      estimatedCostUsd: billableResponses.reduce(
        (sum, item) =>
          sum +
          estimateChatCost(
            item.usage?.input_tokens ?? 0,
            item.usage?.output_tokens ?? 0,
            item.model,
            item.usage?.input_tokens_details?.cached_tokens ?? 0,
          ),
        0,
      ),
      retries: Math.max(0, attempts - 1),
      repairAttempts,
      schemaAdherent: Boolean(parsed),
    };
    if (response.status === 'incomplete') return { ...base, findings: [], incomplete: true };
    if (hasRefusal(response)) return { ...base, findings: [], refused: true };
    if (!parsed)
      throw new Error('Verification output failed strict Zod validation after controlled repair');
    const expected = new Set(input.candidates.map((c) => c.id));
    const actual = new Set(parsed.findings.map((f) => f.candidateId));
    if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) {
      throw new Error('Verification output did not contain exactly one finding per candidate');
    }
    return { ...base, findings: parsed.findings, notes: parsed.notes };
  }

  async extractCandidates(input: ExtractInput): Promise<ExtractOutput> {
    const started = Date.now();
    let attempts = 0;
    const response = await withRetries(
      (attempt) => {
        attempts = attempt;
        return this.client.responses.create({
          model: this.extractModel,
          store: false,
          max_output_tokens: input.maxOutputTokens,
          reasoning: { effort: this.reasoningEffort },
          input: [
            { role: 'system', content: buildExtractionSystemPrompt() },
            { role: 'user', content: buildExtractionUserPayload(input.pages) },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'requirement_extraction',
              strict: true,
              schema: modelExtractionJsonSchema as unknown as Record<string, unknown>,
            },
          },
        });
      },
      { maxAttempts: 3, baseDelayMs: 400 },
    );

    const latencyMs = Date.now() - started;
    const promptTokens = response.usage?.input_tokens ?? 0;
    const completionTokens = response.usage?.output_tokens ?? 0;
    const reasoningTokens = response.usage?.output_tokens_details?.reasoning_tokens ?? 0;
    const cachedTokens = response.usage?.input_tokens_details?.cached_tokens ?? 0;
    const base = {
      providerRequestId: response.id,
      modelId: response.model,
      promptTokens,
      completionTokens,
      reasoningTokens,
      cachedTokens,
      latencyMs,
      estimatedCostUsd: estimateChatCost(
        promptTokens,
        completionTokens,
        response.model,
        cachedTokens,
      ),
      retries: Math.max(0, attempts - 1),
      repairAttempts: 0,
      schemaAdherent: true,
    };

    if (response.status === 'incomplete') {
      return { ...base, candidates: [], incomplete: true };
    }
    if (hasRefusal(response)) {
      return { ...base, candidates: [], refused: true };
    }

    const text = outputTextFromResponse(response);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      throw new Error('Model returned non-JSON structured output');
    }

    const parsed = modelExtractionSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error('Model output failed Zod validation');
    }

    const promptVersion = input.promptVersion || EXTRACTION_PROMPT_VERSION;
    const schemaVersion = input.schemaVersion || SCHEMA_VERSION;
    const candidates: RequirementCandidate[] = parsed.data.candidates.map((c) => ({
      id: randomUUID(),
      analysisRunId: input.analysisRunId,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      category: c.category,
      title: c.title,
      obligation: c.obligation,
      mandatoryClass: c.mandatoryClass,
      preliminaryPage: c.preliminaryPage,
      evidenceQuote: c.evidenceQuote,
      confidence: c.confidence,
      ambiguityNotes: c.ambiguityNotes,
      status: 'unverified' as const,
      promptVersion,
      schemaVersion,
      modelId: response.model,
    }));

    return {
      ...base,
      candidates,
      notes: parsed.data.notes,
    };
  }

  async embed(texts: string[]) {
    if (texts.length === 0) {
      return {
        vectors: [],
        modelId: this.embedModel,
        tokens: 0,
        estimatedCostUsd: 0,
        requestId: null,
      };
    }
    const res = await withRetries(
      () =>
        this.client.embeddings.create({
          model: this.embedModel,
          input: texts,
        }),
      { maxAttempts: 3, baseDelayMs: 300 },
    );
    const tokens = res.usage?.total_tokens ?? 0;
    return {
      vectors: res.data.map((d) => d.embedding),
      modelId: res.model,
      tokens,
      estimatedCostUsd: estimateEmbedCost(tokens),
      requestId: null,
    };
  }
}
