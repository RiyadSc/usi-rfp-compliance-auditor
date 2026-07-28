import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  CHECKLIST_BLOCKER_VERSION,
  CHECKLIST_CATEGORY_VERSION,
  CHECKLIST_ELIGIBILITY_VERSION,
  CHECKLIST_GENERATOR_VERSION,
  CHECKLIST_READINESS_VERSION,
  CHECKLIST_SCHEMA_VERSION,
  calculateBlockers,
  calculateReadiness,
  generateChecklistItems,
} from '@usi/domain';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`E2E requires ${name}`);
  return value;
}
async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
}
async function createWorkspace(page: Page, name: string) {
  await page.getByLabel(/Opportunity name/).fill(name);
  await page.getByRole('button', { name: 'Create opportunity' }).click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);
  return page.url().match(/\/w\/([0-9a-f-]{36})/)![1];
}

test('Phase 5 checklist detects five missing forms and preserves evidence, workflow, review, and isolation', async ({
  page,
  browser,
}) => {
  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await signIn(page, 'A');
  const workspaceId = await createWorkspace(page, `Phase5 E2E ${Date.now()}`);
  const {
    data: { users },
  } = await admin.auth.admin.listUsers({ perPage: 100 });
  const userA = users.find((user) => user.email === required('DEMO_USER_A_EMAIL'))!;
  const documentId = crypto.randomUUID(),
    parseRunId = crypto.randomUUID(),
    analysisRunId = crypto.randomUUID(),
    verificationRunId = crypto.randomUUID(),
    generationRunId = crypto.randomUUID();
  const quotes = Array.from(
    { length: 10 },
    (_, index) =>
      `Offerors must complete and submit mandatory Form ${String.fromCharCode(65 + index)}-${index + 1}.`,
  );
  await admin.from('documents').insert({
    id: documentId,
    workspace_id: workspaceId,
    created_by: userA.id,
    original_filename: 'phase5-forms.pdf',
    normalized_filename: 'phase5-forms.pdf',
    mime_type: 'application/pdf',
    object_key: `${workspaceId}/e2e/${documentId}.pdf`,
    size_bytes: 100,
    sha256: crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
    status: 'parsed',
    page_count: 10,
    parser_name: 'test',
    parser_version: '1',
  });
  await admin.from('parse_runs').insert({
    id: parseRunId,
    document_id: documentId,
    workspace_id: workspaceId,
    stage: 'parse',
    status: 'succeeded',
    parser_name: 'test',
    parser_version: '1',
  });
  const { data: pages } = await admin
    .from('document_pages')
    .insert(
      quotes.map((text, index) => ({
        document_id: documentId,
        workspace_id: workspaceId,
        parse_run_id: parseRunId,
        page_number: index + 1,
        pdf_page_index: index,
        text,
        text_sha256: String(index + 1)
          .repeat(64)
          .slice(0, 64),
        char_count: text.length,
        extraction_status: 'ok',
        parser_name: 'test',
        parser_version: '1',
      })),
    )
    .select('id,page_number');
  await admin.from('analysis_runs').insert({
    id: analysisRunId,
    workspace_id: workspaceId,
    document_id: documentId,
    status: 'completed',
    stage: 'complete',
    created_by: userA.id,
    candidate_count: 10,
    completed_at: new Date().toISOString(),
  });
  const candidateIds = quotes.map(() => crypto.randomUUID());
  await admin.from('requirement_candidates').insert(
    quotes.map((quote, index) => ({
      id: candidateIds[index],
      workspace_id: workspaceId,
      analysis_run_id: analysisRunId,
      document_id: documentId,
      category: 'required_form',
      title: `Mandatory Form ${String.fromCharCode(65 + index)}-${index + 1}`,
      obligation: quote,
      mandatory_class: 'mandatory',
      preliminary_page: index + 1,
      evidence_quote: quote,
      confidence: 1,
      status: 'unverified',
      prompt_version: 'extract-v1',
      schema_version: 'candidate-v1',
      model_id: 'mock',
    })),
  );
  await admin.from('verification_runs').insert({
    id: verificationRunId,
    workspace_id: workspaceId,
    analysis_run_id: analysisRunId,
    status: 'completed',
    version: 1,
    input_hash: crypto.randomUUID().replaceAll('-', ''),
    prompt_version: 'verify-entailment-v7+verify-challenge-v4',
    schema_version: 'verification-final-assessment-v1',
    retrieval_version: 'verify-retrieval-v2-candidate-centered',
    normalization_version: 'evidence-nfkc-v1',
    provider: 'mock',
    model: 'mock',
    reasoning_effort: 'low',
    candidate_count: 10,
    finding_count: 10,
    created_by: userA.id,
    completed_at: new Date().toISOString(),
  });
  const findingIds = quotes.map(() => crypto.randomUUID());
  const evidenceIds = quotes.map(() => crypto.randomUUID());
  await admin.from('verification_findings').insert(
    quotes.map((_, index) => ({
      id: findingIds[index],
      workspace_id: workspaceId,
      analysis_run_id: analysisRunId,
      verification_run_id: verificationRunId,
      candidate_id: candidateIds[index],
      finding_version: 1,
      source_support_status: 'supported',
      precedence_status: 'active',
      proof_requirement: 'none_identified',
      machine_status: 'machine_assessment_only',
      rationale: 'Exact active synthetic source evidence.',
      prompt_version: 'verify-entailment-v7+verify-challenge-v4',
      schema_version: 'verification-final-assessment-v1',
      model_id: 'mock',
      decision_engine_version: 'verification-decision-v6',
      challenge_status: 'completed',
    })),
  );
  await admin.from('verification_evidence').insert(
    quotes.map((quote, index) => ({
      id: evidenceIds[index],
      workspace_id: workspaceId,
      finding_id: findingIds[index],
      document_id: documentId,
      document_page_id: pages!.find((row) => row.page_number === index + 1)!.id,
      page_number: index + 1,
      evidence_role: 'supporting',
      quote_exact: quote,
      quote_normalized: quote,
      normalization_version: 'evidence-nfkc-v1',
      match_type: 'exact',
      validated: true,
    })),
  );
  await admin.from('human_review_decisions').insert(
    findingIds.map((findingId) => ({
      workspace_id: workspaceId,
      finding_id: findingId,
      reviewer_id: userA.id,
      decision: 'accepted',
      note: 'Synthetic fixture review.',
    })),
  );
  const generated = generateChecklistItems(
    quotes.map((quote, index) => ({
      workspaceId,
      analysisRunId,
      verificationRunId,
      findingId: findingIds[index],
      findingVersion: 1,
      candidateId: candidateIds[index],
      title: `Mandatory Form ${String.fromCharCode(65 + index)}-${index + 1}`,
      obligation: quote,
      sourceCategory: 'required_form',
      mandatory: true,
      sourceSupportStatus: 'supported' as const,
      precedenceStatus: 'active' as const,
      proofRequirement: 'none_identified' as const,
      machineStatus: 'machine_assessment_only' as const,
      humanReviewStatus: 'accepted' as const,
      documentId,
      documentPageId: pages!.find((row) => row.page_number === index + 1)!.id,
      pageNumber: index + 1,
      exactQuote: quote,
      parserConfidence: 1,
      dueAt: null,
      dueTimezone: null,
      relationshipRole: 'atomic' as const,
      verificationEvidenceId: evidenceIds[index],
      validatedEvidence: true,
    })),
  );
  await admin.from('checklist_generation_runs').insert({
    id: generationRunId,
    workspace_id: workspaceId,
    analysis_run_id: analysisRunId,
    verification_run_id: verificationRunId,
    input_hash: 'b'.repeat(64),
    fixture_version: 'checklist-five-missing-forms-v1',
    eligibility_version: CHECKLIST_ELIGIBILITY_VERSION,
    category_version: CHECKLIST_CATEGORY_VERSION,
    generator_version: CHECKLIST_GENERATOR_VERSION,
    blocker_version: CHECKLIST_BLOCKER_VERSION,
    readiness_version: CHECKLIST_READINESS_VERSION,
    schema_version: CHECKLIST_SCHEMA_VERSION,
    status: 'completed',
    source_count: 10,
    item_count: 10,
    created_by: userA.id,
    completed_at: new Date().toISOString(),
  });
  const persisted = [] as { id: string; stableKey: string }[];
  for (const item of generated) {
    const index = candidateIds.indexOf(item.candidateId);
    const missing = index < 5;
    const { data } = await admin
      .from('checklist_items')
      .insert({
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        finding_id: item.findingId,
        candidate_id: item.candidateId,
        stable_key: item.stableKey,
        title: item.title,
        obligation: item.obligation,
        category: item.category,
        mandatory: true,
        eligibility_class: item.eligibility,
        eligibility_reason: item.eligibilityReason,
        contributes_to_required_total: true,
        source_support_status: item.sourceSupportStatus,
        precedence_status: item.precedenceStatus,
        proof_requirement: item.proofRequirement,
        machine_status: item.machineStatus,
        source_human_review_status: item.humanReviewStatus,
        workflow_status: missing ? 'not_started' : 'completed',
        artifact_state: missing ? 'missing' : 'reviewed',
        relationship_role: 'atomic',
        source_version: 'verification-final-assessment-v1',
        generation_version: CHECKLIST_GENERATOR_VERSION,
      })
      .select('id')
      .single();
    persisted.push({ id: data!.id, stableKey: item.stableKey });
    await admin.from('checklist_generation_run_items').insert({
      workspace_id: workspaceId,
      generation_run_id: generationRunId,
      checklist_item_id: data!.id,
    });
    const sourceInsert = await admin.from('checklist_item_sources').insert({
      workspace_id: workspaceId,
      checklist_item_id: data!.id,
      finding_id: item.findingId,
      verification_evidence_id: evidenceIds[index],
      document_id: documentId,
      document_page_id: item.documentPageId,
      page_number: index + 1,
      quote_exact: quotes[index],
      match_type: 'exact',
      parser_confidence: 1,
      source_version: 'verification-final-assessment-v1',
    });
    expect(sourceInsert.error).toBeNull();
    await admin.from('checklist_required_artifacts').insert({
      workspace_id: workspaceId,
      checklist_item_id: data!.id,
      artifact_kind: 'form',
      label: item.title,
      required: true,
      state: missing ? 'missing' : 'reviewed',
      source_version: CHECKLIST_GENERATOR_VERSION,
    });
  }
  const blockerInputs = generated.map((item) => {
    const index = candidateIds.indexOf(item.candidateId);
    return {
      ...item,
      artifactState: index < 5 ? ('missing' as const) : ('reviewed' as const),
      workflowStatus: index < 5 ? ('not_started' as const) : ('completed' as const),
      waiverStatus: 'none' as const,
    };
  });
  const blockers = calculateBlockers(blockerInputs).filter(
    (blocker) => blocker.type === 'missing_mandatory_form',
  );
  for (const blocker of blockers)
    await admin.from('checklist_blockers').insert({
      workspace_id: workspaceId,
      checklist_item_id: persisted.find((item) => item.stableKey === blocker.itemStableKey)!.id,
      stable_key: blocker.stableKey,
      blocker_type: blocker.type,
      severity: blocker.severity,
      source: blocker.rule,
      reason: blocker.message,
      readiness_impact: 'blocks',
      status: 'open',
      engine_version: blocker.engineVersion,
    });
  const readiness = calculateReadiness(blockerInputs, blockers);
  await admin.from('checklist_readiness_snapshots').insert({
    workspace_id: workspaceId,
    generation_run_id: generationRunId,
    input_hash: 'c'.repeat(64),
    status: readiness.status,
    total_required: readiness.totalRequiredItems,
    completed_required: readiness.completedRequiredItems,
    incomplete_required: readiness.incompleteRequiredItems,
    blocked_items: readiness.blockedItems,
    unresolved_items: readiness.unresolvedItems,
    items_requiring_human_proof: readiness.itemsRequiringHumanProof,
    informational_items: 0,
    active_critical_blockers: readiness.activeCriticalBlockers,
    warnings: 0,
    excluded_items: 0,
    excluded_reasons: {},
    summary: readiness.summary,
    engine_version: readiness.engineVersion,
  });

  await page.goto(`/w/${workspaceId}/checklist`);
  await expect(
    page.getByRole('heading', { name: 'Submission checklist and blockers' }),
  ).toBeVisible();
  await expect(page.getByText('Blocked by 5 required items')).toBeVisible();
  const blockingGroup = page.getByRole('region', { name: /Blocking submission/ });
  await expect(blockingGroup).toBeVisible();
  await expect(blockingGroup.getByText('Blocked', { exact: true })).toHaveCount(5);
  await page.getByRole('link', { name: 'Mandatory Form A-1' }).click();
  await expect(page.getByRole('blockquote')).toHaveText(quotes[0]);
  const sourceLink = page.getByRole('link', { name: 'Open original page 1 →' });
  await expect(sourceLink).toHaveAttribute(
    'href',
    `/w/${workspaceId}/documents/${documentId}?page=1`,
  );
  await sourceLink.click();
  await expect(page).toHaveURL(new RegExp(`/documents/${documentId}\\?page=1$`));
  await page.goBack();
  await page.locator('select[name="owner"]').selectOption(userA.id);
  await page.getByRole('button', { name: 'Save assignments' }).click();
  await expect(page.getByRole('status')).toHaveText('Change recorded.');
  await page.locator('select[name="document"]').selectOption(documentId);
  await page.getByRole('button', { name: 'Link artifact' }).click();
  await expect(page.getByRole('status')).toHaveText('Change recorded.');
  await page.locator('select[name="artifactState"]').selectOption('reviewed');
  await page.getByLabel('Artifact review note').fill('Synthetic artifact review complete.');
  await page.getByRole('button', { name: 'Record artifact review' }).click();
  await expect(page.getByRole('status')).toHaveText('Change recorded.');
  await page.locator('select[name="status"]').first().selectOption('in_progress');
  await page.getByRole('button', { name: 'Update workflow' }).click();
  await page.getByLabel('Exception note').fill('Synthetic reviewer exception note.');
  await page.getByRole('button', { name: 'Record exception note' }).click();
  await page.getByLabel('Waiver reason').fill('Synthetic waiver request for UI coverage.');
  await page.getByRole('button', { name: 'Request waiver' }).click();
  await expect(page.getByText('Pending waiver:', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(
    /\bCompliant\b|\bApproved\b|Safe to submit|Guaranteed complete/i,
  );
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await signIn(pageB, 'B');
  await pageB.goto(`/w/${workspaceId}/checklist/${persisted[0].id}`);
  await expect(pageB.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await contextB.close();
});
