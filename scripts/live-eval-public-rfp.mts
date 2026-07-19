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
  estimateChatCost,
  runCandidateVerificationPipeline,
} from '../packages/ai/src/index.ts';
import { PdfJsParserAdapter } from '../packages/documents/src/parser/pdfjs-adapter.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const FIXTURE = 'sbcounty-security-public-rfp-v1';
const ROOT = resolve('fixtures/public-rfp/san-bernardino-security-AGENCY23-PURC-5020');
const SOURCE = resolve(ROOT, 'source');
const MAX_USD = 3;
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

const { data: ledger, error: ledgerError } = await admin
  .from('spend_ledger')
  .select('estimated_cost_usd,note,phase');
if (ledgerError) throw ledgerError;
const priorPublicSpend = (ledger ?? [])
  .filter((row) => String(row.note ?? '').startsWith(`public-rfp-test:${FIXTURE}:`))
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
if (priorPublicSpend > 0)
  throw new Error(
    `This fixture already has $${priorPublicSpend.toFixed(6)} live spend; refusing a repeat`,
  );
const cumulativeApiSpend = (ledger ?? []).reduce(
  (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
  0,
);
const extractionMaximum = documents.reduce((sum, document) => {
  const inputTokens =
    document.pages.reduce((pageSum, page) => pageSum + Math.ceil(page.text.length / 4), 0) + 1500;
  const outputTokens = document.type === 'primary_rfp' ? 12_000 : 5_000;
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
    extractionMaximumUsd: Number(extractionMaximum.toFixed(6)),
    completeTestMaximumUsd: MAX_USD,
  }),
);
if (process.argv.includes('--preflight-only')) process.exit(0);

let actualCost = 0;
let calls = 0;
const usage: Array<Record<string, unknown>> = [];
const ensureCallFits = (maximum: number) => {
  if (actualCost + maximum > MAX_USD + 1e-9)
    throw new Error(
      `Budget stop before provider call: $${actualCost.toFixed(6)} + $${maximum.toFixed(6)} > $${MAX_USD}`,
    );
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
  if (actualCost > MAX_USD + 1e-9)
    throw new Error('Provider cost crossed approved public-test cap');
  const { error } = await admin.from('spend_ledger').insert({
    phase: null,
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
for (const document of documents) {
  const inputTokens =
    document.pages.reduce((sum, page) => sum + Math.ceil(page.text.length / 4), 0) + 1500;
  const maxOutputTokens = document.type === 'primary_rfp' ? 12_000 : 5_000;
  ensureCallFits(estimateChatCost(inputTokens, maxOutputTokens, EXTRACT_MODEL) * 3);
  const output = await provider.extractCandidates({
    workspaceId,
    documentId: document.id,
    analysisRunId,
    pages: document.pages,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    maxOutputTokens,
  });
  await record('extract', output);
  if (!output.schemaAdherent || output.incomplete || output.refused || output.repairAttempts > 0)
    throw new Error(`Extraction failed closed for ${document.name}`);
  candidates.push(...output.candidates);
}

const priorityPattern =
  /deadline|question|proposal|attachment|form|signature|reference|insurance|liability|license|guard card|cost|epro|conference|evaluation|addendum/i;
const selected = candidates
  .map((candidate) => ({
    candidate,
    score:
      (candidate.mandatoryClass === 'mandatory' ? 2 : 0) +
      (priorityPattern.test(`${candidate.title} ${candidate.obligation}`) ? 2 : 0),
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 20)
  .map((item) => item.candidate);
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
for (const candidate of selected) {
  const own = contexts
    .filter(
      (context) =>
        context.documentId === candidate.documentId &&
        Math.abs(context.pageNumber - candidate.preliminaryPage) <= 1,
    )
    .slice(0, 2);
  const inputTokens =
    own.reduce((sum, context) => sum + Math.ceil(context.text.length / 4), 0) + 2500;
  const reserveA = estimateChatCost(inputTokens, 1800, VERIFY_MODEL) * 3;
  const reserveB = estimateChatCost(inputTokens, 1600, VERIFY_MODEL) * 3;
  const result = await runCandidateVerificationPipeline({
    provider,
    workspaceId,
    analysisRunId,
    verificationRunId,
    candidate,
    availableContexts: contexts,
    maxContexts: 2,
    entailmentMaxOutputTokens: 1800,
    challengeMaxOutputTokens: 1600,
    beforeEntailment: () => ensureCallFits(reserveA),
    beforeChallenge: () => ensureCallFits(reserveB),
    onEntailmentCall: (call) => record(`entailment:${candidate.id}`, call),
    onChallengeCall: (call) => record(`challenge:${candidate.id}`, call),
  });
  verification.push(result);
}

const expected = JSON.parse(await readFile(resolve(ROOT, 'known-answers.json'), 'utf8'));
const artifact = {
  artifactVersion: 'public-rfp-live-evaluation-v1',
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
    verifiedPriorityCandidates: verification.length,
    providerCalls: calls,
  },
  expectedAnswers: expected.expected,
  candidates,
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
