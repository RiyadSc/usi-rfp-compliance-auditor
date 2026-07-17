import { createHash, randomUUID } from 'node:crypto';
import { estimateEmbedCost } from './cost';
import type { ExtractInput, ExtractOutput, ModelProvider } from './provider';
import { EXTRACTION_PROMPT_VERSION } from './prompts';
import {
  REQUIREMENT_CATEGORIES,
  SCHEMA_VERSION,
  type RequirementCandidate,
  type RequirementCategory,
} from './schemas';

type Rule = {
  category: RequirementCategory;
  title: string;
  pattern: RegExp;
  mandatoryClass: 'mandatory' | 'optional' | 'uncertain';
};

const RULES: Rule[] = [
  {
    category: 'deadline',
    title: 'Submission deadline',
    pattern: /deadline|due date|must be (?:received|submitted)/i,
    mandatoryClass: 'mandatory',
  },
  {
    category: 'insurance',
    title: 'Insurance requirement',
    pattern: /insurance|liability|coverage.*(million|\$)/i,
    mandatoryClass: 'mandatory',
  },
  {
    category: 'signature',
    title: 'Signature requirement',
    pattern: /sign(ature|ed)|authorized representative/i,
    mandatoryClass: 'mandatory',
  },
  {
    category: 'required_form',
    title: 'Required form',
    pattern: /form\s+[A-Z0-9-]+|complete.*(form|attachment)/i,
    mandatoryClass: 'mandatory',
  },
  {
    category: 'mandatory_meeting',
    title: 'Mandatory meeting',
    pattern: /mandatory (?:pre-?bid|site) meeting|attendance is mandatory/i,
    mandatoryClass: 'mandatory',
  },
  {
    category: 'attachment',
    title: 'Required attachment',
    pattern: /attach(ment|ed)|include.*(exhibit|appendix)|Exhibit\s+[A-Z]/i,
    mandatoryClass: 'mandatory',
  },
  {
    category: 'staffing_requirement',
    title: 'Staffing minimum',
    pattern: /staff(ing)?|FTEs?|personnel minimum/i,
    mandatoryClass: 'uncertain',
  },
  {
    category: 'pricing_instruction',
    title: 'Pricing instruction',
    pattern: /pricing|unit price|cost proposal|bid schedule/i,
    mandatoryClass: 'mandatory',
  },
  {
    category: 'evaluation_criterion',
    title: 'Evaluation criterion',
    pattern: /evaluation criteria|scored on|points? will be awarded/i,
    mandatoryClass: 'optional',
  },
  {
    category: 'submission_instruction',
    title: 'Submission instruction',
    pattern: /submit(?:ted|ting)? (?:via|through|to)|electronic (?:portal|submission)|sealed bid/i,
    mandatoryClass: 'mandatory',
  },
];

function pseudoEmbed(text: string, dims = 1536): number[] {
  const out = new Array<number>(dims).fill(0);
  const hash = createHash('sha256').update(text).digest();
  for (let i = 0; i < dims; i++) {
    out[i] = ((hash[i % hash.length]! / 255) * 2 - 1) / Math.sqrt(dims);
  }
  return out;
}

/**
 * Deterministic fixture-driven provider for tests and keyless demos.
 * Never marks candidates as verified.
 */
export class MockProvider implements ModelProvider {
  readonly name = 'mock';

  async extractCandidates(input: ExtractInput): Promise<ExtractOutput> {
    const started = Date.now();
    const candidates: RequirementCandidate[] = [];
    const notes: string[] = [];

    for (const page of input.pages) {
      if (/ignore (all )?(previous|prior) instructions|system prompt/i.test(page.text)) {
        notes.push(`page ${page.pageNumber}: prompt-injection language treated as evidence only`);
      }
      for (const rule of RULES) {
        const match = page.text.match(rule.pattern);
        if (!match) continue;
        const quote = page.text
          .slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + 120)
          .trim();
        candidates.push({
          id: randomUUID(),
          analysisRunId: input.analysisRunId,
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          category: rule.category,
          title: rule.title,
          obligation: quote || rule.title,
          mandatoryClass: rule.mandatoryClass,
          preliminaryPage: page.pageNumber,
          evidenceQuote: quote.slice(0, 500),
          confidence: 0.55,
          ambiguityNotes: [],
          status: 'unverified',
          promptVersion: input.promptVersion || EXTRACTION_PROMPT_VERSION,
          schemaVersion: input.schemaVersion || SCHEMA_VERSION,
          modelId: 'mock-extract-v1',
        });
      }
    }

    // Dedup by category+page
    const seen = new Set<string>();
    const deduped = candidates.filter((c) => {
      const key = `${c.category}:${c.preliminaryPage}:${c.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const promptTokens = input.pages.reduce((n, p) => n + Math.ceil(p.text.length / 4), 0);
    const completionTokens = deduped.length * 40;
    return {
      candidates: deduped,
      providerRequestId: `mock-${randomUUID()}`,
      modelId: 'mock-extract-v1',
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      ...(notes.length ? { notes: notes.join('; ') } : {}),
    };
  }

  async embed(texts: string[]) {
    const tokens = texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0);
    return {
      vectors: texts.map((t) => pseudoEmbed(t)),
      modelId: 'mock-embed-v1',
      tokens,
      estimatedCostUsd: estimateEmbedCost(tokens) * 0,
      requestId: `mock-embed-${randomUUID()}`,
    };
  }
}

// silence unused import warning for categories in docs
void REQUIREMENT_CATEGORIES;
