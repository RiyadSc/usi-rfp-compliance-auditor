import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`E2E requires ${name}`);
  return value;
};
async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/login');
}
async function createWorkspace(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel(/Opportunity name/).fill(name);
  await page.getByRole('button', { name: 'Create opportunity' }).click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  return page.url().match(/\/w\/([0-9a-f-]{36})/)![1];
}
const hex = () => crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64);

test('Phase 6 proposal audit keeps evidence, findings, human decisions, and workspace isolation distinct', async ({
  page,
  browser,
}) => {
  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await signIn(page, 'A');
  const workspaceId = await createWorkspace(page, `Phase6 E2E ${Date.now()}`);
  const {
    data: { users },
  } = await admin.auth.admin.listUsers({ perPage: 100 });
  const userA = users.find((user) => user.email === required('DEMO_USER_A_EMAIL'))!;
  const ids = Object.fromEntries(
    [
      'sourceDocument',
      'sourceParse',
      'sourcePage',
      'analysis',
      'verification',
      'candidate',
      'verificationFinding',
      'verificationEvidence',
      'checklistRun',
      'checklistItem',
      'proposalDocument',
      'proposalParse',
      'proposalPage',
      'proposalDraft',
      'auditRun',
      'section',
      'claim',
      'match',
      'coverage',
      'auditFinding',
    ].map((name) => [name, crypto.randomUUID()]),
  ) as Record<string, string>;
  const quote = 'Offerors must submit completed Form P-6.';
  const claim = 'We will submit completed Form P-6.';
  await admin.from('documents').insert([
    {
      id: ids.sourceDocument,
      workspace_id: workspaceId,
      created_by: userA.id,
      document_type: 'primary_rfp',
      original_filename: 'phase6-source.pdf',
      normalized_filename: 'phase6-source.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceId}/e2e/${ids.sourceDocument}.pdf`,
      size_bytes: 100,
      sha256: hex(),
      status: 'parsed',
      page_count: 1,
      parser_name: 'test',
      parser_version: '1',
    },
    {
      id: ids.proposalDocument,
      workspace_id: workspaceId,
      created_by: userA.id,
      document_type: 'proposal_draft',
      original_filename: 'phase6-proposal.pdf',
      normalized_filename: 'phase6-proposal.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceId}/e2e/${ids.proposalDocument}.pdf`,
      size_bytes: 100,
      sha256: hex(),
      status: 'parsed',
      page_count: 1,
      parser_name: 'test',
      parser_version: '1',
    },
  ]);
  await admin.from('parse_runs').insert([
    {
      id: ids.sourceParse,
      document_id: ids.sourceDocument,
      workspace_id: workspaceId,
      stage: 'parse',
      status: 'succeeded',
      parser_name: 'test',
      parser_version: '1',
    },
    {
      id: ids.proposalParse,
      document_id: ids.proposalDocument,
      workspace_id: workspaceId,
      stage: 'parse',
      status: 'succeeded',
      parser_name: 'test',
      parser_version: '1',
    },
  ]);
  await admin.from('document_pages').insert([
    {
      id: ids.sourcePage,
      document_id: ids.sourceDocument,
      workspace_id: workspaceId,
      parse_run_id: ids.sourceParse,
      page_number: 1,
      pdf_page_index: 0,
      text: quote,
      text_sha256: hex(),
      char_count: quote.length,
      extraction_status: 'ok',
      parser_name: 'test',
      parser_version: '1',
    },
    {
      id: ids.proposalPage,
      document_id: ids.proposalDocument,
      workspace_id: workspaceId,
      parse_run_id: ids.proposalParse,
      page_number: 1,
      pdf_page_index: 0,
      text: claim,
      text_sha256: hex(),
      char_count: claim.length,
      extraction_status: 'ok',
      parser_name: 'test',
      parser_version: '1',
    },
  ]);
  await admin.from('analysis_runs').insert({
    id: ids.analysis,
    workspace_id: workspaceId,
    document_id: ids.sourceDocument,
    status: 'completed',
    stage: 'complete',
    created_by: userA.id,
    candidate_count: 1,
    completed_at: new Date().toISOString(),
  });
  await admin.from('requirement_candidates').insert({
    id: ids.candidate,
    workspace_id: workspaceId,
    analysis_run_id: ids.analysis,
    document_id: ids.sourceDocument,
    category: 'required_form',
    title: 'Mandatory Form P-6',
    obligation: quote,
    mandatory_class: 'mandatory',
    preliminary_page: 1,
    evidence_quote: quote,
    confidence: 1,
    status: 'unverified',
    prompt_version: 'extract-v1',
    schema_version: 'candidate-v1',
    model_id: 'mock',
  });
  await admin.from('verification_runs').insert({
    id: ids.verification,
    workspace_id: workspaceId,
    analysis_run_id: ids.analysis,
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
  });
  await admin.from('verification_findings').insert({
    id: ids.verificationFinding,
    workspace_id: workspaceId,
    analysis_run_id: ids.analysis,
    verification_run_id: ids.verification,
    candidate_id: ids.candidate,
    finding_version: 1,
    source_support_status: 'supported',
    precedence_status: 'active',
    proof_requirement: 'none_identified',
    machine_status: 'machine_assessment_only',
    rationale: 'Exact synthetic source.',
    prompt_version: 'verify-entailment-v7',
    schema_version: 'verification-final-assessment-v1',
    model_id: 'mock',
    decision_engine_version: 'verification-decision-v6',
    challenge_status: 'completed',
  });
  await admin.from('verification_evidence').insert({
    id: ids.verificationEvidence,
    workspace_id: workspaceId,
    finding_id: ids.verificationFinding,
    document_id: ids.sourceDocument,
    document_page_id: ids.sourcePage,
    page_number: 1,
    evidence_role: 'supporting',
    quote_exact: quote,
    quote_normalized: quote,
    normalization_version: 'evidence-nfkc-v1',
    match_type: 'exact',
    validated: true,
  });
  await admin.from('human_review_decisions').insert({
    workspace_id: workspaceId,
    finding_id: ids.verificationFinding,
    reviewer_id: userA.id,
    decision: 'accepted',
    note: 'Synthetic accepted.',
  });
  await admin.from('checklist_generation_runs').insert({
    id: ids.checklistRun,
    workspace_id: workspaceId,
    analysis_run_id: ids.analysis,
    verification_run_id: ids.verification,
    input_hash: hex(),
    fixture_version: 'phase6-e2e-v1',
    eligibility_version: 'checklist-eligibility-v1',
    category_version: 'checklist-category-v1',
    generator_version: 'checklist-generator-v1',
    blocker_version: 'checklist-blockers-v1',
    readiness_version: 'checklist-readiness-v1',
    schema_version: 'checklist-schema-v1',
    status: 'completed',
    source_count: 1,
    item_count: 1,
    created_by: userA.id,
    completed_at: new Date().toISOString(),
  });
  await admin.from('checklist_items').insert({
    id: ids.checklistItem,
    workspace_id: workspaceId,
    analysis_run_id: ids.analysis,
    verification_run_id: ids.verification,
    finding_id: ids.verificationFinding,
    candidate_id: ids.candidate,
    stable_key: hex(),
    title: 'Mandatory Form P-6',
    obligation: quote,
    category: 'mandatory_form',
    mandatory: true,
    eligibility_class: 'ordinary_active',
    eligibility_reason: 'eligible_active_requirement',
    contributes_to_required_total: true,
    source_support_status: 'supported',
    precedence_status: 'active',
    proof_requirement: 'none_identified',
    machine_status: 'machine_assessment_only',
    source_human_review_status: 'accepted',
    workflow_status: 'not_started',
    artifact_state: 'missing',
    relationship_role: 'atomic',
    source_version: 'verification-final-assessment-v1',
    generation_version: 'checklist-generator-v1',
  });
  await admin.from('checklist_generation_run_items').insert({
    workspace_id: workspaceId,
    generation_run_id: ids.checklistRun,
    checklist_item_id: ids.checklistItem,
  });
  await admin.from('checklist_item_sources').insert({
    workspace_id: workspaceId,
    checklist_item_id: ids.checklistItem,
    finding_id: ids.verificationFinding,
    verification_evidence_id: ids.verificationEvidence,
    document_id: ids.sourceDocument,
    document_page_id: ids.sourcePage,
    page_number: 1,
    quote_exact: quote,
    match_type: 'exact',
    parser_confidence: 1,
    source_version: 'verification-final-assessment-v1',
  });
  await admin.from('proposal_drafts').insert({
    id: ids.proposalDraft,
    workspace_id: workspaceId,
    document_id: ids.proposalDocument,
    lineage_id: crypto.randomUUID(),
    revision_number: 1,
    document_sha256: hex(),
    page_set_hash: hex(),
    parser_name: 'test',
    parser_version: '1',
    status: 'ready',
    created_by: userA.id,
  });
  await admin.from('proposal_audit_runs').insert({
    id: ids.auditRun,
    workspace_id: workspaceId,
    proposal_draft_id: ids.proposalDraft,
    checklist_generation_run_id: ids.checklistRun,
    input_hash: hex(),
    fixture_version: 'phase6-e2e-v1',
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
    finding_count: 1,
    created_by: userA.id,
    completed_at: new Date().toISOString(),
  });
  await admin.from('proposal_sections').insert({
    id: ids.section,
    workspace_id: workspaceId,
    proposal_audit_run_id: ids.auditRun,
    proposal_draft_id: ids.proposalDraft,
    document_page_id: ids.proposalPage,
    stable_key: hex(),
    heading: 'Forms',
    normalized_heading: 'forms',
    page_number: 1,
    start_offset: 0,
    end_offset: claim.length,
    section_text: claim,
    parser_uncertain: false,
    parser_version: 'proposal-section-parser-v1',
  });
  await admin.from('proposal_claims').insert({
    id: ids.claim,
    workspace_id: workspaceId,
    proposal_audit_run_id: ids.auditRun,
    proposal_section_id: ids.section,
    stable_key: hex(),
    claim_type: 'requirement_response',
    claim_text: claim,
    normalized_text: claim,
    page_number: 1,
    start_offset: 0,
    end_offset: claim.length,
    parser_uncertain: false,
    injection_signals: [],
    segmenter_version: 'proposal-claim-segmenter-v1',
  });
  await admin.from('proposal_claim_requirement_matches').insert({
    id: ids.match,
    workspace_id: workspaceId,
    proposal_audit_run_id: ids.auditRun,
    proposal_claim_id: ids.claim,
    checklist_item_id: ids.checklistItem,
    match_score: 1,
    match_reason: 'exact form identifier',
    support_status: 'supported',
    consistency_status: 'not_applicable',
    rationale: 'Active source supports the response commitment.',
    proposal_facts: [],
    requirement_facts: [],
    machine_only: true,
    human_resolution_status: 'pending',
    matcher_version: 'proposal-response-matcher-v1',
  });
  await admin.from('proposal_response_coverage').insert({
    id: ids.coverage,
    workspace_id: workspaceId,
    proposal_audit_run_id: ids.auditRun,
    checklist_item_id: ids.checklistItem,
    coverage_status: 'addressed',
    reason: 'matched atomic response found',
    matched_claim_keys: [],
    machine_only: true,
    human_resolution_status: 'pending',
    matcher_version: 'proposal-response-matcher-v1',
  });
  await admin.from('proposal_audit_findings').insert({
    id: ids.auditFinding,
    workspace_id: workspaceId,
    proposal_audit_run_id: ids.auditRun,
    stable_key: hex(),
    finding_type: 'human_proof_required',
    severity: 'warning',
    title: 'Human proof review',
    detail: 'A reviewer must inspect the completed form.',
    checklist_item_id: ids.checklistItem,
    proposal_claim_id: ids.claim,
    proposal_page_id: ids.proposalPage,
    proposal_page_number: 1,
    source_document_id: ids.sourceDocument,
    source_page_id: ids.sourcePage,
    source_page_number: 1,
    source_quote: quote,
    machine_only: true,
    human_resolution_status: 'pending',
    workflow_status: 'open',
    rule_version: 'proposal-support-policy-v1',
  });
  await admin.from('proposal_finding_evidence').insert([
    {
      workspace_id: workspaceId,
      proposal_finding_id: ids.auditFinding,
      evidence_role: 'proposal_claim',
      document_id: ids.proposalDocument,
      document_page_id: ids.proposalPage,
      page_number: 1,
      exact_quote: claim,
      match_type: 'exact',
    },
    {
      workspace_id: workspaceId,
      proposal_finding_id: ids.auditFinding,
      evidence_role: 'requirement_source',
      document_id: ids.sourceDocument,
      document_page_id: ids.sourcePage,
      page_number: 1,
      exact_quote: quote,
      match_type: 'exact',
    },
  ]);

  await page.goto(`/w/${workspaceId}`);
  await page.getByRole('link', { name: 'Proposal Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Proposal draft audit' })).toBeVisible();
  await Promise.all([
    page.waitForURL(new RegExp(`/proposal-audit/${ids.auditRun}$`), { timeout: 30_000 }),
    page.getByRole('link', { name: 'phase6-proposal.pdf' }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'phase6-proposal.pdf' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('cell', { name: 'addressed' })).toBeVisible();
  await expect(page.getByText(claim, { exact: true })).toBeVisible();
  await expect(page.getByRole('blockquote').filter({ hasText: quote })).toBeVisible();
  const proposalLink = page.getByRole('link', { name: 'Open proposal page' });
  await expect(proposalLink).toHaveAttribute(
    'href',
    `/w/${workspaceId}/documents/${ids.proposalDocument}?page=1`,
  );
  await expect(page.getByRole('link', { name: 'Source page 1' })).toHaveAttribute(
    'href',
    `/w/${workspaceId}/documents/${ids.sourceDocument}?page=1`,
  );
  await page.getByLabel('Team decision').selectOption('accepted');
  await page.getByLabel('Finding workflow').selectOption('resolved');
  await page.getByLabel('Reason').fill('Synthetic reviewer accepted this machine assessment.');
  await page.getByRole('button', { name: 'Record decision' }).click();
  await expect(
    page.getByText('Team decision recorded. This does not authorize submission.'),
  ).toBeVisible();
  await page.goto(`/w/${workspaceId}/proposal-audit/${ids.auditRun}`);
  await expect(page.locator('span').filter({ hasText: /^Resolved$/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Source assessment accepted', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(
    /\bCompliant\b|\bApproved\b|Safe to submit|Guaranteed complete/i,
  );
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await signIn(pageB, 'B');
  await pageB.goto(`/w/${workspaceId}/proposal-audit/${ids.auditRun}`);
  await expect(pageB.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await contextB.close();
});
