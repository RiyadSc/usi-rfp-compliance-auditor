/** Controlled public-only evaluation for San Bernardino County AGENCY23-PURC-5020. */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  EXTRACTION_PROMPT_VERSION,
  SCHEMA_VERSION,
  OpenAIProvider,
  addExplicitAmendmentContext,
  buildPublicExtractionBatches,
  estimateChatCost,
  findExplicitPortalDeadlineReplacements,
  gatePreliminaryCandidateQuotes,
  officialPortalHtmlToText,
  precedenceForExplicitDeadline,
  runCandidateVerificationPipeline,
  scorePublicKnownAnswers,
  selectCandidateContexts,
} from '../packages/ai/src/index.ts';
import { PdfJsParserAdapter } from '../packages/documents/src/parser/pdfjs-adapter.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const FIXTURE = 'sbcounty-security-public-rfp-v2';
const ROOT = resolve('fixtures/public-rfp/san-bernardino-security-AGENCY23-PURC-5020');
const SOURCE = resolve(ROOT, 'source');
const MAX_USD = 3;
const PHASE3_CEILING_USD = 10;
const PHASE4_CEILING_USD = 15;
const EXTRACT_MODEL = 'gpt-5.4-mini-2026-03-17';
const VERIFY_MODEL = 'gpt-5.5-2026-04-23';
const expectedHashes: Record<string, string> = {
  'addendum-2-current-rates.pdf':
    '5dbcc92e4421a4da7519b5259402462320c8e63e222ec8e36e55c81df01811c7',
  'addendum-2-questions-and-answers.pdf':
    '29ef288d38c9b47f8a7f2bab32a85c76957b95e0af1deaf7d731f8dd937fb690',
  'addendum-3-language-update.pdf':
    'c48360a6e54b785997c4960f08f73a1e932cfcef80940912ff99b829f5afa4fd',
  'attachment-e-proposal-cost-sheet.pdf':
    'f48ee1dd782647f5cea3ce834a8cdb06c0d3fdce85eb4a7ff2bcf3bd675ada14',
  'exhibit-b-county-locations.pdf':
    'f857d232af5a24964905345f067e1b9edc2b5bfb06972110b32460704453a33b',
  'main-rfp.pdf': '59c2e6bbdb197afb7a3da20e794fb72b1c9dd753a7d7f69064bc66edddb2c49b',
  'official-solicitation-page.html':
    '764f3a6df4135dcd8a0ae549df7c4ca306277f51b696153cb03a9c4b860c8953',
};

if (process.env.PUBLIC_RFP_LIVE_EVAL !== '1') throw new Error('PUBLIC_RFP_LIVE_EVAL=1 is required');
if (Number(process.env.PUBLIC_RFP_TEST_MAX_USD ?? MAX_USD) !== MAX_USD)
  throw new Error('PUBLIC_RFP_TEST_MAX_USD must equal the approved $3.00 cap');
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey || apiKey.length < 20) throw new Error('OPENAI_API_KEY is absent or invalid');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Supabase spend-ledger runtime is unavailable');
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const files = (await readdir(SOURCE)).filter((name) => name.endsWith('.pdf')).sort();
if (files.length !== 6) throw new Error(`Expected exactly six PDFs; found ${files.length}`);
const parser = new PdfJsParserAdapter();
const documents: Array<{
  id: string;
  name: string;
  type: string;
  pages: Array<{ pageNumber: number; text: string }>;
}> = [];
for (const [index, name] of files.entries()) {
  const bytes = new Uint8Array(await readFile(resolve(SOURCE, name)));
  if (hash(bytes) !== expectedHashes[name]) throw new Error(`Public source hash mismatch: ${name}`);
  const parsed = await parser.parse(bytes, { maxPages: 100, timeoutMs: 120_000 });
  if (parsed.warnings.length)
    throw new Error(`Parser warning in ${name}: ${parsed.warnings.join('; ')}`);
  documents.push({
    id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name,
    type:
      name === 'main-rfp.pdf'
        ? 'primary_rfp'
        : name.startsWith('addendum')
          ? 'addendum'
          : 'attachment',
    pages: parsed.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
  });
}
const portalBytes = new Uint8Array(
  await readFile(resolve(SOURCE, 'official-solicitation-page.html')),
);
if (hash(portalBytes) !== expectedHashes['official-solicitation-page.html'])
  throw new Error('Public source hash mismatch: official-solicitation-page.html');
const portalText = officialPortalHtmlToText(new TextDecoder().decode(portalBytes));
const portalDocument = {
  id: '70000000-0000-4000-8000-000000000007',
  name: 'official-solicitation-page.html',
  type: 'amendment_portal',
  pages: [{ pageNumber: 1, text: portalText }],
};
documents.push(portalDocument);
const explicitDeadlineReplacements = findExplicitPortalDeadlineReplacements(portalText);
if (explicitDeadlineReplacements.length !== 2)
  throw new Error('Expected two explicit portal deadline replacements');
const extractionBatches = buildPublicExtractionBatches(documents, {
  maxPages: 8,
  maxEstimatedTokens: 14_000,
});

const { data: ledger, error: ledgerError } = await admin
  .from('spend_ledger')
  .select('estimated_cost_usd,note,phase');
if (ledgerError) throw ledgerError;
const priorPublicSpend = (ledger ?? [])
  .filter((row) => String(row.note ?? '').startsWith(`public-rfp-test:${FIXTURE}:`))
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
const approvedResumeSpend = Number(process.env.PUBLIC_RFP_RESUME_SPEND_USD ?? 0);
if (priorPublicSpend > 0 && Math.abs(priorPublicSpend - approvedResumeSpend) > 0.0000005)
  throw new Error(
    `This fixture already has $${priorPublicSpend.toFixed(6)} live spend; refusing a repeat`,
  );
const phase3Spend = (ledger ?? [])
  .filter((row) => row.phase === 'phase3')
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
const phase4Spend = (ledger ?? [])
  .filter((row) => row.phase === 'phase4')
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
const cumulativeApiSpend = (ledger ?? []).reduce(
  (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
  0,
);
const extractionMaximum = extractionBatches.reduce((sum, batch) => {
  const inputTokens =
    batch.pages.reduce((pageSum, page) => pageSum + Math.ceil(page.text.length / 4), 0) + 1500;
  const outputTokens = 5000;
  return sum + estimateChatCost(inputTokens, outputTokens, EXTRACT_MODEL) * 3;
}, 0);
console.info(
  JSON.stringify({
    stage: 'public_rfp_preflight',
    fixture: FIXTURE,
    documents: documents.length,
    pages: documents.reduce((sum, document) => sum + document.pages.length, 0),
    cumulativeApiSpendUsd: Number(cumulativeApiSpend.toFixed(6)),
    priorPublicTestSpendUsd: Number(priorPublicSpend.toFixed(6)),
    phase3SpendUsd: Number(phase3Spend.toFixed(6)),
    phase4SpendUsd: Number(phase4Spend.toFixed(6)),
    extractionMaximumUsd: Number(extractionMaximum.toFixed(6)),
    extractionBatches: extractionBatches.length,
    explicitDeadlineReplacements,
    completeTestMaximumUsd: MAX_USD,
  }),
);
if (process.argv.includes('--preflight-only')) process.exit(0);

let actualCost = priorPublicSpend;
let phase3RunCost = 0;
let phase4RunCost = 0;
let calls = 0;
const usage: Array<Record<string, unknown>> = [];
const ensureCallFits = (maximum: number, phase: 'phase3' | 'phase4') => {
  if (actualCost + maximum > MAX_USD + 1e-9)
    throw new Error(
      `Budget stop before provider call: $${actualCost.toFixed(6)} + $${maximum.toFixed(6)} > $${MAX_USD}`,
    );
  const phaseTotal = phase === 'phase3' ? phase3Spend + phase3RunCost : phase4Spend + phase4RunCost;
  const ceiling = phase === 'phase3' ? PHASE3_CEILING_USD : PHASE4_CEILING_USD;
  if (phaseTotal + maximum > ceiling + 1e-9)
    throw new Error(`Budget stop before provider call: ${phase} ceiling would be exceeded`);
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
  const phase = stage === 'extract' ? 'phase3' : 'phase4';
  actualCost += call.estimatedCostUsd;
  if (phase === 'phase3') phase3RunCost += call.estimatedCostUsd;
  else phase4RunCost += call.estimatedCostUsd;
  calls += 1 + call.retries;
  if (actualCost > MAX_USD + 1e-9)
    throw new Error('Provider cost crossed approved public-test cap');
  const { error } = await admin.from('spend_ledger').insert({
    phase,
    kind: stage === 'extract' ? 'extract' : 'verify',
    estimated_cost_usd: call.estimatedCostUsd,
    note: `public-rfp-test:${FIXTURE}:${stage}`,
  });
  if (error) throw error;
  usage.push({ stage, ...call });
};

const provider = new OpenAIProvider({
  apiKey,
  extractModel: EXTRACT_MODEL,
  verifyModel: VERIFY_MODEL,
  reasoningEffort: 'low',
  verifyReasoningEffort: 'low',
  timeoutMs: 90_000,
});
const workspaceId = '70000000-0000-4000-8000-000000000100';
const analysisRunId = randomUUID();
const verificationRunId = randomUUID();
const candidates = [];
for (const batch of extractionBatches) {
  const inputTokens =
    batch.pages.reduce((sum, page) => sum + Math.ceil(page.text.length / 4), 0) + 1500;
  const maxOutputTokens = 5000;
  ensureCallFits(estimateChatCost(inputTokens, maxOutputTokens, EXTRACT_MODEL) * 3, 'phase3');
  const output = await provider.extractCandidates({
    workspaceId,
    documentId: batch.documentId,
    analysisRunId,
    pages: batch.pages,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    maxOutputTokens,
  });
  await record('extract', output);
  if (!output.schemaAdherent || output.incomplete || output.refused || output.repairAttempts > 0)
    throw new Error(`Extraction failed closed for ${batch.id}`);
  candidates.push(...output.candidates);
}

const uniqueCandidates = [
  ...new Map(
    candidates.map((candidate) => [
      [
        candidate.documentId,
        candidate.preliminaryPage,
        candidate.category,
        candidate.title.toLowerCase(),
        candidate.obligation.toLowerCase(),
      ].join('|'),
      candidate,
    ]),
  ).values(),
];
const quoteGate = gatePreliminaryCandidateQuotes(uniqueCandidates, documents);
const selected = quoteGate.accepted;
const contexts = documents.flatMap((document) =>
  document.pages.map((page) => ({
    chunkId: `${document.id}:${page.pageNumber}`,
    documentId: document.id,
    documentType: document.type,
    pageNumber: page.pageNumber,
    text: page.text,
    extractionStatus: 'ok',
    parserWarnings: [],
    retrievalReason: 'public_fixture_page',
  })),
);
const verification = [];
const portalContext = contexts.find((context) => context.documentId === portalDocument.id)!;
for (const candidate of selected) {
  const candidateContexts = addExplicitAmendmentContext(
    candidate,
    contexts,
    portalContext,
    explicitDeadlineReplacements,
  );
  const selectedContexts = selectCandidateContexts(candidate, candidateContexts, 2);
  const inputTokens =
    selectedContexts.reduce((sum, context) => sum + Math.ceil(context.text.length / 4), 0) + 2500;
  const reserveA = estimateChatCost(inputTokens, 1800, VERIFY_MODEL) * 3;
  const reserveB = estimateChatCost(inputTokens, 1600, VERIFY_MODEL) * 3;
  const result = await runCandidateVerificationPipeline({
    provider,
    workspaceId,
    analysisRunId,
    verificationRunId,
    candidate,
    availableContexts: candidateContexts,
    maxContexts: 2,
    entailmentMaxOutputTokens: 1800,
    challengeMaxOutputTokens: 1600,
    beforeEntailment: () => ensureCallFits(reserveA, 'phase4'),
    beforeChallenge: () => ensureCallFits(reserveB, 'phase4'),
    onEntailmentCall: (call) => record(`entailment:${candidate.id}`, call),
    onChallengeCall: (call) => record(`challenge:${candidate.id}`, call),
  });
  const explicitPrecedence = precedenceForExplicitDeadline(candidate, explicitDeadlineReplacements);
  verification.push({
    ...result,
    finalAssessment:
      result.finalAssessment && explicitPrecedence !== 'undetermined'
        ? { ...result.finalAssessment, precedenceStatus: explicitPrecedence }
        : result.finalAssessment,
  });
}

const expected = JSON.parse(await readFile(resolve(ROOT, 'known-answers.json'), 'utf8'));
const knownAnswerMatchers = JSON.parse(
  await readFile(resolve(ROOT, 'known-answer-matchers-v2.json'), 'utf8'),
);
const assessmentByCandidateId = new Map(
  verification.map((result) => [
    result.candidate.id,
    {
      sourceSupportStatus: result.finalAssessment?.sourceSupportStatus ?? 'unsupported',
      precedenceStatus: result.finalAssessment?.precedenceStatus ?? 'undetermined',
    },
  ]),
);
const knownAnswerScore = scorePublicKnownAnswers({
  expected: expected.expected,
  matchers: knownAnswerMatchers.matchers,
  candidates: quoteGate.accepted,
  documents,
  assessmentByCandidateId,
});
const artifact = {
  artifactVersion: 'public-rfp-live-evaluation-v2',
  generatedAt: new Date().toISOString(),
  fixture: FIXTURE,
  solicitationId: 'AGENCY23-PURC-5020',
  publicOnly: true,
  sourceHashes: expectedHashes,
  models: { extraction: EXTRACT_MODEL, verification: VERIFY_MODEL, reasoning: 'low' },
  promptVersions: {
    extraction: EXTRACTION_PROMPT_VERSION,
    schema: SCHEMA_VERSION,
    entailment: 'verify-entailment-v7',
    challenge: 'verify-challenge-v4',
  },
  budget: { maximumUsd: MAX_USD, priorPublicSpend, actualCostUsd: actualCost },
  totals: {
    documents: documents.length,
    pages: documents.reduce((n, document) => n + document.pages.length, 0),
    extractedCandidates: candidates.length,
    uniqueCandidates: uniqueCandidates.length,
    rejectedPreliminaryQuotes: quoteGate.rejected.length,
    verifiedCandidates: verification.length,
    providerCalls: calls,
  },
  expectedAnswers: expected.expected,
  knownAnswerScore,
  candidates: uniqueCandidates,
  quoteGate: {
    acceptedCandidateIds: quoteGate.accepted.map((candidate) => candidate.id),
    rejected: quoteGate.rejected.map((item) => ({
      candidateId: item.candidate.id,
      matchType: item.matchType,
    })),
  },
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
const artifactPath = resolve('artifacts/evaluation', `public-rfp-sbcounty-${analysisRunId}.json`);
await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
console.info(
  JSON.stringify({ completed: true, artifactPath, ...artifact.totals, actualCostUsd: actualCost }),
);
