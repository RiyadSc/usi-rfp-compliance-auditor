import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { estimateChatCost, estimateEmbedCost } from './cost';
import type { ExtractInput, ExtractOutput, ModelProvider } from './provider';
import {
  EXTRACTION_PROMPT_VERSION,
  buildExtractionSystemPrompt,
  buildExtractionUserPayload,
} from './prompts';
import { withRetries } from './retry';
import {
  SCHEMA_VERSION,
  modelExtractionJsonSchema,
  modelExtractionSchema,
  type RequirementCandidate,
} from './schemas';

export type OpenAIProviderOptions = {
  apiKey: string;
  extractModel?: string;
  embedModel?: string;
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

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.extractModel = options.extractModel ?? 'gpt-5.2-2025-12-11';
    this.embedModel = options.embedModel ?? 'text-embedding-3-small';
  }

  async extractCandidates(input: ExtractInput): Promise<ExtractOutput> {
    const started = Date.now();
    const response = await withRetries(
      () =>
        this.client.responses.create({
          model: this.extractModel,
          store: false,
          max_output_tokens: input.maxOutputTokens,
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
        }),
      { maxAttempts: 3, baseDelayMs: 400 },
    );

    const latencyMs = Date.now() - started;
    const promptTokens = response.usage?.input_tokens ?? 0;
    const completionTokens = response.usage?.output_tokens ?? 0;
    const base = {
      providerRequestId: response.id,
      modelId: response.model,
      promptTokens,
      completionTokens,
      latencyMs,
      estimatedCostUsd: estimateChatCost(promptTokens, completionTokens),
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
