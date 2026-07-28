/**
 * Projects curated Phase 9 FAC115 acceptance findings into bid-ops tables
 * for the video-call demo journey. Provider-free; flag-gated; idempotent upserts.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  aggregateReport,
  calculateReportInputHash,
  generateReportHtml,
  sha256Canonical,
  type ReportInput,
} from '@usi/domain';
import {
  FAC115_ANALYSIS_RUN_ID,
  FAC115_BID_OPS_BRIDGE_VERSION,
  FAC115_CHECKLIST_RUN_ID,
  FAC115_DOCUMENT_IDS,
  FAC115_EXPORT_ARTIFACT_ID,
  FAC115_EXPORT_MANIFEST_ID,
  FAC115_PHASE4_FINGERPRINT,
  FAC115_PRIMARY_DOCUMENT_ID,
  FAC115_PROPOSAL_AUDIT_RUN_ID,
  FAC115_PROPOSAL_DOCUMENT_ID,
  FAC115_PROPOSAL_DRAFT_ID,
  FAC115_PROPOSAL_PAGE_ID,
  FAC115_PROPOSAL_PARSE_RUN_ID,
  FAC115_READINESS_ID,
  FAC115_REPORT_RUN_ID,
  FAC115_REPORT_SNAPSHOT_ID,
  FAC115_VERIFICATION_RUN_ID,
  FAC115_WORKSPACE_ID,
  categoryFromProof,
  fac115BridgeUuid,
  isFormLike,
  sha256Text,
  titleFromAnswerId,
  type Fac115EvalRow,
} from './lib/phase9-fac115-bid-ops-bridge.ts';
import { FAC115_SYNTHETIC_IDENTITY_ID } from './lib/phase9-fac115-production.mts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const PROJECT_REF = 'uxmxkdjschbekkbnweby';
if (process.env.PHASE9_BID_OPS_BRIDGE !== '1')
  throw new Error('phase9_bid_ops_bridge_explicit_flag_required');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) throw new Error('phase9_bid_ops_bridge_supabase_runtime_missing');
if (new URL(url).hostname.split('.')[0] !== PROJECT_REF)
  throw new Error('phase9_bid_ops_bridge_project_ref_mismatch');

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EVAL_RUN_ID = '2e4f79ca-1be2-43e7-8daa-d6d2173cca9a';
const PROPOSAL_TEXT =
  'ILLUSTRATIVE DEMO PROPOSAL — NOT A REAL FAC115 BIDDER RESPONSE\n\n' +
  'This one-page draft exists only so proposal audit and report stages are visible ' +
  'during a public-evaluation demo. Requirements and checklist rows are projected ' +
  'from the accepted Phase 9 live analysis of official Commonwealth documents.';

const MINIMAL_PROPOSAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 120 >>stream
BT /F1 12 Tf 50 740 Td (ILLUSTRATIVE DEMO PROPOSAL - NOT A REAL FAC115 BID) Tj T* T* (Public evaluation fixture only.) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000438 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
517
%%EOF
`,
  'utf8',
);

async function upsert(table: string, values: unknown) {
  const { error } = await admin.from(table).upsert(values as never, { ignoreDuplicates: true });
  if (error) throw new Error(`${table}:${error.message}`);
}

function truncate(value: string, max: number) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

type SeedRow = {
  candidate_hash: string;
  requirement_type: string;
  obligation_text: string;
  evidence_text: string;
  source_block_hashes: string[];
};

type FindingRow = {
  candidate_hash: string;
  source_support_status: string;
  precedence_status: string;
  proof_requirement: string;
  evidence_block_hashes: string[];
};

type CoverageRow = {
  block_hash: string;
  source_document_id: string;
  source_document_key: string;
  page_number: number | null;
  sheet_name: string | null;
  cell_range: string | null;
};

type PageRow = {
  id: string;
  document_id: string;
  page_number: number;
  text: string;
};

const evalArtifact = JSON.parse(
  await readFile(resolve('artifacts/evaluation/phase9-fac115-expected-vs-actual-v1.json'), 'utf8'),
) as { rows: Fac115EvalRow[]; matched: number; total: number };
if (evalArtifact.total !== 23 || evalArtifact.rows.length !== 23)
  throw new Error('phase9_bid_ops_bridge_expected_row_count_mismatch');

const { data: workspace, error: workspaceError } = await admin
  .from('workspaces')
  .select('id,owner_id,name,description')
  .eq('id', FAC115_WORKSPACE_ID)
  .maybeSingle();
if (workspaceError) throw workspaceError;
if (
  !workspace ||
  workspace.owner_id !== FAC115_SYNTHETIC_IDENTITY_ID ||
  workspace.name !== 'Massachusetts FAC115 Public Evaluation'
)
  throw new Error('phase9_bid_ops_bridge_workspace_binding_mismatch');

const { data: membership, error: membershipError } = await admin
  .from('workspace_members')
  .select('user_id,role')
  .eq('workspace_id', FAC115_WORKSPACE_ID)
  .eq('user_id', FAC115_SYNTHETIC_IDENTITY_ID)
  .maybeSingle();
if (membershipError) throw membershipError;
if (!membership || membership.role !== 'owner')
  throw new Error('phase9_bid_ops_bridge_membership_missing');

const demoEmail = process.env.DEMO_USER_A_EMAIL?.trim().toLowerCase();
if (demoEmail) {
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (usersError) throw usersError;
  const demoUser = users.users.find((entry) => entry.email?.toLowerCase() === demoEmail);
  if (demoUser && demoUser.id !== FAC115_SYNTHETIC_IDENTITY_ID) {
    await upsert('workspace_members', {
      workspace_id: FAC115_WORKSPACE_ID,
      user_id: demoUser.id,
      role: 'member',
    });
  }
}

const candidateHashes = [
  ...new Set(evalArtifact.rows.flatMap((row) => row.candidateIds.slice(0, 1))),
];
const { data: seeds, error: seedsError } = await admin
  .from('phase9_candidate_seeds')
  .select('candidate_hash,requirement_type,obligation_text,evidence_text,source_block_hashes')
  .eq('evaluation_run_id', EVAL_RUN_ID)
  .eq('workspace_id', FAC115_WORKSPACE_ID)
  .in('candidate_hash', candidateHashes);
if (seedsError) throw seedsError;
const seedByHash = new Map((seeds ?? []).map((row) => [row.candidate_hash, row as SeedRow]));
if (seedByHash.size !== candidateHashes.length)
  throw new Error(
    `phase9_bid_ops_bridge_seed_lookup_incomplete:${seedByHash.size}:${candidateHashes.length}`,
  );

const { data: findings, error: findingsError } = await admin
  .from('phase9_findings')
  .select(
    'candidate_hash,source_support_status,precedence_status,proof_requirement,evidence_block_hashes',
  )
  .eq('evaluation_run_id', EVAL_RUN_ID)
  .eq('workspace_id', FAC115_WORKSPACE_ID)
  .in('candidate_hash', candidateHashes);
if (findingsError) throw findingsError;
const findingByHash = new Map(
  (findings ?? []).map((row) => [row.candidate_hash, row as FindingRow]),
);
if (findingByHash.size !== candidateHashes.length)
  throw new Error('phase9_bid_ops_bridge_finding_lookup_incomplete');

const evidenceHashes = [
  ...new Set(
    evalArtifact.rows.flatMap((row) => {
      const finding = findingByHash.get(row.candidateIds[0]!);
      return (finding?.evidence_block_hashes ?? row.evidenceBlockIds).slice(0, 1);
    }),
  ),
];
const { data: coverage, error: coverageError } = await admin
  .from('phase9_source_block_coverage')
  .select('block_hash,source_document_id,source_document_key,page_number,sheet_name,cell_range')
  .eq('evaluation_run_id', EVAL_RUN_ID)
  .eq('workspace_id', FAC115_WORKSPACE_ID)
  .in('block_hash', evidenceHashes);
if (coverageError) throw coverageError;
const coverageByHash = new Map((coverage ?? []).map((row) => [row.block_hash, row as CoverageRow]));

const { data: existingPages, error: pagesError } = await admin
  .from('document_pages')
  .select('id,document_id,page_number,text')
  .eq('workspace_id', FAC115_WORKSPACE_ID);
if (pagesError) throw pagesError;
const pageByDocPage = new Map(
  (existingPages ?? []).map((page) => [`${page.document_id}:${page.page_number}`, page as PageRow]),
);

const { data: existingParseRuns, error: parseRunsError } = await admin
  .from('parse_runs')
  .select('id,document_id,status')
  .eq('workspace_id', FAC115_WORKSPACE_ID)
  .eq('status', 'succeeded');
if (parseRunsError) throw parseRunsError;
const parseRunByDocument = new Map(
  (existingParseRuns ?? []).map((run) => [run.document_id as string, run.id as string]),
);

async function ensureParseRun(documentId: string): Promise<string> {
  const existing = parseRunByDocument.get(documentId);
  if (existing) return existing;
  const id = fac115BridgeUuid('src', sha256Text(`parse-run:${documentId}`));
  const { error } = await admin.from('parse_runs').insert({
    id,
    document_id: documentId,
    workspace_id: FAC115_WORKSPACE_ID,
    stage: 'parse',
    status: 'succeeded',
    parser_name: 'phase9-fac115-bid-ops-bridge',
    parser_version: FAC115_BID_OPS_BRIDGE_VERSION,
  });
  if (error && !error.message.includes('duplicate key'))
    throw new Error(`parse_runs:${error.message}`);
  const { data: resolved, error: resolveError } = await admin
    .from('parse_runs')
    .select('id')
    .eq('workspace_id', FAC115_WORKSPACE_ID)
    .eq('document_id', documentId)
    .eq('status', 'succeeded')
    .limit(1)
    .maybeSingle();
  if (resolveError || !resolved) throw new Error('parse_runs:resolve_failed');
  parseRunByDocument.set(documentId, resolved.id);
  return resolved.id;
}

async function ensurePage(input: {
  documentId: string;
  pageNumber: number;
  text: string;
}): Promise<PageRow> {
  const key = `${input.documentId}:${input.pageNumber}`;
  const existing = pageByDocPage.get(key);
  if (existing) return existing;
  const parseRunId = await ensureParseRun(input.documentId);
  const id = fac115BridgeUuid('src', sha256Text(`${input.documentId}:${input.pageNumber}`));
  const text = input.text || `FAC115 evidence page ${input.pageNumber}`;
  const row: PageRow = {
    id,
    document_id: input.documentId,
    page_number: input.pageNumber,
    text,
  };
  await upsert('document_pages', {
    id,
    document_id: input.documentId,
    workspace_id: FAC115_WORKSPACE_ID,
    parse_run_id: parseRunId,
    page_number: input.pageNumber,
    pdf_page_index: input.pageNumber - 1,
    text,
    text_sha256: sha256Text(text),
    char_count: text.length,
    extraction_status: text.trim() ? 'ok' : 'empty',
    parser_name: 'phase9-fac115-bid-ops-bridge',
    parser_version: FAC115_BID_OPS_BRIDGE_VERSION,
  });
  pageByDocPage.set(key, row);
  return row;
}

type BridgedItem = {
  answerId: string;
  candidateId: string;
  findingId: string;
  evidenceId: string;
  itemId: string;
  blockerId: string | null;
  artifactId: string | null;
  sourceId: string;
  documentId: string;
  pageNumber: number;
  pageId: string;
  title: string;
  obligation: string;
  quote: string;
  sourceSupportStatus: FindingRow['source_support_status'];
  precedenceStatus: FindingRow['precedence_status'];
  proofRequirement: FindingRow['proof_requirement'];
  category: string;
  formLike: boolean;
  excluded: boolean;
};

const bridged: BridgedItem[] = [];
for (const row of evalArtifact.rows) {
  const candidateHash = row.candidateIds[0]!;
  const seed = seedByHash.get(candidateHash)!;
  const finding = findingByHash.get(candidateHash)!;
  const blockHash = (finding.evidence_block_hashes[0] ?? row.evidenceBlockIds[0])!;
  const block = coverageByHash.get(blockHash);
  const documentId =
    block?.source_document_id ??
    FAC115_DOCUMENT_IDS[row.expectedDocument] ??
    FAC115_PRIMARY_DOCUMENT_ID;
  const pageNumber = block?.page_number ?? row.expectedPage ?? 1;
  const quote = truncate(seed.evidence_text || seed.obligation_text, 1800);
  const page = await ensurePage({
    documentId,
    pageNumber,
    text: quote,
  });
  const title = truncate(titleFromAnswerId(row.answerId), 500);
  const obligation = truncate(seed.obligation_text, 8000);
  const formLike = isFormLike(row);
  const excluded = finding.precedence_status === 'superseded';
  bridged.push({
    answerId: row.answerId,
    candidateId: fac115BridgeUuid('cand', candidateHash),
    findingId: fac115BridgeUuid('find', candidateHash),
    evidenceId: fac115BridgeUuid('evid', candidateHash),
    itemId: fac115BridgeUuid('item', candidateHash),
    blockerId: formLike && !excluded ? fac115BridgeUuid('blk', candidateHash) : null,
    artifactId: formLike && !excluded ? fac115BridgeUuid('art', candidateHash) : null,
    sourceId: fac115BridgeUuid('src', sha256Text(`item-source:${candidateHash}`)),
    documentId,
    pageNumber,
    pageId: page.id,
    title,
    obligation,
    quote,
    sourceSupportStatus: finding.source_support_status,
    precedenceStatus: finding.precedence_status,
    proofRequirement: finding.proof_requirement,
    category: categoryFromProof(finding.proof_requirement, row.answerId),
    formLike,
    excluded,
  });
}

const inputHash = sha256Text(
  `${FAC115_BID_OPS_BRIDGE_VERSION}:${EVAL_RUN_ID}:${bridged.map((b) => b.answerId).join(',')}`,
);
const now = new Date().toISOString();

await upsert('analysis_runs', {
  id: FAC115_ANALYSIS_RUN_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  document_id: FAC115_PRIMARY_DOCUMENT_ID,
  status: 'completed',
  stage: 'complete',
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
  provider_name: 'phase9-bridge',
  prompt_version: 'phase9-fac115-bid-ops-bridge',
  schema_version: 'candidate-v1',
  candidate_count: bridged.length,
  input_hash: inputHash,
  completed_at: now,
  verification_compatibility_fingerprint: FAC115_PHASE4_FINGERPRINT,
});

await upsert(
  'requirement_candidates',
  bridged.map((item) => ({
    id: item.candidateId,
    workspace_id: FAC115_WORKSPACE_ID,
    analysis_run_id: FAC115_ANALYSIS_RUN_ID,
    document_id: item.documentId,
    category: item.category,
    title: item.title,
    obligation: item.obligation,
    mandatory_class: 'mandatory',
    preliminary_page: item.pageNumber,
    evidence_quote: item.quote,
    confidence: 1,
    status: 'unverified',
    prompt_version: 'phase9-fac115-bid-ops-bridge',
    schema_version: 'candidate-v1',
    model_id: 'phase9-bridge',
  })),
);

await upsert('verification_runs', {
  id: FAC115_VERIFICATION_RUN_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  analysis_run_id: FAC115_ANALYSIS_RUN_ID,
  status: 'completed',
  version: 1,
  input_hash: inputHash,
  prompt_version: 'phase9-fac115-bid-ops-bridge',
  schema_version: 'verification-final-assessment-v1',
  retrieval_version: 'phase9-bridge-retrieval-v1',
  normalization_version: 'evidence-nfkc-v1',
  provider: 'phase9-bridge',
  model: 'phase9-bridge',
  reasoning_effort: 'low',
  candidate_count: bridged.length,
  finding_count: bridged.length,
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
  completed_at: now,
  compatibility_fingerprint: FAC115_PHASE4_FINGERPRINT,
});

await upsert(
  'verification_findings',
  bridged.map((item) => ({
    id: item.findingId,
    workspace_id: FAC115_WORKSPACE_ID,
    analysis_run_id: FAC115_ANALYSIS_RUN_ID,
    verification_run_id: FAC115_VERIFICATION_RUN_ID,
    candidate_id: item.candidateId,
    finding_version: 1,
    source_support_status: item.sourceSupportStatus,
    precedence_status: item.precedenceStatus,
    proof_requirement: item.proofRequirement,
    machine_status: 'machine_assessment_only',
    rationale: `Projected from accepted Phase 9 FAC115 live analysis (${item.answerId}).`,
    prompt_version: 'phase9-fac115-bid-ops-bridge',
    schema_version: 'verification-final-assessment-v1',
    model_id: 'phase9-bridge',
    decision_engine_version: 'phase9-bridge-v1',
    challenge_status: 'completed',
  })),
);

await upsert(
  'verification_evidence',
  bridged.map((item) => ({
    id: item.evidenceId,
    workspace_id: FAC115_WORKSPACE_ID,
    finding_id: item.findingId,
    document_id: item.documentId,
    document_page_id: item.pageId,
    page_number: item.pageNumber,
    evidence_role: 'supporting',
    quote_exact: item.quote,
    quote_normalized: item.quote,
    normalization_version: 'evidence-nfkc-v1',
    match_type: 'normalized_exact',
    validated: true,
  })),
);

await upsert('checklist_generation_runs', {
  id: FAC115_CHECKLIST_RUN_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  analysis_run_id: FAC115_ANALYSIS_RUN_ID,
  verification_run_id: FAC115_VERIFICATION_RUN_ID,
  input_hash: inputHash,
  fixture_version: FAC115_BID_OPS_BRIDGE_VERSION,
  eligibility_version: 'checklist-eligibility-v1',
  category_version: 'checklist-category-v1',
  generator_version: 'checklist-generator-v1',
  blocker_version: 'checklist-blockers-v1',
  readiness_version: 'checklist-readiness-v1',
  schema_version: 'checklist-schema-v1',
  status: 'completed',
  source_count: bridged.length,
  item_count: bridged.length,
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
  completed_at: now,
});

for (const item of bridged) {
  const workflowStatus = item.excluded
    ? 'not_applicable'
    : item.formLike
      ? 'blocked'
      : 'not_started';
  const artifactState = item.excluded
    ? 'not_applicable'
    : item.formLike
      ? 'missing'
      : 'not_applicable';
  await upsert('checklist_items', {
    id: item.itemId,
    workspace_id: FAC115_WORKSPACE_ID,
    analysis_run_id: FAC115_ANALYSIS_RUN_ID,
    verification_run_id: FAC115_VERIFICATION_RUN_ID,
    finding_id: item.findingId,
    candidate_id: item.candidateId,
    stable_key: sha256Text(`fac115-item:${item.answerId}`),
    title: item.title,
    obligation: item.obligation,
    category: item.category,
    mandatory: true,
    eligibility_class: item.excluded
      ? 'excluded'
      : item.formLike
        ? 'unresolved_risk'
        : 'ordinary_active',
    eligibility_reason: item.excluded
      ? 'superseded_source'
      : item.formLike
        ? 'requires_company_artifact'
        : 'supported_active',
    contributes_to_required_total: !item.excluded,
    source_support_status: item.sourceSupportStatus,
    precedence_status: item.precedenceStatus,
    proof_requirement: item.proofRequirement,
    source_human_review_status: 'pending',
    workflow_status: workflowStatus,
    artifact_state: artifactState,
    relationship_role: 'atomic',
    source_version: 'verification-final-assessment-v1',
    generation_version: 'checklist-generator-v1',
  });
  await upsert('checklist_generation_run_items', {
    workspace_id: FAC115_WORKSPACE_ID,
    generation_run_id: FAC115_CHECKLIST_RUN_ID,
    checklist_item_id: item.itemId,
  });
  await upsert('checklist_item_sources', {
    id: item.sourceId,
    workspace_id: FAC115_WORKSPACE_ID,
    checklist_item_id: item.itemId,
    finding_id: item.findingId,
    verification_evidence_id: item.evidenceId,
    document_id: item.documentId,
    document_page_id: item.pageId,
    page_number: item.pageNumber,
    quote_exact: item.quote,
    match_type: 'normalized_exact',
    parser_confidence: 1,
    source_version: 'verification-final-assessment-v1',
  });
  if (item.artifactId) {
    await upsert('checklist_required_artifacts', {
      id: item.artifactId,
      workspace_id: FAC115_WORKSPACE_ID,
      checklist_item_id: item.itemId,
      artifact_kind: 'form',
      label: item.title,
      required: true,
      state: 'missing',
      source_version: 'checklist-generator-v1',
    });
  }
  if (item.blockerId) {
    await upsert('checklist_blockers', {
      id: item.blockerId,
      workspace_id: FAC115_WORKSPACE_ID,
      checklist_item_id: item.itemId,
      stable_key: sha256Text(`fac115-blocker:${item.answerId}`),
      blocker_type:
        item.proofRequirement === 'requires_company_artifact'
          ? 'missing_human_proof'
          : 'missing_mandatory_form',
      severity: 'critical',
      source: 'deterministic_checklist_engine',
      reason:
        'Required company artifact or form is not yet linked for this public-evaluation demo.',
      readiness_impact: 'blocks',
      status: 'open',
      engine_version: 'checklist-blockers-v1',
    });
  }
}

const required = bridged.filter((item) => !item.excluded);
const blocked = bridged.filter((item) => item.blockerId);
await upsert('checklist_readiness_snapshots', {
  id: FAC115_READINESS_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  generation_run_id: FAC115_CHECKLIST_RUN_ID,
  input_hash: inputHash,
  status: 'blocked',
  total_required: required.length,
  completed_required: 0,
  incomplete_required: required.length,
  blocked_items: blocked.length,
  unresolved_items: 0,
  items_requiring_human_proof: blocked.length,
  informational_items: 0,
  active_critical_blockers: blocked.length,
  warnings: 0,
  excluded_items: bridged.length - required.length,
  summary: `Blocked by ${blocked.length} required FAC115 items (projected from Phase 9)`,
  engine_version: 'checklist-readiness-v1',
});

const proposalSha = createHash('sha256').update(MINIMAL_PROPOSAL_PDF).digest('hex');
const proposalObjectKey = `${FAC115_WORKSPACE_ID}/${FAC115_PROPOSAL_DOCUMENT_ID}/illustrative-fac115-proposal.pdf`;
const { error: proposalUploadError } = await admin.storage
  .from('workspace-documents')
  .upload(proposalObjectKey, MINIMAL_PROPOSAL_PDF, {
    contentType: 'application/pdf',
    upsert: true,
  });
if (proposalUploadError) throw proposalUploadError;

await upsert('documents', {
  id: FAC115_PROPOSAL_DOCUMENT_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
  document_type: 'proposal_draft',
  original_filename: 'illustrative-fac115-proposal.pdf',
  normalized_filename: 'illustrative-fac115-proposal.pdf',
  mime_type: 'application/pdf',
  object_key: proposalObjectKey,
  size_bytes: MINIMAL_PROPOSAL_PDF.byteLength,
  sha256: proposalSha,
  status: 'parsed',
  page_count: 1,
  parser_name: 'phase9-fac115-bid-ops-bridge',
  parser_version: FAC115_BID_OPS_BRIDGE_VERSION,
});
await upsert('parse_runs', {
  id: FAC115_PROPOSAL_PARSE_RUN_ID,
  document_id: FAC115_PROPOSAL_DOCUMENT_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  stage: 'parse',
  status: 'succeeded',
  parser_name: 'phase9-fac115-bid-ops-bridge',
  parser_version: FAC115_BID_OPS_BRIDGE_VERSION,
});
await upsert('document_pages', {
  id: FAC115_PROPOSAL_PAGE_ID,
  document_id: FAC115_PROPOSAL_DOCUMENT_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  parse_run_id: FAC115_PROPOSAL_PARSE_RUN_ID,
  page_number: 1,
  pdf_page_index: 0,
  text: PROPOSAL_TEXT,
  text_sha256: sha256Text(PROPOSAL_TEXT),
  char_count: PROPOSAL_TEXT.length,
  extraction_status: 'ok',
  parser_name: 'phase9-fac115-bid-ops-bridge',
  parser_version: FAC115_BID_OPS_BRIDGE_VERSION,
});

await upsert('proposal_drafts', {
  id: FAC115_PROPOSAL_DRAFT_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  document_id: FAC115_PROPOSAL_DOCUMENT_ID,
  lineage_id: '80000000-0000-4000-8000-00000000002e',
  revision_number: 1,
  document_sha256: proposalSha,
  page_set_hash: sha256Text(PROPOSAL_TEXT),
  parser_name: 'phase9-fac115-bid-ops-bridge',
  parser_version: FAC115_BID_OPS_BRIDGE_VERSION,
  status: 'ready',
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
});

const formItems = bridged.filter((item) => item.blockerId);
const claimId = fac115BridgeUuid('claim', sha256Text('illustrative-claim-1'));
const sectionId = fac115BridgeUuid('psec', sha256Text('illustrative-section-1'));
const missingFindingId = fac115BridgeUuid('pfind', sha256Text('missing-form-response'));
const proofFindingId = fac115BridgeUuid('pfind', sha256Text('human-proof-required'));
const primaryForm = formItems[0];

await upsert('proposal_audit_runs', {
  id: FAC115_PROPOSAL_AUDIT_RUN_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  proposal_draft_id: FAC115_PROPOSAL_DRAFT_ID,
  checklist_generation_run_id: FAC115_CHECKLIST_RUN_ID,
  input_hash: inputHash,
  fixture_version: FAC115_BID_OPS_BRIDGE_VERSION,
  section_parser_version: 'proposal-section-parser-v1',
  claim_segmenter_version: 'proposal-claim-segmenter-v1',
  schema_version: 'proposal-audit-schema-v1',
  matcher_version: 'proposal-response-matcher-v1',
  support_policy_version: 'proposal-support-policy-v1',
  contradiction_version: 'proposal-contradiction-v1',
  severity_version: 'proposal-finding-severity-v1',
  evaluator_version: 'proposal-audit-evaluator-v1',
  status: 'completed',
  section_count: 1,
  claim_count: 1,
  finding_count: 2,
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
  completed_at: now,
});

await upsert('proposal_sections', {
  id: sectionId,
  workspace_id: FAC115_WORKSPACE_ID,
  proposal_audit_run_id: FAC115_PROPOSAL_AUDIT_RUN_ID,
  proposal_draft_id: FAC115_PROPOSAL_DRAFT_ID,
  document_page_id: FAC115_PROPOSAL_PAGE_ID,
  stable_key: sha256Text('fac115-proposal-section:1'),
  heading: 'Illustrative demo proposal',
  normalized_heading: 'illustrative demo proposal',
  page_number: 1,
  start_offset: 0,
  end_offset: PROPOSAL_TEXT.length,
  section_text: PROPOSAL_TEXT,
  parser_uncertain: false,
  parser_version: 'proposal-section-parser-v1',
});

await upsert('proposal_claims', {
  id: claimId,
  workspace_id: FAC115_WORKSPACE_ID,
  proposal_audit_run_id: FAC115_PROPOSAL_AUDIT_RUN_ID,
  proposal_section_id: sectionId,
  stable_key: sha256Text('fac115-proposal-claim:1'),
  claim_type: 'requirement_response',
  claim_text: 'Illustrative claim: company response forms will be completed before submission.',
  normalized_text:
    'Illustrative claim: company response forms will be completed before submission.',
  page_number: 1,
  start_offset: 0,
  end_offset: 72,
  parser_uncertain: false,
  injection_signals: [],
  segmenter_version: 'proposal-claim-segmenter-v1',
});

if (primaryForm) {
  await upsert('proposal_claim_requirement_matches', {
    id: fac115BridgeUuid('claim', sha256Text('match-1')),
    workspace_id: FAC115_WORKSPACE_ID,
    proposal_audit_run_id: FAC115_PROPOSAL_AUDIT_RUN_ID,
    proposal_claim_id: claimId,
    checklist_item_id: primaryForm.itemId,
    match_score: 0.4,
    match_reason: 'Illustrative match for demo narrative only.',
    support_status: 'requires_human_proof',
    consistency_status: 'undetermined',
    rationale: 'Public package has no real bidder draft; claim is illustrative.',
    proposal_facts: [],
    requirement_facts: [],
    machine_only: true,
    human_resolution_status: 'pending',
    matcher_version: 'proposal-response-matcher-v1',
  });
}

await upsert(
  'proposal_response_coverage',
  required.map((item) => ({
    id: fac115BridgeUuid('pfind', sha256Text(`coverage:${item.answerId}`)),
    workspace_id: FAC115_WORKSPACE_ID,
    proposal_audit_run_id: FAC115_PROPOSAL_AUDIT_RUN_ID,
    checklist_item_id: item.itemId,
    coverage_status: item.formLike ? 'missing' : 'partially_addressed',
    reason: item.formLike
      ? 'No real bidder form response exists in the public FAC115 package.'
      : 'Illustrative proposal only partially addresses this projected requirement.',
    matched_claim_keys: item.formLike ? [] : ['illustrative-claim-1'],
    machine_only: true,
    human_resolution_status: 'pending',
    matcher_version: 'proposal-response-matcher-v1',
  })),
);

await upsert('proposal_audit_findings', [
  {
    id: missingFindingId,
    workspace_id: FAC115_WORKSPACE_ID,
    proposal_audit_run_id: FAC115_PROPOSAL_AUDIT_RUN_ID,
    stable_key: sha256Text('fac115-proposal-finding:missing-form'),
    finding_type: 'missing_required_response',
    severity: 'blocking',
    title: 'Missing mandatory form response (illustrative)',
    detail:
      'Public FAC115 has no bidder draft. This finding shows what a missing form looks like in final review.',
    checklist_item_id: primaryForm?.itemId ?? null,
    proposal_claim_id: null,
    proposal_page_id: null,
    proposal_page_number: null,
    source_document_id: primaryForm?.documentId ?? FAC115_PRIMARY_DOCUMENT_ID,
    source_page_id: primaryForm?.pageId ?? null,
    source_page_number: primaryForm?.pageNumber ?? null,
    source_quote: primaryForm?.quote ?? null,
    machine_only: true,
    human_resolution_status: 'pending',
    workflow_status: 'open',
    rule_version: 'proposal-finding-severity-v1',
  },
  {
    id: proofFindingId,
    workspace_id: FAC115_WORKSPACE_ID,
    proposal_audit_run_id: FAC115_PROPOSAL_AUDIT_RUN_ID,
    stable_key: sha256Text('fac115-proposal-finding:human-proof'),
    finding_type: 'human_proof_required',
    severity: 'warning',
    title: 'Company proof still required (illustrative)',
    detail:
      'Projected Phase 9 company-artifact obligations remain open until a real bidder attaches proof.',
    checklist_item_id: formItems[1]?.itemId ?? primaryForm?.itemId ?? null,
    proposal_claim_id: claimId,
    proposal_page_id: FAC115_PROPOSAL_PAGE_ID,
    proposal_page_number: 1,
    source_document_id: formItems[1]?.documentId ?? primaryForm?.documentId ?? null,
    source_page_id: formItems[1]?.pageId ?? primaryForm?.pageId ?? null,
    source_page_number: formItems[1]?.pageNumber ?? primaryForm?.pageNumber ?? null,
    source_quote: formItems[1]?.quote ?? primaryForm?.quote ?? null,
    machine_only: true,
    human_resolution_status: 'pending',
    workflow_status: 'open',
    rule_version: 'proposal-finding-severity-v1',
  },
]);

const reportRequirements: ReportInput['requirements'] = bridged.map((item) => ({
  findingId: item.findingId,
  candidateId: item.candidateId,
  title: item.title,
  sourceSupportStatus:
    item.sourceSupportStatus as ReportInput['requirements'][number]['sourceSupportStatus'],
  precedenceStatus:
    item.precedenceStatus as ReportInput['requirements'][number]['precedenceStatus'],
  proofRequirement:
    item.proofRequirement as ReportInput['requirements'][number]['proofRequirement'],
  humanReviewStatus: 'pending',
  documentId: item.documentId,
  pageNumber: item.pageNumber,
  exactQuote: item.quote.slice(0, 2000),
  evidenceMatchType: 'normalized_exact',
  parserUncertain: false,
  relationshipRole: 'atomic',
}));

const reportChecklist: ReportInput['checklistItems'] = bridged.map((item) => ({
  id: item.itemId,
  candidateId: item.candidateId,
  findingId: item.findingId,
  title: item.title,
  category: item.category,
  mandatory: true,
  requiredDenominator: !item.excluded,
  eligibilityClass: item.excluded
    ? 'excluded'
    : item.formLike
      ? 'unresolved_risk'
      : 'ordinary_active',
  lifecycleStatus: 'active',
  workflowStatus: item.excluded ? 'not_applicable' : item.formLike ? 'blocked' : 'not_started',
  artifactState: item.excluded ? 'not_applicable' : item.formLike ? 'missing' : 'not_applicable',
  owner: null,
  reviewer: null,
  dueAt: null,
  dueTimezone: null,
  sourceDocumentId: item.documentId,
  sourcePageNumber: item.pageNumber,
  sourceQuote: item.quote.slice(0, 2000),
  sourceEvidenceValidated: true,
  sourceSupportStatus:
    item.sourceSupportStatus as ReportInput['checklistItems'][number]['sourceSupportStatus'],
  precedenceStatus:
    item.precedenceStatus as ReportInput['checklistItems'][number]['precedenceStatus'],
  proofRequirement:
    item.proofRequirement as ReportInput['checklistItems'][number]['proofRequirement'],
  humanReviewStatus: 'pending',
  relationshipRole: 'atomic',
}));

const reportBlockers: ReportInput['blockers'] = formItems.map((item) => ({
  id: item.blockerId!,
  checklistItemId: item.itemId,
  type:
    item.proofRequirement === 'requires_company_artifact'
      ? 'missing_human_proof'
      : 'missing_mandatory_form',
  severity: 'critical' as const,
  title: `Missing ${item.title}`,
  explanation: 'Required company artifact is not linked in this public-evaluation demo.',
  status: 'open' as const,
  resolutionState: 'unresolved' as const,
}));

const reportArtifacts: ReportInput['artifacts'] = formItems.map((item) => ({
  id: item.artifactId!,
  checklistItemId: item.itemId,
  artifactType: 'required_form',
  state: 'missing' as const,
  documentId: null,
  reviewed: false,
}));

const reportInput: ReportInput = {
  workspace: {
    id: FAC115_WORKSPACE_ID,
    name: 'Massachusetts FAC115 Public Evaluation',
    procurementTitle: 'FAC115 Security Guard Services',
    solicitationNumber: 'BD-22-1080-OSD03-SRC01-70375',
    demo: true,
    dataClassification: 'public',
  },
  reportType: 'executive',
  sourceSnapshotAt: now,
  runs: {
    analysisRunId: FAC115_ANALYSIS_RUN_ID,
    verificationRunId: FAC115_VERIFICATION_RUN_ID,
    checklistGenerationRunId: FAC115_CHECKLIST_RUN_ID,
    readinessSnapshotId: FAC115_READINESS_ID,
    proposalAuditRunId: FAC115_PROPOSAL_AUDIT_RUN_ID,
    proposalDraftId: FAC115_PROPOSAL_DRAFT_ID,
    proposalRevision: 1,
  },
  versions: {
    phase4Fingerprint: FAC115_PHASE4_FINGERPRINT,
    checklistGenerator: 'checklist-generator-v1',
    blockerEngine: 'checklist-blockers-v1',
    readinessEngine: 'checklist-readiness-v1',
    proposalParser: 'proposal-section-parser-v1',
    proposalSegmenter: 'proposal-claim-segmenter-v1',
    proposalMatcher: 'proposal-response-matcher-v1',
    proposalContradiction: 'proposal-contradiction-v1',
    proposalSeverity: 'proposal-finding-severity-v1',
    proposalEvaluator: 'proposal-audit-evaluator-v1',
  },
  providerUseStatement: 'No Phase 7 provider calls; deterministic persisted data only.',
  requirements: reportRequirements,
  checklistItems: reportChecklist,
  blockers: reportBlockers,
  artifacts: reportArtifacts,
  waivers: [],
  exceptions: [],
  proposalClaims: [
    {
      id: claimId,
      text: 'Illustrative claim: company response forms will be completed before submission.',
      pageNumber: 1,
      claimType: 'requirement_response',
      supportStatus: 'requires_human_proof',
      consistencyStatus: 'undetermined',
      parserUncertain: false,
      evidenceCount: 0,
    },
  ],
  proposalFindings: [
    {
      id: missingFindingId,
      checklistItemId: primaryForm?.itemId ?? null,
      claimId: null,
      type: 'missing_required_response',
      severity: 'blocking',
      title: 'Missing mandatory form response (illustrative)',
      detail:
        'Public FAC115 has no bidder draft. This finding shows what a missing form looks like in final review.',
      workflowStatus: 'open',
      humanResolutionStatus: 'pending',
      supportStatus: null,
      consistencyStatus: null,
      proofRequirement: 'none_identified',
      proposalDocumentId: FAC115_PROPOSAL_DOCUMENT_ID,
      proposalPageNumber: null,
      proposalQuote: null,
      sourceDocumentId: primaryForm?.documentId ?? FAC115_PRIMARY_DOCUMENT_ID,
      sourcePageNumber: primaryForm?.pageNumber ?? null,
      sourceQuote: primaryForm?.quote?.slice(0, 2000) ?? null,
      machineOnly: true,
      resolvedByRevision: false,
      resolvedByEvidence: false,
    },
    {
      id: proofFindingId,
      checklistItemId: formItems[1]?.itemId ?? primaryForm?.itemId ?? null,
      claimId,
      type: 'human_proof_required',
      severity: 'warning',
      title: 'Company proof still required (illustrative)',
      detail:
        'Projected Phase 9 company-artifact obligations remain open until a real bidder attaches proof.',
      workflowStatus: 'open',
      humanResolutionStatus: 'pending',
      supportStatus: 'requires_human_proof',
      consistencyStatus: 'undetermined',
      proofRequirement: 'requires_company_artifact',
      proposalDocumentId: FAC115_PROPOSAL_DOCUMENT_ID,
      proposalPageNumber: 1,
      proposalQuote:
        'Illustrative claim: company response forms will be completed before submission.',
      sourceDocumentId: formItems[1]?.documentId ?? primaryForm?.documentId ?? null,
      sourcePageNumber: formItems[1]?.pageNumber ?? primaryForm?.pageNumber ?? null,
      sourceQuote: (formItems[1]?.quote ?? primaryForm?.quote ?? '').slice(0, 2000) || null,
      machineOnly: true,
      resolvedByRevision: false,
      resolvedByEvidence: false,
    },
  ],
  readiness: {
    id: FAC115_READINESS_ID,
    state: 'blocked',
    summary: `Blocked by ${blocked.length} required FAC115 items (projected from Phase 9)`,
    totalRequired: required.length,
    completedRequired: 0,
    incompleteRequired: required.length,
    blockedItems: blocked.length,
    unresolvedItems: 0,
    humanProofItems: blocked.length,
    informationalItems: 0,
    criticalBlockers: blocked.length,
    warnings: 0,
    excludedItems: bridged.length - required.length,
    createdAt: now,
  },
};

const reportSnapshot = aggregateReport(reportInput);
const reportInputHash = calculateReportInputHash(reportInput);

await upsert('report_generation_runs', {
  id: FAC115_REPORT_RUN_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  analysis_run_id: FAC115_ANALYSIS_RUN_ID,
  verification_run_id: FAC115_VERIFICATION_RUN_ID,
  checklist_generation_run_id: FAC115_CHECKLIST_RUN_ID,
  readiness_snapshot_id: FAC115_READINESS_ID,
  proposal_audit_run_id: FAC115_PROPOSAL_AUDIT_RUN_ID,
  proposal_draft_id: FAC115_PROPOSAL_DRAFT_ID,
  report_type: 'executive',
  report_version: 'report-v1',
  input_version: 'report-input-v1',
  aggregation_version: 'report-aggregation-v1',
  schema_version: 'report-schema-v1',
  input_hash: reportInputHash,
  source_snapshot_at: now,
  status: 'completed',
  demo: true,
  data_classification: 'public',
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
  completed_at: now,
});

await upsert('report_snapshots', {
  id: FAC115_REPORT_SNAPSHOT_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  report_generation_run_id: FAC115_REPORT_RUN_ID,
  report_type: 'executive',
  report_version: 'report-v1',
  schema_version: 'report-schema-v1',
  input_hash: reportInputHash,
  demo: true,
  data_classification: 'public',
  summary: reportSnapshot.summary,
  snapshot: reportSnapshot,
  generated_by: FAC115_SYNTHETIC_IDENTITY_ID,
});

const html = generateReportHtml(reportSnapshot);
const htmlBytes = Buffer.from(html, 'utf8');
const htmlSha = sha256Canonical(html);
const exportPath = `${FAC115_WORKSPACE_ID}/${FAC115_REPORT_SNAPSHOT_ID}/${FAC115_EXPORT_MANIFEST_ID}/illustrative-fac115-report.html`;
const { error: exportUploadError } = await admin.storage
  .from('workspace-exports')
  .upload(exportPath, htmlBytes, { contentType: 'text/html', upsert: true });
if (exportUploadError) throw exportUploadError;

await upsert('export_manifests', {
  id: FAC115_EXPORT_MANIFEST_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  report_snapshot_id: FAC115_REPORT_SNAPSHOT_ID,
  export_format: 'html',
  csv_dataset: null,
  manifest_version: 'export-manifest-v1',
  export_schema_version: 'report-html-v1',
  input_hash: reportInputHash,
  status: 'completed',
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
});

await upsert('export_artifacts', {
  id: FAC115_EXPORT_ARTIFACT_ID,
  workspace_id: FAC115_WORKSPACE_ID,
  export_manifest_id: FAC115_EXPORT_MANIFEST_ID,
  bucket_id: 'workspace-exports',
  object_path: exportPath,
  normalized_filename: 'illustrative-fac115-report.html',
  content_type: 'text/html',
  content_length: htmlBytes.byteLength,
  sha256: htmlSha,
  demo: true,
  status: 'active',
  retention_until: '2099-12-31T23:59:59Z',
  created_by: FAC115_SYNTHETIC_IDENTITY_ID,
});

console.info(
  JSON.stringify(
    {
      ok: true,
      projectRef: PROJECT_REF,
      workspaceId: FAC115_WORKSPACE_ID,
      evaluationRunId: EVAL_RUN_ID,
      bridgeVersion: FAC115_BID_OPS_BRIDGE_VERSION,
      candidates: bridged.length,
      blockers: blocked.length,
      requiredItems: required.length,
      reportSnapshotId: FAC115_REPORT_SNAPSHOT_ID,
      proposalDocumentId: FAC115_PROPOSAL_DOCUMENT_ID,
      providerCalls: 0,
    },
    null,
    2,
  ),
);
