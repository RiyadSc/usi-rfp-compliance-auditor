/** Controlled FAC115 public extraction-only harness. Never starts verification. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  EXTRACTION_PROMPT_VERSION,
  PUBLIC_RFP_EXTRACTION_ARTIFACT_VERSION,
  SCHEMA_VERSION,
  OpenAIProvider,
  addExplicitAmendmentContext,
  buildPublicExtractionBatches,
  buildPublicVerificationPlan,
  estimateChatCost,
  findExplicitPortalDeadlineReplacements,
  gatePreliminaryCandidateQuotes,
  officialPortalHtmlToText,
} from '../packages/ai/src/index.ts';
import { PdfJsParserAdapter } from '../packages/documents/src/parser/pdfjs-adapter.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const FIXTURE = 'massachusetts-fac115-category1-public-rfp-v1';
const ROOT = resolve('fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375');
const SOURCE = resolve(ROOT, 'source');
const RENDITIONS = resolve(ROOT, 'renditions/pdf');
const EXTRACT_MODEL = 'gpt-5.4-mini-2026-03-17';
const VERIFY_MODEL = 'gpt-5.5-2026-04-23';
const PHASE3_CEILING_USD = 10;
const DEFAULT_EXTRACTION_CAP_USD = 0.5;
const EXTRACTION_RETRY_RESERVE = 3;

const sourceManifest = JSON.parse(
  await readFile(resolve(ROOT, 'source-manifest.json'), 'utf8'),
) as {
  sources: Array<{ file: string; sha256: string; type: string; activeForCategory1: boolean }>;
};
const renditionManifest = JSON.parse(
  await readFile(resolve(ROOT, 'renditions/rendition-manifest.json'), 'utf8'),
) as {
  version: string;
  renditions: Array<{ file: string; sha256: string; bytes: number; kind: string }>;
};

if (process.env.PUBLIC_RFP_FAC115_LIVE_EXTRACT !== '1')
  throw new Error('PUBLIC_RFP_FAC115_LIVE_EXTRACT=1 is required');
const extractionCapUsd = Number(
  process.env.PUBLIC_RFP_EXTRACTION_MAX_USD ?? DEFAULT_EXTRACTION_CAP_USD,
);
if (!Number.isFinite(extractionCapUsd) || extractionCapUsd <= 0)
  throw new Error('PUBLIC_RFP_EXTRACTION_MAX_USD must be a positive number');

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey || apiKey.length < 20) throw new Error('OPENAI_API_KEY is absent or invalid');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Supabase spend-ledger runtime is unavailable');
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const expectedSourceHashes = Object.fromEntries(
  sourceManifest.sources.map((source) => [source.file, source.sha256]),
);
const expectedRenditionHashes = Object.fromEntries(
  renditionManifest.renditions.map((rendition) => [rendition.file, rendition.sha256]),
);

for (const source of sourceManifest.sources) {
  const bytes = new Uint8Array(await readFile(resolve(SOURCE, source.file)));
  if (hash(bytes) !== source.sha256) throw new Error(`Source hash mismatch: ${source.file}`);
}

const parser = new PdfJsParserAdapter();
const documents: Array<{
  id: string;
  name: string;
  type: string;
  pages: Array<{ pageNumber: number; text: string }>;
}> = [];

const pdfOrder = [
  'FAC115_Request_for_Response_03.29.2022.pdf',
  'FAC115_Attachment_A_Bidder_Response_Form_03.29.2022.pdf',
  'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf',
  'FAC115_Attachment_D_SDP_Form_03.29.2022.pdf',
  'FAC115_Attachment_E_Prompt_Pay_Discount_Form_03.29.2022.pdf',
  'FAC115_Creating_a_Quote_in_COMMBUYS_Job_Aid_03.29.2022.pdf',
  'Intent_to_Bid_Notice_FAC115.pdf',
];
const presentPdfs = new Set((await readdir(RENDITIONS)).filter((name) => name.endsWith('.pdf')));
for (const name of pdfOrder) {
  if (!presentPdfs.has(name)) throw new Error(`Missing rendition: ${name}`);
}
if (presentPdfs.size !== pdfOrder.length)
  throw new Error(`Expected exactly ${pdfOrder.length} PDFs in renditions/pdf`);

const typeByPdf: Record<string, string> = {
  'FAC115_Request_for_Response_03.29.2022.pdf': 'primary_rfr',
  'FAC115_Attachment_A_Bidder_Response_Form_03.29.2022.pdf': 'bidder_response_form',
  'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf': 'amended_price_sheet',
  'FAC115_Attachment_D_SDP_Form_03.29.2022.pdf': 'supplier_diversity_form',
  'FAC115_Attachment_E_Prompt_Pay_Discount_Form_03.29.2022.pdf': 'prompt_payment_form',
  'FAC115_Creating_a_Quote_in_COMMBUYS_Job_Aid_03.29.2022.pdf': 'submission_job_aid',
  'Intent_to_Bid_Notice_FAC115.pdf': 'superseded_intent_notice',
};

for (const [index, name] of pdfOrder.entries()) {
  const bytes = new Uint8Array(await readFile(resolve(RENDITIONS, name)));
  if (hash(bytes) !== expectedRenditionHashes[name])
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
if (hash(portalBytes) !== expectedSourceHashes['official-solicitation-page.html'])
  throw new Error('Portal hash mismatch');
const portalText = officialPortalHtmlToText(new TextDecoder().decode(portalBytes));
const portalDocument = {
  id: '80000000-0000-4000-8000-000000000008',
  name: 'official-solicitation-page.html',
  type: 'amendment_portal',
  pages: [{ pageNumber: 1, text: portalText }],
};
documents.push(portalDocument);

const extractionBatches = buildPublicExtractionBatches(documents, {
  maxPages: 8,
  maxEstimatedTokens: 14_000,
});
const extractionMaximumUsd = extractionBatches.reduce((sum, batch) => {
  const inputTokens =
    batch.pages.reduce((pageSum, page) => pageSum + Math.ceil(page.text.length / 4), 0) + 1500;
  return sum + estimateChatCost(inputTokens, 5000, EXTRACT_MODEL) * EXTRACTION_RETRY_RESERVE;
}, 0);
const extractionSinglePassUsd = extractionMaximumUsd / EXTRACTION_RETRY_RESERVE;

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

const explicitDeadlineReplacements = findExplicitPortalDeadlineReplacements(portalText);
const preflight = {
  stage: 'public_rfp_fac115_extraction_preflight',
  fixture: FIXTURE,
  documents: documents.length,
  pages: documents.reduce((sum, document) => sum + document.pages.length, 0),
  extractionBatches: extractionBatches.length,
  extractionSinglePassUsd: Number(extractionSinglePassUsd.toFixed(6)),
  extractionMaximumUsd: Number(extractionMaximumUsd.toFixed(6)),
  authorizedExtractionCapUsd: extractionCapUsd,
  phase3SpendUsd: Number(phase3Spend.toFixed(6)),
  phase4SpendUsd: Number(phase4Spend.toFixed(6)),
  priorPublicTestSpendUsd: Number(priorPublicSpend.toFixed(6)),
  explicitDeadlineReplacements: explicitDeadlineReplacements.length,
  providerConstructed: false,
  verificationAuthorized: false,
};
console.info(JSON.stringify(preflight));

if (priorPublicSpend + extractionMaximumUsd > extractionCapUsd + 1e-9) {
  console.info(
    JSON.stringify({
      stage: 'public_rfp_fac115_extraction_budget_stop',
      reason: 'complete_extraction_reserve_exceeds_authorized_cap',
      requiredExtractionCapUsd: Number((priorPublicSpend + extractionMaximumUsd).toFixed(6)),
      shortfallUsd: Number((priorPublicSpend + extractionMaximumUsd - extractionCapUsd).toFixed(6)),
      message:
        'Refusing to construct an extraction provider because the complete 3x extraction reserve does not fit the authorized public-evaluation extraction cap. Raise PUBLIC_RFP_EXTRACTION_MAX_USD and re-run.',
    }),
  );
  process.exit(2);
}
if (phase3Spend + extractionMaximumUsd > PHASE3_CEILING_USD + 1e-9) {
  throw new Error('Complete extraction reserve would exceed the Phase 3 ceiling');
}
if (process.argv.includes('--preflight-only')) process.exit(0);

let actualCost = priorPublicSpend;
let phase3RunCost = 0;
let calls = 0;
const usage: Array<Record<string, unknown>> = [];
const ensureCallFits = (maximum: number) => {
  if (actualCost + maximum > extractionCapUsd + 1e-9)
    throw new Error(
      `Budget stop before provider call: $${actualCost.toFixed(6)} + $${maximum.toFixed(6)} > $${extractionCapUsd}`,
    );
  if (phase3Spend + phase3RunCost + maximum > PHASE3_CEILING_USD + 1e-9)
    throw new Error('Budget stop before provider call: phase3 ceiling would be exceeded');
};
const record = async (call: {
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
}) => {
  actualCost += call.estimatedCostUsd;
  phase3RunCost += call.estimatedCostUsd;
  calls += 1 + call.retries;
  if (actualCost > extractionCapUsd + 1e-9)
    throw new Error('Provider cost crossed authorized FAC115 extraction cap');
  const { error } = await admin.from('spend_ledger').insert({
    phase: 'phase3',
    kind: 'extract',
    estimated_cost_usd: call.estimatedCostUsd,
    note: `public-rfp-test:${FIXTURE}:extract`,
  });
  if (error) throw error;
  usage.push({ stage: 'extract', ...call });
};

const extractionProvider = new OpenAIProvider({
  apiKey,
  extractModel: EXTRACT_MODEL,
  verifyModel: VERIFY_MODEL,
  reasoningEffort: 'low',
  verifyReasoningEffort: 'low',
  timeoutMs: 90_000,
});
const workspaceId = '80000000-0000-4000-8000-000000000100';
const analysisRunId = randomUUID();
const candidates = [];
for (const batch of extractionBatches) {
  const inputTokens =
    batch.pages.reduce((sum, page) => sum + Math.ceil(page.text.length / 4), 0) + 1500;
  const maxOutputTokens = 5000;
  ensureCallFits(
    estimateChatCost(inputTokens, maxOutputTokens, EXTRACT_MODEL) * EXTRACTION_RETRY_RESERVE,
  );
  const output = await extractionProvider.extractCandidates({
    workspaceId,
    documentId: batch.documentId,
    analysisRunId,
    pages: batch.pages,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    maxOutputTokens,
  });
  await record(output);
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
    extractionStatus: 'ok' as const,
    parserWarnings: [] as string[],
    retrievalReason: 'public_fixture_page',
  })),
);
const portalContext = contexts.find((context) => context.documentId === portalDocument.id)!;
const contextsForCandidate = (candidate: (typeof selected)[number]) =>
  addExplicitAmendmentContext(candidate, contexts, portalContext, explicitDeadlineReplacements);
const verificationPlan = buildPublicVerificationPlan({
  candidates: selected,
  contextsForCandidate,
  modelId: VERIFY_MODEL,
  maxContexts: 2,
  entailmentMaxOutputTokens: 1800,
  challengeMaxOutputTokens: 1600,
  retryReserveMultiplier: 3,
});

await mkdir(resolve('artifacts/evaluation'), { recursive: true });
const populationArtifactPath = resolve(
  'artifacts/evaluation',
  `public-rfp-fac115-population-${analysisRunId}.json`,
);
const artifact = {
  artifactVersion: PUBLIC_RFP_EXTRACTION_ARTIFACT_VERSION,
  generatedAt: new Date().toISOString(),
  fixture: FIXTURE,
  solicitationId: 'BD-22-1080-OSD03-SRC01-70375',
  analysisRunId,
  stage: 'extraction_complete_verification_not_started',
  sourceHashes: expectedSourceHashes,
  renditionHashes: expectedRenditionHashes,
  extractionVersions: {
    prompt: EXTRACTION_PROMPT_VERSION,
    schema: SCHEMA_VERSION,
    model: EXTRACT_MODEL,
  },
  budget: {
    authorizedExtractionCapUsd: extractionCapUsd,
    extractionMaximumUsd: Number(extractionMaximumUsd.toFixed(6)),
    actualExtractionCostUsd: Number(actualCost.toFixed(6)),
    phase3SpendBeforeUsd: Number(phase3Spend.toFixed(6)),
    phase4SpendBeforeUsd: Number(phase4Spend.toFixed(6)),
    verificationPlanMaximumUsd: Number(verificationPlan.plannedMaximumUsd.toFixed(6)),
    verificationAuthorized: false,
  },
  candidates: uniqueCandidates,
  quoteGate: {
    acceptedCandidateIds: selected.map((candidate) => candidate.id),
    rejected: quoteGate.rejected.map((item) => ({
      candidateId: item.candidate.id,
      matchType: item.matchType,
    })),
  },
  verificationPlan,
  usage,
};
await writeFile(populationArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
console.info(
  JSON.stringify({
    stage: 'public_rfp_fac115_extraction_complete',
    artifactPath: populationArtifactPath,
    extractedCandidates: candidates.length,
    uniqueCandidates: uniqueCandidates.length,
    acceptedCandidates: selected.length,
    rejectedPreliminaryQuotes: quoteGate.rejected.length,
    populationHash: verificationPlan.populationHash,
    verificationPlanMaximumUsd: Number(verificationPlan.plannedMaximumUsd.toFixed(6)),
    actualExtractionCostUsd: Number(actualCost.toFixed(6)),
    providerCalls: calls,
    verificationStarted: false,
  }),
);
