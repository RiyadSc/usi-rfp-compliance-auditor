import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { aggregateReport, generateReportHtml, sha256Canonical } from '@usi/domain';
import { reportingKnownAnswerInput } from '../fixtures/eval/reporting-known-answer';
import {
  PHASE8_ANALYSIS_RUN_ID,
  PHASE8_CHECKLIST_RUN_ID,
  PHASE8_DEMO_CANDIDATES,
  PHASE8_DEMO_SCOPE_ID,
  PHASE8_DEMO_WORKSPACE_ID,
  PHASE8_DOCUMENT_SET_HASH,
  PHASE8_EXPORT_ARTIFACT_ID,
  PHASE8_EXPORT_MANIFEST_ID,
  PHASE8_FIXTURE_HASH,
  PHASE8_PROPOSAL_AUDIT_RUN_ID,
  PHASE8_PROPOSAL_DOCUMENT_ID,
  PHASE8_PROPOSAL_DRAFT_ID,
  PHASE8_PROPOSAL_PAGES,
  PHASE8_PROPOSAL_PARSE_RUN_ID,
  PHASE8_PROPOSAL_PDF,
  PHASE8_PROPOSAL_SHA,
  PHASE8_READINESS_ID,
  PHASE8_REPORT_INPUT_HASH,
  PHASE8_REPORT_RUN_ID,
  PHASE8_REPORT_SNAPSHOT_ID,
  PHASE8_SOURCE_DOCUMENT_ID,
  PHASE8_SOURCE_PAGES,
  PHASE8_SOURCE_PARSE_RUN_ID,
  PHASE8_SOURCE_PDF,
  PHASE8_SOURCE_SHA,
  PHASE8_VERIFICATION_RUN_ID,
  phase8DemoManifest,
} from './lib/phase8-prepared-demo';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`phase8_provision_missing_${name.toLowerCase()}`);
  return value;
};
const url = required('NEXT_PUBLIC_SUPABASE_URL');
if (!url.includes('uxmxkdjschbekkbnweby')) throw new Error('phase8_wrong_supabase_project');
const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: users, error: userError } = await admin.auth.admin.listUsers({ perPage: 100 });
if (userError) throw userError;
const email = required('DEMO_USER_A_EMAIL').toLowerCase();
const user = users.users.find((entry) => entry.email?.toLowerCase() === email);
if (!user) throw new Error('phase8_authorized_synthetic_identity_missing');
const manifest = phase8DemoManifest(user.id);
const hex = (value: string) => sha256Canonical(value);
const id = (group: number, index: number) =>
  `81000000-0000-4000-${String(8200 + group).slice(0, 4)}-${String(index).padStart(12, '0')}`;

async function insert(table: string, values: unknown) {
  const { error } = await admin.from(table).upsert(values as never, { ignoreDuplicates: true });
  if (error) throw new Error(`${table}:${error.message}`);
}

await insert('workspaces', {
  id: PHASE8_DEMO_WORKSPACE_ID,
  name: 'Harbor City Full-Roadmap Synthetic Demo',
  customer: 'Synthetic/Public Fixture Only',
  description: 'Prepared Phase 8 synthetic-only presentation scope.',
  owner_id: user.id,
});
await insert('workspace_members', {
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  user_id: user.id,
  role: 'owner',
});

const documents = [
  {
    id: PHASE8_SOURCE_DOCUMENT_ID,
    document_type: 'primary_rfp',
    name: 'phase8-synthetic-rfp.pdf',
    objectKey: manifest.sourceObjectKey,
    bytes: PHASE8_SOURCE_PDF,
    sha: PHASE8_SOURCE_SHA,
    pages: PHASE8_SOURCE_PAGES.length,
  },
  {
    id: PHASE8_PROPOSAL_DOCUMENT_ID,
    document_type: 'proposal_draft',
    name: 'phase8-flawed-proposal.pdf',
    objectKey: manifest.proposalObjectKey,
    bytes: PHASE8_PROPOSAL_PDF,
    sha: PHASE8_PROPOSAL_SHA,
    pages: PHASE8_PROPOSAL_PAGES.length,
  },
];
for (const document of documents) {
  const { error: uploadError } = await admin.storage
    .from('workspace-documents')
    .upload(document.objectKey, document.bytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;
  await insert('documents', {
    id: document.id,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    created_by: user.id,
    document_type: document.document_type,
    original_filename: document.name,
    normalized_filename: document.name,
    mime_type: 'application/pdf',
    object_key: document.objectKey,
    size_bytes: document.bytes.byteLength,
    sha256: document.sha,
    status: 'parsed',
    page_count: document.pages,
    parser_name: 'phase8-synthetic-parser',
    parser_version: 'phase8-synthetic-parser-v1',
  });
}
await insert('parse_runs', [
  {
    id: PHASE8_SOURCE_PARSE_RUN_ID,
    document_id: PHASE8_SOURCE_DOCUMENT_ID,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    stage: 'parse',
    status: 'succeeded',
    parser_name: 'phase8-synthetic-parser',
    parser_version: 'phase8-synthetic-parser-v1',
  },
  {
    id: PHASE8_PROPOSAL_PARSE_RUN_ID,
    document_id: PHASE8_PROPOSAL_DOCUMENT_ID,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    stage: 'parse',
    status: 'succeeded',
    parser_name: 'phase8-synthetic-parser',
    parser_version: 'phase8-synthetic-parser-v1',
  },
]);
const sourcePageId = (page: number) => id(1, page);
const proposalPageId = (page: number) => id(2, page);
await insert(
  'document_pages',
  PHASE8_SOURCE_PAGES.map((page) => ({
    id: sourcePageId(page.pageNumber),
    document_id: PHASE8_SOURCE_DOCUMENT_ID,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    parse_run_id: PHASE8_SOURCE_PARSE_RUN_ID,
    page_number: page.pageNumber,
    pdf_page_index: page.pageNumber - 1,
    text: page.text,
    text_sha256: hex(page.text),
    char_count: page.text.length,
    extraction_status: 'ok',
    parser_name: 'phase8-synthetic-parser',
    parser_version: 'phase8-synthetic-parser-v1',
  })),
);
await insert(
  'document_pages',
  PHASE8_PROPOSAL_PAGES.map((page) => ({
    id: proposalPageId(page.pageNumber),
    document_id: PHASE8_PROPOSAL_DOCUMENT_ID,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    parse_run_id: PHASE8_PROPOSAL_PARSE_RUN_ID,
    page_number: page.pageNumber,
    pdf_page_index: page.pageNumber - 1,
    text: page.text,
    text_sha256: hex(page.text),
    char_count: page.text.length,
    extraction_status: page.pageNumber === 8 ? 'empty' : 'ok',
    warnings: page.pageNumber === 8 ? ['image_only_page'] : [],
    parser_name: 'phase8-synthetic-parser',
    parser_version: 'phase8-synthetic-parser-v1',
  })),
);
await insert('analysis_runs', {
  id: PHASE8_ANALYSIS_RUN_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  document_id: PHASE8_SOURCE_DOCUMENT_ID,
  status: 'completed',
  stage: 'complete',
  created_by: user.id,
  provider_name: 'mock',
  prompt_version: 'extract-v1',
  schema_version: 'candidate-v1',
  candidate_count: 24,
  input_hash: PHASE8_FIXTURE_HASH,
  completed_at: new Date().toISOString(),
  verification_compatibility_fingerprint: manifest.binding.compatibilityFingerprint,
});
await insert(
  'requirement_candidates',
  PHASE8_DEMO_CANDIDATES.map((candidate) => ({
    id: candidate.candidateId,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    analysis_run_id: PHASE8_ANALYSIS_RUN_ID,
    document_id: PHASE8_SOURCE_DOCUMENT_ID,
    category: candidate.category,
    title: candidate.title,
    obligation: candidate.obligation,
    mandatory_class: 'mandatory',
    preliminary_page: candidate.pageNumber,
    evidence_quote: candidate.evidenceQuote,
    confidence: 1,
    status: 'unverified',
    prompt_version: 'extract-v1',
    schema_version: 'candidate-v1',
    model_id: 'mock',
  })),
);
await insert('verification_runs', {
  id: PHASE8_VERIFICATION_RUN_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  analysis_run_id: PHASE8_ANALYSIS_RUN_ID,
  status: 'completed',
  version: 1,
  input_hash: PHASE8_FIXTURE_HASH,
  prompt_version: 'verify-entailment-v7+verify-challenge-v4',
  schema_version: 'verification-final-assessment-v1',
  retrieval_version: 'verify-retrieval-v2-candidate-centered',
  normalization_version: 'evidence-nfkc-v1',
  provider: 'mock',
  model: 'mock',
  reasoning_effort: 'low',
  candidate_count: 24,
  finding_count: 24,
  created_by: user.id,
  completed_at: new Date().toISOString(),
  compatibility_fingerprint: manifest.binding.compatibilityFingerprint,
});
await insert(
  'verification_findings',
  PHASE8_DEMO_CANDIDATES.map((candidate) => ({
    id: candidate.findingId,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    analysis_run_id: PHASE8_ANALYSIS_RUN_ID,
    verification_run_id: PHASE8_VERIFICATION_RUN_ID,
    candidate_id: candidate.candidateId,
    finding_version: 1,
    source_support_status: candidate.sourceSupportStatus,
    precedence_status: candidate.precedenceStatus,
    proof_requirement: candidate.proofRequirement,
    machine_status: 'machine_assessment_only',
    rationale: 'Deterministic synthetic known-answer result.',
    prompt_version: 'verify-entailment-v7+verify-challenge-v4',
    schema_version: 'verification-final-assessment-v1',
    model_id: 'mock',
    decision_engine_version: 'verification-decision-v6',
    challenge_status: 'completed',
  })),
);
await insert(
  'verification_evidence',
  PHASE8_DEMO_CANDIDATES.map((candidate) => ({
    id: candidate.evidenceId,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    finding_id: candidate.findingId,
    document_id: PHASE8_SOURCE_DOCUMENT_ID,
    document_page_id: sourcePageId(candidate.pageNumber),
    page_number: candidate.pageNumber,
    evidence_role:
      candidate.sourceSupportStatus === 'contradicted' ? 'contradicting' : 'supporting',
    quote_exact: candidate.evidenceQuote,
    quote_normalized: candidate.evidenceQuote,
    normalization_version: 'evidence-nfkc-v1',
    match_type: 'exact',
    validated: true,
  })),
);

const checklistCandidates = PHASE8_DEMO_CANDIDATES.slice(0, 10);
await insert('checklist_generation_runs', {
  id: PHASE8_CHECKLIST_RUN_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  analysis_run_id: PHASE8_ANALYSIS_RUN_ID,
  verification_run_id: PHASE8_VERIFICATION_RUN_ID,
  input_hash: PHASE8_FIXTURE_HASH,
  fixture_version: 'full-roadmap-known-answer-v1',
  eligibility_version: 'checklist-eligibility-v1',
  category_version: 'checklist-category-v1',
  generator_version: 'checklist-generator-v1',
  blocker_version: 'checklist-blockers-v1',
  readiness_version: 'checklist-readiness-v1',
  schema_version: 'checklist-schema-v1',
  status: 'completed',
  source_count: 10,
  item_count: 10,
  created_by: user.id,
  completed_at: new Date().toISOString(),
});
for (const [index, candidate] of checklistCandidates.entries()) {
  const itemId = id(3, index + 1);
  const isForm = index < 5;
  await insert('checklist_items', {
    id: itemId,
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    analysis_run_id: PHASE8_ANALYSIS_RUN_ID,
    verification_run_id: PHASE8_VERIFICATION_RUN_ID,
    finding_id: candidate.findingId,
    candidate_id: candidate.candidateId,
    stable_key: hex(`item:${candidate.key}`),
    title: candidate.title,
    obligation: candidate.obligation,
    category: isForm ? 'mandatory_form' : 'other_material_requirement',
    mandatory: true,
    eligibility_class: 'ordinary_active',
    eligibility_reason: 'supported_active',
    contributes_to_required_total: true,
    source_support_status: 'supported',
    precedence_status: 'active',
    proof_requirement: candidate.proofRequirement,
    source_human_review_status: 'accepted',
    workflow_status: isForm ? 'blocked' : 'completed',
    artifact_state: isForm ? 'missing' : 'not_applicable',
    relationship_role: 'atomic',
    source_version: 'verification-final-assessment-v1',
    generation_version: 'checklist-generator-v1',
  });
  await insert('checklist_generation_run_items', {
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    generation_run_id: PHASE8_CHECKLIST_RUN_ID,
    checklist_item_id: itemId,
  });
  await insert('checklist_item_sources', {
    id: id(4, index + 1),
    workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    checklist_item_id: itemId,
    finding_id: candidate.findingId,
    verification_evidence_id: candidate.evidenceId,
    document_id: PHASE8_SOURCE_DOCUMENT_ID,
    document_page_id: sourcePageId(candidate.pageNumber),
    page_number: candidate.pageNumber,
    quote_exact: candidate.evidenceQuote,
    match_type: 'exact',
    parser_confidence: 1,
    source_version: 'verification-final-assessment-v1',
  });
  if (isForm) {
    await insert('checklist_required_artifacts', {
      id: id(5, index + 1),
      workspace_id: PHASE8_DEMO_WORKSPACE_ID,
      checklist_item_id: itemId,
      artifact_kind: 'form',
      label: candidate.title,
      required: true,
      state: 'missing',
      source_version: 'checklist-generator-v1',
    });
    await insert('checklist_blockers', {
      id: id(6, index + 1),
      workspace_id: PHASE8_DEMO_WORKSPACE_ID,
      checklist_item_id: itemId,
      stable_key: hex(`blocker:${candidate.key}`),
      blocker_type: 'missing_mandatory_form',
      severity: 'critical',
      source: 'deterministic_checklist_engine',
      reason: 'mandatory form artifact is missing',
      readiness_impact: 'blocks',
      status: 'open',
      engine_version: 'checklist-blockers-v1',
    });
  }
}
await insert('checklist_readiness_snapshots', {
  id: PHASE8_READINESS_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  generation_run_id: PHASE8_CHECKLIST_RUN_ID,
  input_hash: PHASE8_FIXTURE_HASH,
  status: 'blocked',
  total_required: 10,
  completed_required: 5,
  incomplete_required: 5,
  blocked_items: 5,
  unresolved_items: 0,
  items_requiring_human_proof: 5,
  informational_items: 0,
  active_critical_blockers: 5,
  warnings: 0,
  excluded_items: 0,
  summary: 'Blocked by 5 required items',
  engine_version: 'checklist-readiness-v1',
});

await insert('proposal_drafts', {
  id: PHASE8_PROPOSAL_DRAFT_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  document_id: PHASE8_PROPOSAL_DOCUMENT_ID,
  lineage_id: id(7, 1),
  revision_number: 1,
  document_sha256: PHASE8_PROPOSAL_SHA,
  page_set_hash: hex(PHASE8_PROPOSAL_PAGES.map((page) => page.text).join('\n')),
  parser_name: 'phase8-synthetic-parser',
  parser_version: 'phase8-synthetic-parser-v1',
  status: 'ready',
  created_by: user.id,
});
await insert('proposal_audit_runs', {
  id: PHASE8_PROPOSAL_AUDIT_RUN_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  proposal_draft_id: PHASE8_PROPOSAL_DRAFT_ID,
  checklist_generation_run_id: PHASE8_CHECKLIST_RUN_ID,
  input_hash: PHASE8_FIXTURE_HASH,
  fixture_version: 'proposal-audit-known-answer-v1',
  section_parser_version: 'proposal-section-parser-v1',
  claim_segmenter_version: 'proposal-claim-segmenter-v1',
  schema_version: 'proposal-audit-schema-v1',
  matcher_version: 'proposal-response-matcher-v1',
  support_policy_version: 'proposal-support-policy-v1',
  contradiction_version: 'proposal-contradiction-v1',
  severity_version: 'proposal-finding-severity-v1',
  evaluator_version: 'proposal-audit-evaluator-v1',
  status: 'completed',
  section_count: 8,
  claim_count: 8,
  finding_count: 9,
  created_by: user.id,
  completed_at: new Date().toISOString(),
});

const reportSnapshot = aggregateReport(reportingKnownAnswerInput);
await insert('report_generation_runs', {
  id: PHASE8_REPORT_RUN_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  analysis_run_id: PHASE8_ANALYSIS_RUN_ID,
  verification_run_id: PHASE8_VERIFICATION_RUN_ID,
  checklist_generation_run_id: PHASE8_CHECKLIST_RUN_ID,
  readiness_snapshot_id: PHASE8_READINESS_ID,
  proposal_audit_run_id: PHASE8_PROPOSAL_AUDIT_RUN_ID,
  proposal_draft_id: PHASE8_PROPOSAL_DRAFT_ID,
  report_type: 'executive',
  report_version: 'report-v1',
  input_version: 'report-input-v1',
  aggregation_version: 'report-aggregation-v1',
  schema_version: 'report-schema-v1',
  input_hash: PHASE8_REPORT_INPUT_HASH,
  source_snapshot_at: new Date().toISOString(),
  status: 'completed',
  demo: true,
  data_classification: 'synthetic_demo',
  created_by: user.id,
  completed_at: new Date().toISOString(),
});
await insert('report_snapshots', {
  id: PHASE8_REPORT_SNAPSHOT_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  report_generation_run_id: PHASE8_REPORT_RUN_ID,
  report_type: 'executive',
  report_version: 'report-v1',
  schema_version: 'report-schema-v1',
  input_hash: PHASE8_REPORT_INPUT_HASH,
  demo: true,
  data_classification: 'synthetic_demo',
  summary: reportSnapshot.summary,
  snapshot: reportSnapshot,
  generated_by: user.id,
});
const html = generateReportHtml(reportSnapshot);
const htmlBytes = Buffer.from(html, 'utf8');
const htmlSha = sha256Canonical(html);
const exportPath = `${PHASE8_DEMO_WORKSPACE_ID}/${PHASE8_REPORT_SNAPSHOT_ID}/${PHASE8_EXPORT_MANIFEST_ID}/prepared-fallback.html`;
const { error: fallbackUploadError } = await admin.storage
  .from('workspace-exports')
  .upload(exportPath, htmlBytes, { contentType: 'text/html', upsert: true });
if (fallbackUploadError) throw fallbackUploadError;
await insert('export_manifests', {
  id: PHASE8_EXPORT_MANIFEST_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  report_snapshot_id: PHASE8_REPORT_SNAPSHOT_ID,
  export_format: 'html',
  csv_dataset: null,
  manifest_version: 'export-manifest-v1',
  export_schema_version: 'report-html-v1',
  input_hash: PHASE8_REPORT_INPUT_HASH,
  status: 'completed',
  created_by: user.id,
});
await insert('export_artifacts', {
  id: PHASE8_EXPORT_ARTIFACT_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  export_manifest_id: PHASE8_EXPORT_MANIFEST_ID,
  bucket_id: 'workspace-exports',
  object_path: exportPath,
  normalized_filename: 'prepared-fallback.html',
  content_type: 'text/html',
  content_length: htmlBytes.byteLength,
  sha256: htmlSha,
  demo: true,
  status: 'active',
  retention_until: '2099-12-31T23:59:59Z',
  created_by: user.id,
});

await insert('phase8_demo_scopes', {
  id: PHASE8_DEMO_SCOPE_ID,
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  authorized_identity_id: user.id,
  source_document_id: PHASE8_SOURCE_DOCUMENT_ID,
  proposal_document_id: PHASE8_PROPOSAL_DOCUMENT_ID,
  analysis_run_id: PHASE8_ANALYSIS_RUN_ID,
  verification_run_id: PHASE8_VERIFICATION_RUN_ID,
  checklist_generation_run_id: PHASE8_CHECKLIST_RUN_ID,
  readiness_snapshot_id: PHASE8_READINESS_ID,
  proposal_audit_run_id: PHASE8_PROPOSAL_AUDIT_RUN_ID,
  proposal_draft_id: PHASE8_PROPOSAL_DRAFT_ID,
  report_snapshot_id: PHASE8_REPORT_SNAPSHOT_ID,
  fixture_version: manifest.binding.fixtureVersion,
  fixture_hash: PHASE8_FIXTURE_HASH,
  document_set_hash: PHASE8_DOCUMENT_SET_HASH,
  compatibility_fingerprint: manifest.binding.compatibilityFingerprint,
  cache_key: manifest.binding.cacheKey,
  report_input_hash: PHASE8_REPORT_INPUT_HASH,
  binding: manifest.binding,
  synthetic_marker: manifest.binding.syntheticMarker,
  scope_version: manifest.binding.scopeVersion,
  active_mode: 'prepared',
});
await insert('phase8_demo_cache_entries', {
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  scope_id: PHASE8_DEMO_SCOPE_ID,
  cache_key: manifest.binding.cacheKey,
  report_snapshot_id: PHASE8_REPORT_SNAPSHOT_ID,
  binding_hash: manifest.bindingHash,
  fixture_hash: PHASE8_FIXTURE_HASH,
  status: 'valid',
  cache_version: 'phase8-demo-cache-v1',
});
await insert('phase8_demo_fallbacks', {
  workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  scope_id: PHASE8_DEMO_SCOPE_ID,
  report_snapshot_id: PHASE8_REPORT_SNAPSHOT_ID,
  export_artifact_id: PHASE8_EXPORT_ARTIFACT_ID,
  content_sha256: htmlSha,
  label: 'Prepared fallback snapshot — synthetic data',
  status: 'active',
  fallback_version: 'phase8-report-fallback-v1',
});

const { data: candidateCount } = await admin
  .from('requirement_candidates')
  .select('id', { count: 'exact' })
  .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
  .eq('analysis_run_id', PHASE8_ANALYSIS_RUN_ID);
if (candidateCount?.length !== 24) throw new Error('phase8_candidate_count_mismatch');
const { data: scope } = await admin
  .from('phase8_demo_scopes')
  .select('binding,synthetic_marker')
  .eq('id', PHASE8_DEMO_SCOPE_ID)
  .single();
if (sha256Canonical(scope?.binding) !== sha256Canonical(manifest.binding))
  throw new Error('phase8_scope_binding_drift');

console.info(
  JSON.stringify({
    projectRef: 'uxmxkdjschbekkbnweby',
    scopeId: PHASE8_DEMO_SCOPE_ID,
    workspaceId: PHASE8_DEMO_WORKSPACE_ID,
    authorizedIdentityId: user.id,
    fixtureVersion: manifest.binding.fixtureVersion,
    fixtureHash: PHASE8_FIXTURE_HASH,
    documentSetHash: PHASE8_DOCUMENT_SET_HASH,
    cacheKey: manifest.binding.cacheKey,
    bindingHash: manifest.bindingHash,
    candidates: 24,
    providerCalls: 0,
    providerSpendUsd: 0,
  }),
);
