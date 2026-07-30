import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { aggregateReport, REPORT_VERSIONS } from '../../packages/domain/src/reporting';
import { reportingKnownAnswerInput } from '../../fixtures/eval/reporting-known-answer';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`E2E requires ${name}`);
  return value;
};
const hex = () => crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64);
async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/login');
}
async function createWorkspace(page: Page, name: string) {
  await page.getByLabel(/Opportunity name/).fill(name);
  await page.getByRole('button', { name: 'Create opportunity' }).click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);
  return page.url().match(/\/w\/([0-9a-f-]{36})/)![1];
}

test('Phase 7 deterministic report exposes five missing forms, evidence navigation, private exports, and isolation', async ({
  page,
  browser,
}) => {
  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await signIn(page, 'A');
  const workspaceId = await createWorkspace(page, `Phase7 E2E ${Date.now()}`);
  const {
    data: { users },
  } = await admin.auth.admin.listUsers({ perPage: 100 });
  const userA = users.find((user) => user.email === required('DEMO_USER_A_EMAIL'))!;

  const input = structuredClone(reportingKnownAnswerInput);
  const remap = new Map<string, string>();
  const remapUuid = (value: string) => {
    if (!remap.has(value)) remap.set(value, crypto.randomUUID());
    return remap.get(value)!;
  };
  const rewritten = JSON.parse(JSON.stringify(input), (_key, value) =>
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
      ? remapUuid(value)
      : value,
  ) as typeof input;
  rewritten.workspace.id = workspaceId;
  rewritten.workspace.name = 'Harbor City Reporting Demo';
  rewritten.checklistItems[0].candidateId = rewritten.requirements[0].candidateId;
  rewritten.checklistItems[0].findingId = rewritten.requirements[0].findingId;
  const snapshot = aggregateReport(rewritten);
  const sourceDocumentId = rewritten.checklistItems[0].sourceDocumentId!;
  const proposalDocumentId = rewritten.proposalFindings[0].proposalDocumentId;
  const sourceParseId = crypto.randomUUID(),
    proposalParseId = crypto.randomUUID();
  const sourcePageIds = Array.from({ length: 12 }, () => crypto.randomUUID());
  const proposalPageId = crypto.randomUUID();
  const firstItem = rewritten.checklistItems[0];
  const firstRequirement = rewritten.requirements[0];
  const firstEvidenceId = crypto.randomUUID(),
    reportRunId = crypto.randomUUID(),
    reportSnapshotId = crypto.randomUUID();

  await admin.from('documents').insert([
    {
      id: sourceDocumentId,
      workspace_id: workspaceId,
      created_by: userA.id,
      document_type: 'primary_rfp',
      original_filename: 'phase7-known-answer-rfp.pdf',
      normalized_filename: 'phase7-known-answer-rfp.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceId}/phase7/source.pdf`,
      size_bytes: 100,
      sha256: hex(),
      status: 'parsed',
      page_count: 12,
      parser_name: 'synthetic-fixture',
      parser_version: '1',
    },
    {
      id: proposalDocumentId,
      workspace_id: workspaceId,
      created_by: userA.id,
      document_type: 'proposal_draft',
      original_filename: 'phase7-known-answer-proposal.pdf',
      normalized_filename: 'phase7-known-answer-proposal.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceId}/phase7/proposal.pdf`,
      size_bytes: 100,
      sha256: hex(),
      status: 'parsed',
      page_count: 1,
      parser_name: 'synthetic-fixture',
      parser_version: '1',
    },
  ]);
  await admin.from('parse_runs').insert([
    {
      id: sourceParseId,
      document_id: sourceDocumentId,
      workspace_id: workspaceId,
      stage: 'parse',
      status: 'succeeded',
      parser_name: 'synthetic-fixture',
      parser_version: '1',
      finished_at: new Date().toISOString(),
    },
    {
      id: proposalParseId,
      document_id: proposalDocumentId,
      workspace_id: workspaceId,
      stage: 'parse',
      status: 'succeeded',
      parser_name: 'synthetic-fixture',
      parser_version: '1',
      finished_at: new Date().toISOString(),
    },
  ]);
  await admin.from('document_pages').insert([
    ...sourcePageIds.map((id, index) => ({
      id,
      document_id: sourceDocumentId,
      workspace_id: workspaceId,
      parse_run_id: sourceParseId,
      page_number: index + 1,
      pdf_page_index: index,
      text: `Offerors must submit completed Form ${Math.max(1, index)}.`,
      text_sha256: hex(),
      char_count: 45,
      extraction_status: 'ok',
      parser_name: 'synthetic-fixture',
      parser_version: '1',
    })),
    {
      id: proposalPageId,
      document_id: proposalDocumentId,
      workspace_id: workspaceId,
      parse_run_id: proposalParseId,
      page_number: 1,
      pdf_page_index: 0,
      text: 'Synthetic proposal draft for reporting.',
      text_sha256: hex(),
      char_count: 39,
      extraction_status: 'ok',
      parser_name: 'synthetic-fixture',
      parser_version: '1',
    },
  ]);
  await admin.from('analysis_runs').insert({
    id: rewritten.runs.analysisRunId,
    workspace_id: workspaceId,
    document_id: sourceDocumentId,
    status: 'completed',
    stage: 'complete',
    created_by: userA.id,
    candidate_count: 1,
    completed_at: new Date().toISOString(),
    verification_compatibility_fingerprint: rewritten.versions.phase4Fingerprint,
  });
  await admin.from('requirement_candidates').insert({
    id: firstRequirement.candidateId,
    workspace_id: workspaceId,
    analysis_run_id: rewritten.runs.analysisRunId,
    document_id: sourceDocumentId,
    category: 'required_form',
    title: firstRequirement.title,
    obligation: firstRequirement.exactQuote!,
    mandatory_class: 'mandatory',
    preliminary_page: firstRequirement.pageNumber,
    evidence_quote: firstRequirement.exactQuote,
    confidence: 1,
    status: 'unverified',
    prompt_version: 'extract-v1',
    schema_version: 'candidate-v1',
    model_id: 'mock',
  });
  await admin.from('verification_runs').insert({
    id: rewritten.runs.verificationRunId,
    workspace_id: workspaceId,
    analysis_run_id: rewritten.runs.analysisRunId,
    status: 'completed',
    version: 1,
    input_hash: hex(),
    prompt_version: 'verify-entailment-v7+verify-challenge-v4',
    schema_version: 'verification-final-assessment-v1',
    retrieval_version: 'candidate-centered',
    normalization_version: 'evidence-nfkc-v1',
    created_by: userA.id,
    candidate_count: 1,
    finding_count: 1,
    completed_at: new Date().toISOString(),
    compatibility_fingerprint: rewritten.versions.phase4Fingerprint,
  });
  await admin.from('verification_findings').insert({
    id: firstRequirement.findingId,
    workspace_id: workspaceId,
    analysis_run_id: rewritten.runs.analysisRunId,
    verification_run_id: rewritten.runs.verificationRunId,
    candidate_id: firstRequirement.candidateId,
    finding_version: 1,
    source_support_status: firstRequirement.sourceSupportStatus,
    precedence_status: firstRequirement.precedenceStatus,
    proof_requirement: firstRequirement.proofRequirement,
    rationale: 'Synthetic exact evidence.',
    prompt_version: 'verify-entailment-v7',
    schema_version: 'verification-final-assessment-v1',
    model_id: 'mock',
    decision_engine_version: 'verification-decision-v6',
    challenge_status: 'completed',
  });
  await admin.from('verification_evidence').insert({
    id: firstEvidenceId,
    workspace_id: workspaceId,
    finding_id: firstRequirement.findingId,
    document_id: sourceDocumentId,
    document_page_id: sourcePageIds[firstRequirement.pageNumber! - 1],
    page_number: firstRequirement.pageNumber,
    evidence_role: 'supporting',
    quote_exact: firstRequirement.exactQuote,
    quote_normalized: firstRequirement.exactQuote,
    normalization_version: 'evidence-nfkc-v1',
    match_type: 'exact',
    validated: true,
  });
  await admin.from('human_review_decisions').insert({
    workspace_id: workspaceId,
    finding_id: firstRequirement.findingId,
    reviewer_id: userA.id,
    decision: 'accepted',
    note: 'Synthetic report navigation fixture.',
  });
  await admin.from('checklist_generation_runs').insert({
    id: rewritten.runs.checklistGenerationRunId,
    workspace_id: workspaceId,
    analysis_run_id: rewritten.runs.analysisRunId,
    verification_run_id: rewritten.runs.verificationRunId,
    input_hash: hex(),
    fixture_version: 'reporting-known-answer-v1',
    eligibility_version: 'checklist-eligibility-v1',
    category_version: 'checklist-category-v1',
    generator_version: rewritten.versions.checklistGenerator,
    blocker_version: rewritten.versions.blockerEngine,
    readiness_version: rewritten.versions.readinessEngine,
    schema_version: 'checklist-schema-v1',
    status: 'completed',
    source_count: 1,
    item_count: 1,
    created_by: userA.id,
    completed_at: new Date().toISOString(),
  });
  await admin.from('checklist_items').insert({
    id: firstItem.id,
    workspace_id: workspaceId,
    analysis_run_id: rewritten.runs.analysisRunId,
    verification_run_id: rewritten.runs.verificationRunId,
    finding_id: firstRequirement.findingId,
    candidate_id: firstRequirement.candidateId,
    stable_key: hex(),
    title: firstItem.title,
    obligation: firstItem.sourceQuote!,
    category: firstItem.category,
    mandatory: true,
    eligibility_class: firstItem.eligibilityClass,
    eligibility_reason: 'Synthetic active obligation.',
    contributes_to_required_total: true,
    source_support_status: firstItem.sourceSupportStatus,
    precedence_status: firstItem.precedenceStatus,
    proof_requirement: firstItem.proofRequirement,
    source_human_review_status: firstItem.humanReviewStatus,
    workflow_status: firstItem.workflowStatus,
    artifact_state: firstItem.artifactState,
    due_at: firstItem.dueAt,
    due_timezone: firstItem.dueTimezone,
    relationship_role: firstItem.relationshipRole,
    lifecycle_status: 'active',
    source_version: 'verification-final-assessment-v1',
    generation_version: rewritten.versions.checklistGenerator,
  });
  await admin.from('checklist_generation_run_items').insert({
    workspace_id: workspaceId,
    generation_run_id: rewritten.runs.checklistGenerationRunId,
    checklist_item_id: firstItem.id,
  });
  await admin.from('checklist_item_sources').insert({
    workspace_id: workspaceId,
    checklist_item_id: firstItem.id,
    finding_id: firstRequirement.findingId,
    verification_evidence_id: firstEvidenceId,
    document_id: sourceDocumentId,
    document_page_id: sourcePageIds[firstRequirement.pageNumber! - 1],
    page_number: firstRequirement.pageNumber,
    quote_exact: firstRequirement.exactQuote,
    match_type: 'exact',
    source_version: 'verification-final-assessment-v1',
  });
  await admin.from('checklist_required_artifacts').insert({
    workspace_id: workspaceId,
    checklist_item_id: firstItem.id,
    artifact_kind: 'form',
    label: firstItem.title,
    required: true,
    state: 'missing',
    source_version: rewritten.versions.checklistGenerator,
  });
  await admin.from('checklist_blockers').insert({
    workspace_id: workspaceId,
    checklist_item_id: firstItem.id,
    stable_key: hex(),
    blocker_type: 'missing_mandatory_form',
    severity: 'critical',
    source: 'required_artifact',
    reason: 'A required form artifact is missing.',
    readiness_impact: 'blocks',
    status: 'open',
    engine_version: rewritten.versions.blockerEngine,
  });
  await admin.from('checklist_readiness_snapshots').insert({
    id: rewritten.runs.readinessSnapshotId,
    workspace_id: workspaceId,
    generation_run_id: rewritten.runs.checklistGenerationRunId,
    input_hash: hex(),
    status: rewritten.readiness.state,
    total_required: rewritten.readiness.totalRequired,
    completed_required: rewritten.readiness.completedRequired,
    incomplete_required: rewritten.readiness.incompleteRequired,
    blocked_items: rewritten.readiness.blockedItems,
    unresolved_items: rewritten.readiness.unresolvedItems,
    items_requiring_human_proof: rewritten.readiness.humanProofItems,
    informational_items: rewritten.readiness.informationalItems,
    active_critical_blockers: rewritten.readiness.criticalBlockers,
    warnings: rewritten.readiness.warnings,
    excluded_items: rewritten.readiness.excludedItems,
    summary: rewritten.readiness.summary,
    engine_version: rewritten.versions.readinessEngine,
  });
  await admin.from('proposal_drafts').insert({
    id: rewritten.runs.proposalDraftId,
    workspace_id: workspaceId,
    document_id: proposalDocumentId,
    lineage_id: crypto.randomUUID(),
    revision_number: rewritten.runs.proposalRevision,
    document_sha256: hex(),
    page_set_hash: hex(),
    parser_name: 'synthetic-fixture',
    parser_version: '1',
    status: 'ready',
    created_by: userA.id,
  });
  await admin.from('proposal_audit_runs').insert({
    id: rewritten.runs.proposalAuditRunId,
    workspace_id: workspaceId,
    proposal_draft_id: rewritten.runs.proposalDraftId,
    checklist_generation_run_id: rewritten.runs.checklistGenerationRunId,
    input_hash: hex(),
    fixture_version: 'reporting-known-answer-v1',
    section_parser_version: rewritten.versions.proposalParser,
    claim_segmenter_version: rewritten.versions.proposalSegmenter,
    schema_version: 'proposal-audit-schema-v1',
    matcher_version: rewritten.versions.proposalMatcher,
    support_policy_version: 'proposal-support-policy-v1',
    contradiction_version: rewritten.versions.proposalContradiction,
    severity_version: rewritten.versions.proposalSeverity,
    evaluator_version: rewritten.versions.proposalEvaluator,
    status: 'completed',
    section_count: 0,
    claim_count: 0,
    finding_count: 0,
    created_by: userA.id,
    completed_at: new Date().toISOString(),
  });
  await admin.from('report_generation_runs').insert({
    id: reportRunId,
    workspace_id: workspaceId,
    analysis_run_id: rewritten.runs.analysisRunId,
    verification_run_id: rewritten.runs.verificationRunId,
    checklist_generation_run_id: rewritten.runs.checklistGenerationRunId,
    readiness_snapshot_id: rewritten.runs.readinessSnapshotId,
    proposal_audit_run_id: rewritten.runs.proposalAuditRunId,
    proposal_draft_id: rewritten.runs.proposalDraftId,
    report_type: snapshot.reportType,
    report_version: REPORT_VERSIONS.executive,
    input_version: REPORT_VERSIONS.input,
    aggregation_version: REPORT_VERSIONS.aggregation,
    schema_version: REPORT_VERSIONS.schema,
    input_hash: snapshot.inputHash,
    source_snapshot_at: rewritten.sourceSnapshotAt,
    status: 'completed',
    demo: true,
    data_classification: 'synthetic_demo',
    created_by: userA.id,
    completed_at: new Date().toISOString(),
  });
  await admin.from('report_snapshots').insert({
    id: reportSnapshotId,
    workspace_id: workspaceId,
    report_generation_run_id: reportRunId,
    report_type: snapshot.reportType,
    report_version: REPORT_VERSIONS.executive,
    schema_version: REPORT_VERSIONS.schema,
    input_hash: snapshot.inputHash,
    demo: true,
    data_classification: 'synthetic_demo',
    summary: snapshot.summary,
    snapshot,
    generated_by: userA.id,
  });

  await page.goto(`/w/${workspaceId}/reports/${reportSnapshotId}`);
  await expect(page.getByText('DEMO — SYNTHETIC DATA — NOT FOR SUBMISSION')).toBeVisible();
  await expect(page.getByText('3 of 10')).toBeVisible();
  const missingSection = page.locator('#missing-artifacts');
  await expect(
    missingSection.getByRole('row').filter({ hasText: /Missing mandatory Form [A-E]-[1-5]/ }),
  ).toHaveCount(5);
  await expect(page.locator('body')).not.toContainText(
    /\bCompliant\b|\bApproved\b|Safe to submit|Guaranteed complete/i,
  );
  await missingSection.getByRole('link', { name: 'Missing mandatory Form A-1' }).click();
  await expect(page.getByRole('heading', { name: 'Missing mandatory Form A-1' })).toBeVisible();
  await expect(
    page.getByRole('blockquote').filter({ hasText: 'Offerors must submit completed Form 1.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Open original page 2/ }).click();
  await expect(page).toHaveURL(new RegExp(`/documents/${sourceDocumentId}\\?page=2`));
  await expect(
    page.getByText('Offerors must submit completed Form 1.', { exact: true }),
  ).toBeVisible();

  await page.goto(`/w/${workspaceId}/reports/${reportSnapshotId}`);
  await page.locator('select[name="format"]').selectOption('csv');
  await page.locator('select[name="dataset"]').selectOption('missing_artifacts');
  await page.getByRole('button', { name: 'Create export' }).click();
  await expect(page.getByText('Private export generated.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download (5-minute link)' })).toBeVisible();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await signIn(pageB, 'B');
  await pageB.goto(`/w/${workspaceId}/reports/${reportSnapshotId}`);
  await expect(pageB.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await contextB.close();
});
