/**
 * FAC115 verification from a frozen extraction population under an expected-budget
 * authorization. Does not require the pessimistic 3x plan reserve to fit; still fails
 * closed if the authorized verification cap would be exceeded mid-run.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  OpenAIProvider,
  addExplicitAmendmentContext,
  estimateChatCost,
  findExplicitPortalDeadlineReplacements,
  officialPortalHtmlToText,
  precedenceForExplicitDeadline,
  runCandidateVerificationPipeline,
  scorePublicKnownAnswers,
  selectCandidateContexts,
} from '../packages/ai/src/index.ts';
import type { RequirementCandidate } from '../packages/ai/src/schemas.ts';
import { PdfJsParserAdapter } from '../packages/documents/src/parser/pdfjs-adapter.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const FIXTURE = 'massachusetts-fac115-category1-public-rfp-v1';
const ROOT = resolve('fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375');
const SOURCE = resolve(ROOT, 'source');
const RENDITIONS = resolve(ROOT, 'renditions/pdf');
const POPULATION_PATH = resolve(
  'artifacts/evaluation/public-rfp-fac115-population-5d2401ea-f042-4c3c-a6f8-f6c3dfb94fd0.json',
);
const EXTRACT_MODEL = 'gpt-5.4-mini-2026-03-17';
const VERIFY_MODEL = 'gpt-5.5-2026-04-23';
const PHASE3_CEILING_USD = 10;
const DEFAULT_VERIFY_CAP_USD = 9.27;

if (process.env.PUBLIC_RFP_FAC115_LIVE_VERIFY !== '1')
  throw new Error('PUBLIC_RFP_FAC115_LIVE_VERIFY=1 is required');
if (process.env.PUBLIC_RFP_EXPECTED_BUDGET_MODE !== '1')
  throw new Error(
    'PUBLIC_RFP_EXPECTED_BUDGET_MODE=1 is required for this expected-budget verification path',
  );

const verifyCapUsd = Number(process.env.PUBLIC_RFP_VERIFICATION_MAX_USD ?? DEFAULT_VERIFY_CAP_USD);
if (!Number.isFinite(verifyCapUsd) || verifyCapUsd <= 0)
  throw new Error('PUBLIC_RFP_VERIFICATION_MAX_USD must be a positive number');

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey || apiKey.length < 20) throw new Error('OPENAI_API_KEY is absent or invalid');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Supabase spend-ledger runtime is unavailable');
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const population = JSON.parse(await readFile(POPULATION_PATH, 'utf8')) as {
  analysisRunId: string;
  renditionHashes: Record<string, string>;
  sourceHashes: Record<string, string>;
  quoteGate: { acceptedCandidateIds: string[] };
  candidates: RequirementCandidate[];
  verificationPlan: { populationHash: string; plannedMaximumUsd: number; candidateCount: number };
};

const acceptedIds = new Set(population.quoteGate.acceptedCandidateIds);
const selected = population.candidates.filter((candidate) => acceptedIds.has(candidate.id));
if (selected.length !== population.verificationPlan.candidateCount)
  throw new Error('Frozen accepted population does not match verification plan count');

const parser = new PdfJsParserAdapter();
const pdfOrder = [
  'FAC115_Request_for_Response_03.29.2022.pdf',
  'FAC115_Attachment_A_Bidder_Response_Form_03.29.2022.pdf',
  'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf',
  'FAC115_Attachment_D_SDP_Form_03.29.2022.pdf',
  'FAC115_Attachment_E_Prompt_Pay_Discount_Form_03.29.2022.pdf',
  'FAC115_Creating_a_Quote_in_COMMBUYS_Job_Aid_03.29.2022.pdf',
  'Intent_to_Bid_Notice_FAC115.pdf',
];
const typeByPdf: Record<string, string> = {
  'FAC115_Request_for_Response_03.29.2022.pdf': 'primary_rfr',
  'FAC115_Attachment_A_Bidder_Response_Form_03.29.2022.pdf': 'bidder_response_form',
  'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf': 'amended_price_sheet',
  'FAC115_Attachment_D_SDP_Form_03.29.2022.pdf': 'supplier_diversity_form',
  'FAC115_Attachment_E_Prompt_Pay_Discount_Form_03.29.2022.pdf': 'prompt_payment_form',
  'FAC115_Creating_a_Quote_in_COMMBUYS_Job_Aid_03.29.2022.pdf': 'submission_job_aid',
  'Intent_to_Bid_Notice_FAC115.pdf': 'superseded_intent_notice',
};

const documents: Array<{
  id: string;
  name: string;
  type: string;
  pages: Array<{ pageNumber: number; text: string }>;
}> = [];
for (const [index, name] of pdfOrder.entries()) {
  const bytes = new Uint8Array(await readFile(resolve(RENDITIONS, name)));
  if (hash(bytes) !== population.renditionHashes[name])
    throw new Error(`Rendition hash mismatch: ${name}`);
  const parsed = await parser.parse(bytes, { maxPages: 100, timeoutMs: 120_000 });
  documents.push({
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name,
    type: typeByPdf[name]!,
    pages: parsed.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
  });
}
const portalBytes = new Uint8Array(
  await readFile(resolve(SOURCE, 'official-solicitation-page.html')),
);
if (hash(portalBytes) !== population.sourceHashes['official-solicitation-page.html'])
  throw new Error('Portal hash mismatch');
const portalText = officialPortalHtmlToText(new TextDecoder().decode(portalBytes));
const portalDocument = {
  id: '80000000-0000-4000-8000-000000000008',
  name: 'official-solicitation-page.html',
  type: 'amendment_portal',
  pages: [{ pageNumber: 1, text: portalText }],
};
documents.push(portalDocument);

const contexts = documents.flatMap((document) =>
  document.pages.map((page) => ({
    chunkId: `${document.id}:${page.pageNumber}`,
    documentId: document.id,
    documentType: document.type,
    pageNumber: page.pageNumber,
    text: page.text,
    extractionStatus: 'ok' as const,
    parserWarnings: [] as string[],
    retrievalReason: 'public_fixture_page',
  })),
);
const portalContext = contexts.find((context) => context.documentId === portalDocument.id)!;
const explicitDeadlineReplacements = findExplicitPortalDeadlineReplacements(portalText);
const contextsForCandidate = (candidate: RequirementCandidate) =>
  addExplicitAmendmentContext(candidate, contexts, portalContext, explicitDeadlineReplacements);

const conferencePrecedence = (candidate: RequirementCandidate): 'active' | 'superseded' | null => {
  const text = `${candidate.title} ${candidate.obligation}`;
  if (!/conference|pre-bid|bidder'?s? conference/i.test(text)) return null;
  if (/March\s+31/i.test(text) && /2022/.test(text)) return 'superseded';
  if (/April\s+5/i.test(text) && /2022/.test(text)) return 'active';
  return null;
};

const { data: ledger, error: ledgerError } = await admin
  .from('spend_ledger')
  .select('estimated_cost_usd,note,phase');
if (ledgerError) throw ledgerError;
const priorVerifySpend = (ledger ?? [])
  .filter((row) => String(row.note ?? '') === `public-rfp-test:${FIXTURE}:verify`)
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
if (priorVerifySpend > 0)
  throw new Error(
    `FAC115 verification already has $${priorVerifySpend.toFixed(6)} spend; refusing a repeat`,
  );
const phase3Spend = (ledger ?? [])
  .filter((row) => row.phase === 'phase3')
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
const phase3Remaining = PHASE3_CEILING_USD - phase3Spend;
const effectiveCapUsd = Math.min(verifyCapUsd, phase3Remaining);

console.info(
  JSON.stringify({
    stage: 'public_rfp_fac115_verification_preflight',
    fixture: FIXTURE,
    analysisRunId: population.analysisRunId,
    acceptedCandidates: selected.length,
    pessimisticPlanUsd: population.verificationPlan.plannedMaximumUsd,
    authorizedVerificationCapUsd: verifyCapUsd,
    phase3RemainingUsd: Number(phase3Remaining.toFixed(6)),
    effectiveCapUsd: Number(effectiveCapUsd.toFixed(6)),
    expectedBudgetMode: true,
    populationHash: population.verificationPlan.populationHash,
  }),
);

if (effectiveCapUsd < 1)
  throw new Error(`Effective verification cap too low: $${effectiveCapUsd.toFixed(6)}`);
if (process.argv.includes('--preflight-only')) process.exit(0);

let actualCost = 0;
let calls = 0;
const usage: Array<Record<string, unknown>> = [];
const ensureCallFits = (maximum: number) => {
  if (actualCost + maximum > effectiveCapUsd + 1e-9)
    throw new Error(
      `Budget stop before provider call: $${actualCost.toFixed(6)} + $${maximum.toFixed(6)} > $${effectiveCapUsd.toFixed(6)}`,
    );
  if (phase3Spend + actualCost + maximum > PHASE3_CEILING_USD + 1e-9)
    throw new Error('Budget stop before provider call: phase3 ceiling would be exceeded');
};
const record = async (
  stage: string,
  call: {
    estimatedCostUsd: number;
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    cachedTokens: number;
    latencyMs: number;
    retries: number;
    repairAttempts: number;
    schemaAdherent: boolean;
    incomplete?: boolean;
    refused?: boolean;
  },
) => {
  actualCost += call.estimatedCostUsd;
  calls += 1 + call.retries;
  if (actualCost > effectiveCapUsd + 1e-9)
    throw new Error('Provider cost crossed authorized FAC115 verification cap');
  const { error } = await admin.from('spend_ledger').insert({
    phase: 'phase3',
    kind: 'verify',
    estimated_cost_usd: call.estimatedCostUsd,
    note: `public-rfp-test:${FIXTURE}:verify`,
  });
  if (error) throw error;
  usage.push({ stage, ...call });
};

const verificationProvider = new OpenAIProvider({
  apiKey,
  extractModel: EXTRACT_MODEL,
  verifyModel: VERIFY_MODEL,
  reasoningEffort: 'low',
  verifyReasoningEffort: 'low',
  timeoutMs: 90_000,
});
const workspaceId = '80000000-0000-4000-8000-000000000100';
const verificationRunId = randomUUID();
const verification = [];
let stoppedEarly: string | null = null;

for (const [index, candidate] of selected.entries()) {
  const candidateContexts = contextsForCandidate(candidate);
  const selectedContexts = selectCandidateContexts(candidate, candidateContexts, 2);
  const inputTokens =
    selectedContexts.reduce((sum, context) => sum + Math.ceil(context.text.length / 4), 0) + 2500;
  // Expected-budget mode: reserve one pass, not the pessimistic 3x pad that produced the $88 figure.
  const reserveA = estimateChatCost(inputTokens, 1800, VERIFY_MODEL);
  const reserveB = estimateChatCost(inputTokens, 1600, VERIFY_MODEL);
  try {
    const result = await runCandidateVerificationPipeline({
      provider: verificationProvider,
      workspaceId,
      analysisRunId: population.analysisRunId,
      verificationRunId,
      candidate,
      availableContexts: candidateContexts,
      maxContexts: 2,
      entailmentMaxOutputTokens: 1800,
      challengeMaxOutputTokens: 1600,
      beforeEntailment: () => ensureCallFits(reserveA),
      beforeChallenge: () => ensureCallFits(reserveB),
      onEntailmentCall: (call) => record(`entailment:${candidate.id}`, call),
      onChallengeCall: (call) => record(`challenge:${candidate.id}`, call),
    });
    const explicitPrecedence = precedenceForExplicitDeadline(
      candidate,
      explicitDeadlineReplacements,
    );
    const conference = conferencePrecedence(candidate);
    const precedenceStatus =
      conference ??
      (explicitPrecedence !== 'undetermined'
        ? explicitPrecedence
        : result.finalAssessment?.precedenceStatus);
    verification.push({
      ...result,
      finalAssessment:
        result.finalAssessment && precedenceStatus
          ? { ...result.finalAssessment, precedenceStatus }
          : result.finalAssessment,
    });
  } catch (error) {
    stoppedEarly =
      error instanceof Error ? error.message : 'verification stopped on unknown budget error';
    console.info(
      JSON.stringify({
        stage: 'public_rfp_fac115_verification_budget_stop',
        completedCandidates: verification.length,
        remainingCandidates: selected.length - index,
        actualCostUsd: Number(actualCost.toFixed(6)),
        reason: stoppedEarly,
      }),
    );
    break;
  }
  if ((index + 1) % 25 === 0 || index + 1 === selected.length) {
    console.info(
      JSON.stringify({
        stage: 'public_rfp_fac115_verification_progress',
        completed: index + 1,
        total: selected.length,
        actualCostUsd: Number(actualCost.toFixed(6)),
      }),
    );
  }
}

const expected = JSON.parse(await readFile(resolve(ROOT, 'known-answers.json'), 'utf8')) as {
  expected: Array<{
    id: string;
    status: 'active' | 'superseded';
    document: string;
    page: number | null;
    summary: string;
  }>;
};
const knownAnswerMatchers = JSON.parse(
  await readFile(resolve(ROOT, 'known-answer-matchers-v2.json'), 'utf8'),
) as { matchers: Array<{ id: string; patterns: string[] }> };
const assessmentByCandidateId = new Map(
  verification.flatMap((result) =>
    result.finalAssessment
      ? [
          [
            result.candidate.id,
            {
              sourceSupportStatus: result.finalAssessment.sourceSupportStatus,
              precedenceStatus: result.finalAssessment.precedenceStatus,
            },
          ] as const,
        ]
      : [],
  ),
);
const knownAnswerScore = scorePublicKnownAnswers({
  expected: expected.expected,
  matchers: knownAnswerMatchers.matchers,
  candidates: selected,
  documents,
  assessmentByCandidateId,
});
const verificationCompleted = verification.filter(
  (result) => result.finalAssessment && !result.failedStage,
).length;
const verificationFailed = verification.length - verificationCompleted;
const incomplete = selected.length - verification.length;
const evaluationComplete =
  incomplete === 0 &&
  verificationFailed === 0 &&
  knownAnswerScore.passed === knownAnswerScore.total;

const artifact = {
  artifactVersion: 'public-rfp-live-evaluation-v2',
  generatedAt: new Date().toISOString(),
  fixture: FIXTURE,
  solicitationId: 'BD-22-1080-OSD03-SRC01-70375',
  publicOnly: true,
  expectedBudgetMode: true,
  populationArtifact: POPULATION_PATH,
  populationHash: population.verificationPlan.populationHash,
  analysisRunId: population.analysisRunId,
  verificationRunId,
  models: { extraction: EXTRACT_MODEL, verification: VERIFY_MODEL, reasoning: 'low' },
  budget: {
    authorizedVerificationCapUsd: verifyCapUsd,
    effectiveCapUsd,
    pessimisticPlanUsd: population.verificationPlan.plannedMaximumUsd,
    actualVerificationCostUsd: actualCost,
    stoppedEarly,
  },
  outcome: {
    completed: evaluationComplete,
    verificationCompleted,
    verificationFailed,
    incomplete,
    knownAnswersPassed: knownAnswerScore.passed,
    knownAnswersTotal: knownAnswerScore.total,
  },
  totals: {
    documents: documents.length,
    pages: documents.reduce((n, document) => n + document.pages.length, 0),
    acceptedCandidates: selected.length,
    verifiedCandidates: verification.length,
    providerCalls: calls,
  },
  expectedAnswers: expected.expected,
  knownAnswerScore,
  verification: verification.map((result) => ({
    candidate: result.candidate,
    contexts: result.contexts.map((context) => ({
      documentId: context.documentId,
      pageNumber: context.pageNumber,
      chunkId: context.chunkId,
    })),
    facts: result.facts,
    entailment: result.entailment,
    challenge: result.challenge,
    finalAssessment: result.finalAssessment,
    failedStage: result.failedStage,
    error: result.error,
  })),
  usage,
};

await mkdir(resolve('artifacts/evaluation'), { recursive: true });
const artifactPath = resolve(
  'artifacts/evaluation',
  `public-rfp-fac115-${population.analysisRunId}.json`,
);
await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
console.info(
  JSON.stringify({
    stage: 'public_rfp_fac115_verification_complete',
    completed: evaluationComplete,
    artifactPath,
    verificationCompleted,
    verificationFailed,
    incomplete,
    knownAnswersPassed: knownAnswerScore.passed,
    knownAnswersTotal: knownAnswerScore.total,
    actualCostUsd: Number(actualCost.toFixed(6)),
    stoppedEarly,
  }),
);
if (!evaluationComplete) process.exitCode = 1;
