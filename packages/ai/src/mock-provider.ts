import { createHash, randomUUID } from 'node:crypto';
import { estimateEmbedCost } from './cost';
import type {
  ExtractInput,
  ExtractOutput,
  CandidateAssessmentInput,
  ChallengeInput,
  ChallengeOutput,
  DuplicatePairInput,
  DuplicatePairOutput,
  EntailmentOutput,
  ModelProvider,
  VerifyInput,
  VerifyOutput,
} from './provider';
import { EXTRACTION_PROMPT_VERSION } from './prompts';
import {
  REQUIREMENT_CATEGORIES,
  SCHEMA_VERSION,
  type RequirementCandidate,
  type RequirementCategory,
} from './schemas';
import {
  classifyDuplicateRelationship,
  classifyProofRequirement,
  parseDeterministicDate,
  parseDeterministicNumbers,
} from './deterministic-verification';

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
      reasoningTokens: 0,
      cachedTokens: 0,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 0,
      schemaAdherent: true,
      ...(notes.length ? { notes: notes.join('; ') } : {}),
    };
  }

  async assessEntailment(input: CandidateAssessmentInput): Promise<EntailmentOutput> {
    const started = Date.now();
    const { candidate, factEnvelope } = input;
    const cited = input.contexts.find(
      (context) =>
        context.documentId === candidate.documentId &&
        context.pageNumber === candidate.preliminaryPage,
    );
    const valueMismatch = factEnvelope.comparisons.some(
      (comparison) => comparison.comparison === 'mismatch',
    );
    const explicitConflict = Boolean(
      cited &&
      ((/may .*email/i.test(candidate.obligation) && /email .*not accepted/i.test(cited.text)) ||
        (/mandatory|must|required/i.test(candidate.obligation) &&
          /not required|no .*meeting .*required|creates no .*obligation/i.test(cited.text))),
    );
    const partial = Boolean(
      cited &&
      ((/every .*employee/i.test(candidate.obligation) && /site supervisor/i.test(cited.text)) ||
        factEnvelope.atomicRelationship.kind === 'parent_missing_material_condition'),
    );
    const injection = /system prompt|api key|use tools|email the key|ignore .*instructions/i.test(
      candidate.obligation,
    );
    const unsupported =
      /bid bond/i.test(candidate.obligation) && !/bid bond/i.test(cited?.text ?? '');
    const falseConflict =
      /unresolved|conflicting/i.test(candidate.obligation) &&
      /superseded|not active/i.test(cited?.text ?? '');
    const classification = !factEnvelope.parserReliable
      ? ('parser_uncertain' as const)
      : injection
        ? ('insufficient' as const)
        : explicitConflict || valueMismatch || falseConflict
          ? ('contradicts' as const)
          : partial
            ? ('partially_entails' as const)
            : unsupported
              ? ('insufficient' as const)
              : ['exact', 'normalized_exact'].includes(factEnvelope.candidateQuoteMatch.matchType)
                ? ('entails' as const)
                : ('insufficient' as const);
    const evidence =
      cited && candidate.evidenceQuote
        ? [
            {
              documentId: cited.documentId,
              pageNumber: cited.pageNumber,
              quote: candidate.evidenceQuote,
            },
          ]
        : [];
    const result = {
      candidateId: candidate.id,
      classification,
      rationale:
        classification === 'entails'
          ? 'The cited source entails the candidate.'
          : classification === 'partially_entails'
            ? 'The source supports the central obligation but omits a material qualifier.'
            : classification === 'contradicts'
              ? 'The source explicitly conflicts with a material candidate value or assertion.'
              : classification === 'parser_uncertain'
                ? 'Parser quality prevents assessment.'
                : 'The bounded evidence is insufficient.',
      supportingEvidence: ['entails', 'partially_entails'].includes(classification) ? evidence : [],
      contradictingEvidence: classification === 'contradicts' ? evidence : [],
      materialQualifiersPresent: [],
      missingOrOverstatedQualifiers:
        classification === 'partially_entails'
          ? [
              factEnvelope.atomicRelationship.kind === 'parent_missing_material_condition'
                ? factEnvelope.atomicRelationship.evidence!
                : 'employee scope exceeds supervisor scope',
            ]
          : [],
      parserConcerns: classification === 'parser_uncertain' ? factEnvelope.parserWarnings : [],
      descriptiveOnly: false as const,
      injectionInfluence: false as const,
      machineOnly: true as const,
    };
    const promptTokens = input.contexts.reduce((sum, context) => sum + context.text.length / 4, 0);
    return {
      result,
      providerRequestId: `mock-entailment-${randomUUID()}`,
      modelId: 'mock-verify-v3',
      promptTokens: Math.ceil(promptTokens),
      completionTokens: 90,
      reasoningTokens: 0,
      cachedTokens: 0,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 0,
      schemaAdherent: true,
    };
  }

  async challengeEntailment(input: ChallengeInput): Promise<ChallengeOutput> {
    const started = Date.now();
    const mismatch = input.factEnvelope.comparisons.find(
      (comparison) => comparison.comparison === 'mismatch',
    );
    const parserBad = !input.factEnvelope.parserReliable;
    const descriptive = input.factEnvelope.descriptiveOrInjectionLanguage;
    const cited = input.contexts.find(
      (context) =>
        context.documentId === input.candidate.documentId &&
        context.pageNumber === input.candidate.preliminaryPage,
    );
    const assessment = parserBad
      ? ('parser_uncertain' as const)
      : descriptive
        ? ('insufficient_evidence' as const)
        : mismatch
          ? ('contradictory_evidence' as const)
          : input.entailment.missingOrOverstatedQualifiers.length
            ? ('material_qualification_missing' as const)
            : ('no_material_objection' as const);
    return {
      result: {
        candidateId: input.candidate.id,
        assessment,
        rationale:
          assessment === 'no_material_objection'
            ? 'No material objection remains after deterministic checks.'
            : 'The adversarial mock found a conservative objection.',
        objections:
          assessment === 'no_material_objection'
            ? []
            : [
                {
                  type: mismatch
                    ? ('wrong_amount_or_unit' as const)
                    : parserBad
                      ? ('parser_quality' as const)
                      : ('insufficient_evidence' as const),
                  candidateProposition: input.candidate.obligation.slice(0, 120),
                  qualifierOrConflict: String(
                    mismatch?.sourceOriginal ?? mismatch?.candidateOriginal ?? 'bounded evidence',
                  ).slice(0, 100),
                  materialEffect: (mismatch
                    ? 'Deterministic candidate/source values disagree.'
                    : 'The proposed positive finding cannot safely stand.'
                  ).slice(0, 140),
                  evidence:
                    cited?.text && cited.text.length
                      ? [
                          {
                            documentId: cited.documentId,
                            pageNumber: cited.pageNumber,
                            quote: cited.text.slice(0, 240),
                          },
                        ]
                      : [],
                },
              ],
        injectionInfluence: false,
        machineOnly: true,
      },
      providerRequestId: `mock-challenge-${randomUUID()}`,
      modelId: 'mock-verify-v3',
      promptTokens: Math.ceil(
        input.contexts.reduce((sum, context) => sum + context.text.length / 4, 0),
      ),
      completionTokens: 70,
      reasoningTokens: 0,
      cachedTokens: 0,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 0,
      schemaAdherent: true,
    };
  }

  async classifyDuplicatePair(input: DuplicatePairInput): Promise<DuplicatePairOutput> {
    const started = Date.now();
    const deterministic = classifyDuplicateRelationship(input.source, input.target);
    const sharedExhibitC =
      /exhibit c/i.test(input.source.obligation) && /exhibit c/i.test(input.target.obligation);
    const relationshipType = input.deterministicMaterialDifferences.length
      ? ('related_distinct' as const)
      : sharedExhibitC
        ? ('restatement' as const)
        : deterministic === 'uncertain'
          ? ('uncertain' as const)
          : deterministic;
    return {
      result: {
        sourceCandidateId: input.source.id,
        targetCandidateId: input.target.id,
        relationshipType,
        rationale: input.deterministicMaterialDifferences.length
          ? 'Material differences require related-but-distinct treatment.'
          : 'Deterministic mock pair classification.',
        materialDifferences: input.deterministicMaterialDifferences,
        machineOnly: true,
      },
      providerRequestId: `mock-duplicate-${randomUUID()}`,
      modelId: 'mock-verify-v3',
      promptTokens: 80,
      completionTokens: 40,
      reasoningTokens: 0,
      cachedTokens: 0,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 0,
      schemaAdherent: true,
    };
  }

  async verifyCandidates(input: VerifyInput): Promise<VerifyOutput> {
    const started = Date.now();
    const findings = input.candidates.map((candidate) => {
      const context = input.contexts.find(
        (c) => c.documentId === candidate.documentId && c.pageNumber === candidate.preliminaryPage,
      );
      const quoteFound = Boolean(
        context && candidate.evidenceQuote && context.text.includes(candidate.evidenceQuote),
      );
      const parserBad =
        !context || context.extractionStatus === 'empty' || context.extractionStatus === 'error';
      const injectionCandidate =
        /system prompt|api key|use tools|email the key|ignore .*instructions/i.test(
          candidate.obligation,
        );
      const explicitConflict = Boolean(
        context &&
        ((/may .*email/i.test(candidate.obligation) &&
          /email .*not accepted/i.test(context.text)) ||
          (/mandatory|must|required/i.test(candidate.obligation) &&
            /not required|creates no .*obligation/i.test(context.text))),
      );
      const candidateDate = parseDeterministicDate(candidate.obligation);
      const sourceDate = context ? parseDeterministicDate(context.text) : null;
      const dateMismatch = Boolean(
        candidateDate.normalized &&
        sourceDate?.normalized &&
        candidateDate.normalized !== sourceDate.normalized,
      );
      const candidateNumbers = parseDeterministicNumbers(candidate.obligation).filter(
        (item) => item.unit,
      );
      const sourceNumbers = context
        ? parseDeterministicNumbers(context.text).filter((item) => item.unit)
        : [];
      const numberMismatch = candidateNumbers.some((item) =>
        sourceNumbers.some(
          (source) => source.unit === item.unit && source.normalizedValue !== item.normalizedValue,
        ),
      );
      const partial = Boolean(
        context &&
        ((/every .*employee/i.test(candidate.obligation) &&
          /site supervisor/i.test(context.text)) ||
          (/meeting/i.test(candidate.obligation) &&
            /disqualif/i.test(context.text) &&
            !/disqualif/i.test(candidate.obligation))),
      );
      const superseded = input.contexts.some(
        (item) =>
          /supersed|replace/i.test(item.text) &&
          candidateNumbers.some((number) => item.text.includes(number.original)),
      );
      const sourceSupportStatus = parserBad
        ? ('parser_uncertain' as const)
        : injectionCandidate
          ? ('unsupported' as const)
          : explicitConflict || dateMismatch || numberMismatch
            ? ('contradicted' as const)
            : partial
              ? ('partially_supported' as const)
              : quoteFound
                ? ('supported' as const)
                : ('unsupported' as const);
      const duplicateProposals = input.candidates
        .filter((other) => other.id !== candidate.id)
        .map((other) => ({
          other,
          relationshipType: classifyDuplicateRelationship(candidate, other),
        }))
        .filter((item) =>
          ['exact_duplicate', 'semantic_duplicate', 'restatement'].includes(item.relationshipType),
        )
        .map((item) => ({
          candidateId: item.other.id,
          relationshipType: item.relationshipType,
          rationale: 'Deterministic mock duplicate signal.',
        }));
      return {
        candidateId: candidate.id,
        sourceSupportStatus,
        precedenceStatus:
          parserBad || injectionCandidate || sourceSupportStatus === 'unsupported'
            ? ('undetermined' as const)
            : superseded || /old requirement/i.test(candidate.obligation)
              ? ('superseded' as const)
              : ('active' as const),
        proofRequirement: parserBad
          ? ('undetermined' as const)
          : classifyProofRequirement(candidate.obligation),
        rationale: parserBad
          ? 'Parser state prevents reliable assessment.'
          : injectionCandidate
            ? 'Document prompt-injection language is not a procurement obligation.'
            : explicitConflict || dateMismatch || numberMismatch
              ? 'The cited source conflicts with a material candidate statement.'
              : partial
                ? 'The source supports only part of the candidate scope or conditions.'
                : quoteFound
                  ? 'Candidate quote occurs on the cited page.'
                  : 'No validated supporting quote was found.',
        supportingEvidence:
          quoteFound &&
          context &&
          ['supported', 'partially_supported'].includes(sourceSupportStatus)
            ? [
                {
                  documentId: context.documentId,
                  pageNumber: context.pageNumber,
                  quote: candidate.evidenceQuote,
                },
              ]
            : [],
        contradictingEvidence:
          quoteFound && context && sourceSupportStatus === 'contradicted'
            ? [
                {
                  documentId: context.documentId,
                  pageNumber: context.pageNumber,
                  quote: candidate.evidenceQuote,
                },
              ]
            : [],
        addendumEvidence: [],
        materialMismatches: [],
        deterministicFacts: [],
        duplicateProposals,
        parserConcerns: parserBad ? ['Missing or damaged parser output'] : [],
        ambiguityNotes: [],
        machineOnly: true as const,
      };
    });
    const promptTokens = input.contexts.reduce((n, c) => n + Math.ceil(c.text.length / 4), 0);
    return {
      findings,
      providerRequestId: `mock-verify-${randomUUID()}`,
      modelId: 'mock-verify-v1',
      promptTokens,
      completionTokens: findings.length * 80,
      reasoningTokens: 0,
      cachedTokens: 0,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 0,
      schemaAdherent: true,
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
