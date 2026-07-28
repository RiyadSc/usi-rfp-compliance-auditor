import { expect, test, type Page } from '@playwright/test';

function required(name: string): string {
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

test.describe('Phase 4 requirement register and evidence viewer', () => {
  test.describe.configure({ mode: 'serial' });
  test('renders multi-axis findings, filters, anchored evidence, relationships, review audit, and isolation', async ({
    page,
    browser,
  }) => {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await signIn(page, 'A');
    const workspaceId = await createWorkspace(page, `Phase4 E2E ${Date.now()}`);
    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 100 });
    const user = users.find((item) => item.email === required('DEMO_USER_A_EMAIL'))!;
    const documentId = crypto.randomUUID(),
      parseRunId = crypto.randomUUID(),
      analysisRunId = crypto.randomUUID(),
      verificationRunId = crypto.randomUUID();
    const pages = [
      'An authorized representative must sign Proposal Form A-1.',
      'Email submissions are not accepted. Proposals must use the portal.',
      'Original insurance limit was $2,000,000 per occurrence.',
      'ADDENDUM 2 supersedes the old amount and replaces it with $3,000,000 per occurrence.',
      '',
      'Required attachments checklist: Proposal Form A-1.',
      'ADDENDUM 3: North Campus insurance must be $3,000,000.',
      'ADDENDUM 4: North Campus insurance must be $4,000,000. No ordering rule controls.',
    ];
    await admin.from('documents').insert({
      id: documentId,
      workspace_id: workspaceId,
      created_by: user.id,
      original_filename: 'phase4.pdf',
      normalized_filename: 'phase4.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceId}/e2e/${documentId}.pdf`,
      size_bytes: 100,
      sha256: '9'.repeat(64),
      status: 'parsed',
      page_count: pages.length,
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
    const { data: pageRows } = await admin
      .from('document_pages')
      .insert(
        pages.map((text, index) => ({
          document_id: documentId,
          workspace_id: workspaceId,
          parse_run_id: parseRunId,
          page_number: index + 1,
          pdf_page_index: index,
          text,
          text_sha256: String(index + 1).repeat(64),
          char_count: text.length,
          extraction_status: index === 4 ? 'error' : 'ok',
          warnings: index === 4 ? ['image-only synthetic page'] : [],
          parser_name: 'test',
          parser_version: '1',
        })),
      )
      .select('id, page_number');
    await admin.from('analysis_runs').insert({
      id: analysisRunId,
      workspace_id: workspaceId,
      document_id: documentId,
      status: 'completed',
      stage: 'complete',
      created_by: user.id,
      candidate_count: 8,
      completed_at: new Date().toISOString(),
    });
    const candidates = Array.from({ length: 8 }, () => crypto.randomUUID());
    const candidateRows = [
      [
        candidates[0],
        'required_form',
        'Signed Proposal Form A-1',
        'An authorized representative must sign Proposal Form A-1.',
        1,
        pages[0],
      ],
      [
        candidates[1],
        'submission_instruction',
        'Email submission permitted',
        'Proposals may be submitted by email.',
        2,
        'Email submissions are not accepted.',
      ],
      [
        candidates[2],
        'insurance',
        'Old insurance limit',
        'Insurance limit was $2,000,000 per occurrence.',
        3,
        pages[2],
      ],
      [
        candidates[3],
        'technical_requirement',
        'Image-only obligation',
        'Image page contains an obligation.',
        5,
        'unavailable',
      ],
      [
        candidates[4],
        'attachment',
        'Certificate proof',
        'Submit a certificate of insurance.',
        4,
        '$3,000,000 per occurrence.',
      ],
      [
        candidates[5],
        'required_form',
        'Form A-1 checklist restatement',
        'Proposal Form A-1 is required.',
        6,
        pages[5],
      ],
      [
        candidates[6],
        'signature',
        'Pending challenge candidate',
        'An authorized representative must sign Proposal Form A-1.',
        1,
        pages[0],
      ],
      [
        candidates[7],
        'insurance',
        'Unresolved North Campus insurance conflict',
        'Addendum 3 states North Campus insurance must be $3,000,000.',
        7,
        pages[6],
      ],
    ];
    await admin.from('requirement_candidates').insert(
      candidateRows.map(([id, category, title, obligation, preliminaryPage, evidenceQuote]) => ({
        id,
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        document_id: documentId,
        category,
        title,
        obligation,
        mandatory_class: 'mandatory',
        preliminary_page: preliminaryPage,
        evidence_quote: evidenceQuote,
        confidence: 0.8,
        status: 'unverified',
        prompt_version: 'extract-v1',
        schema_version: 'candidate-v1',
        model_id: 'mock-extract-v1',
      })),
    );
    await admin.from('verification_runs').insert({
      id: verificationRunId,
      workspace_id: workspaceId,
      analysis_run_id: analysisRunId,
      status: 'completed',
      version: 1,
      input_hash: 'e2e-phase4',
      prompt_version: 'verify-v1',
      schema_version: 'verification-finding-v1',
      retrieval_version: 'verify-retrieval-v1',
      normalization_version: 'evidence-nfkc-v1',
      provider: 'mock',
      model: 'mock-verify-v1',
      reasoning_effort: 'medium',
      candidate_count: 8,
      finding_count: 7,
      created_by: user.id,
      completed_at: new Date().toISOString(),
    });
    const findingIds = Array.from({ length: 7 }, () => crypto.randomUUID());
    const findingAxes = [
      [
        'supported',
        'active',
        'requires_human_confirmation',
        'The exact source supports the signature obligation.',
      ],
      ['contradicted', 'active', 'none_identified', 'The source explicitly prohibits email.'],
      [
        'supported',
        'superseded',
        'requires_company_artifact',
        'The original requirement is supported but superseded.',
      ],
      ['parser_uncertain', 'undetermined', 'undetermined', 'Parser damage prevents assessment.'],
      [
        'unsupported',
        'undetermined',
        'requires_company_artifact',
        'Challenge failed, so support cannot be persisted.',
      ],
      [
        'partially_supported',
        'active',
        'requires_company_artifact',
        'Challenge found a material qualification omission.',
      ],
      [
        'supported',
        'conflicting',
        'requires_company_artifact',
        'Both addenda are supported, but neither is definitively active.',
      ],
    ];
    const findingCandidateIndexes = [0, 1, 2, 3, 4, 5, 7];
    await admin.from('verification_findings').insert(
      findingIds.map((id, index) => ({
        id,
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[findingCandidateIndexes[index]],
        finding_version: 1,
        source_support_status: findingAxes[index][0],
        precedence_status: findingAxes[index][1],
        proof_requirement: findingAxes[index][2],
        rationale: findingAxes[index][3],
        prompt_version: 'verify-v1',
        schema_version: 'verification-finding-v1',
        model_id: 'mock-verify-v1',
        decision_engine_version: 'verification-decision-v3',
        challenge_status: index === 4 ? 'failed' : index === 3 ? 'not_required' : 'completed',
        deterministic_model_disagreement:
          index === 4 ? ['Pass A entails but deterministic engine selected unsupported.'] : [],
      })),
    );
    await admin.from('verification_pass_results').insert([
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[0],
        pass_type: 'entailment',
        status: 'succeeded',
        prompt_version: 'verify-entailment-v3',
        schema_version: 'verification-entailment-v1',
        model_id: 'mock-verify-v3',
        result: {
          candidateId: candidates[0],
          classification: 'entails',
          machineOnly: true,
        },
      },
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[0],
        pass_type: 'challenge',
        status: 'succeeded',
        prompt_version: 'verify-challenge-v1',
        schema_version: 'verification-challenge-v1',
        model_id: 'mock-verify-v3',
        result: {
          candidateId: candidates[0],
          assessment: 'no_material_objection',
          machineOnly: true,
        },
      },
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[1],
        pass_type: 'entailment',
        status: 'succeeded',
        prompt_version: 'verify-entailment-v3',
        schema_version: 'verification-entailment-v1',
        model_id: 'mock-verify-v3',
        result: { candidateId: candidates[1], classification: 'entails', machineOnly: true },
      },
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[1],
        pass_type: 'challenge',
        status: 'succeeded',
        prompt_version: 'verify-challenge-v1',
        schema_version: 'verification-challenge-v1',
        model_id: 'mock-verify-v3',
        result: {
          candidateId: candidates[1],
          assessment: 'contradictory_evidence',
          machineOnly: true,
        },
      },
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[4],
        pass_type: 'entailment',
        status: 'succeeded',
        prompt_version: 'verify-entailment-v3',
        schema_version: 'verification-entailment-v1',
        model_id: 'mock-verify-v3',
        result: { candidateId: candidates[4], classification: 'entails', machineOnly: true },
      },
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[4],
        pass_type: 'challenge',
        status: 'failed',
        prompt_version: 'verify-challenge-v1',
        schema_version: 'verification-challenge-v1',
        model_id: 'mock-verify-v3',
        error_category: 'provider_unavailable',
        error_detail: 'Synthetic failed challenge',
      },
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[5],
        pass_type: 'entailment',
        status: 'succeeded',
        prompt_version: 'verify-entailment-v3',
        schema_version: 'verification-entailment-v1',
        model_id: 'mock-verify-v3',
        result: { candidateId: candidates[5], classification: 'entails', machineOnly: true },
      },
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[5],
        pass_type: 'challenge',
        status: 'succeeded',
        prompt_version: 'verify-challenge-v1',
        schema_version: 'verification-challenge-v1',
        model_id: 'mock-verify-v3',
        result: {
          candidateId: candidates[5],
          assessment: 'material_qualification_missing',
          machineOnly: true,
        },
      },
      {
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidates[6],
        pass_type: 'entailment',
        status: 'succeeded',
        prompt_version: 'verify-entailment-v3',
        schema_version: 'verification-entailment-v1',
        model_id: 'mock-verify-v3',
        result: { candidateId: candidates[6], classification: 'entails', machineOnly: true },
      },
    ]);
    const pageId = (n: number) => pageRows!.find((row) => row.page_number === n)!.id;
    await admin.from('verification_evidence').insert([
      {
        workspace_id: workspaceId,
        finding_id: findingIds[0],
        document_id: documentId,
        document_page_id: pageId(1),
        page_number: 1,
        evidence_role: 'supporting',
        quote_exact: pages[0],
        quote_normalized: pages[0],
        normalization_version: 'evidence-nfkc-v1',
        match_type: 'exact',
        validated: true,
      },
      {
        workspace_id: workspaceId,
        finding_id: findingIds[1],
        document_id: documentId,
        document_page_id: pageId(2),
        page_number: 2,
        evidence_role: 'contradicting',
        quote_exact: 'Email submissions are not accepted.',
        quote_normalized: 'Email submissions are not accepted.',
        normalization_version: 'evidence-nfkc-v1',
        match_type: 'exact',
        validated: true,
      },
      {
        workspace_id: workspaceId,
        finding_id: findingIds[2],
        document_id: documentId,
        document_page_id: pageId(3),
        page_number: 3,
        evidence_role: 'supporting',
        quote_exact: pages[2],
        quote_normalized: pages[2],
        normalization_version: 'evidence-nfkc-v1',
        match_type: 'exact',
        validated: true,
      },
      {
        workspace_id: workspaceId,
        finding_id: findingIds[2],
        document_id: documentId,
        document_page_id: pageId(4),
        page_number: 4,
        evidence_role: 'addendum',
        quote_exact: pages[3],
        quote_normalized: pages[3],
        normalization_version: 'evidence-nfkc-v1',
        match_type: 'exact',
        validated: true,
      },
      {
        workspace_id: workspaceId,
        finding_id: findingIds[4],
        document_id: documentId,
        document_page_id: pageId(4),
        page_number: 4,
        evidence_role: 'supporting',
        quote_exact: '$3,000,000 per occurrence.',
        quote_normalized: '$3,000,000 per occurrence.',
        normalization_version: 'evidence-nfkc-v1',
        match_type: 'exact',
        validated: true,
      },
      {
        workspace_id: workspaceId,
        finding_id: findingIds[5],
        document_id: documentId,
        document_page_id: pageId(6),
        page_number: 6,
        evidence_role: 'supporting',
        quote_exact: pages[5],
        quote_normalized: pages[5],
        normalization_version: 'evidence-nfkc-v1',
        match_type: 'exact',
        validated: true,
      },
    ]);
    await admin.from('requirement_relationships').insert({
      workspace_id: workspaceId,
      verification_run_id: verificationRunId,
      finding_id: findingIds[0],
      source_candidate_id: candidates[0],
      target_candidate_id: candidates[5],
      relationship_type: 'restatement',
      rationale: 'Checklist restates the same Form A-1 obligation.',
      machine_confidence: 0.9,
    });
    await admin.from('requirement_relationships').insert([
      {
        workspace_id: workspaceId,
        verification_run_id: verificationRunId,
        finding_id: findingIds[2],
        source_candidate_id: candidates[2],
        target_candidate_id: candidates[4],
        relationship_type: 'supersedes',
        rationale: 'Addendum 2 explicitly supersedes the original insurance amount.',
        original_document_id: documentId,
        original_page_number: 3,
        addendum_document_id: documentId,
        addendum_page_number: 4,
        precedence_quote: pages[3],
      },
      {
        workspace_id: workspaceId,
        verification_run_id: verificationRunId,
        finding_id: findingIds[6],
        source_candidate_id: candidates[7],
        target_candidate_id: candidates[4],
        relationship_type: 'conflicts_with',
        rationale: 'The addenda state different values without an ordering rule.',
      },
    ]);

    await page.goto(`/w/${workspaceId}/requirements`);
    await expect(page.getByRole('heading', { name: 'Requirement register' })).toBeVisible();
    await page.getByLabel('Role view').selectOption('technical');
    const requirementsTable = page.getByRole('table');
    await expect(requirementsTable.getByText('Backed by the RFP').first()).toBeVisible();
    await expect(requirementsTable.getByText('Conflicts with the RFP').first()).toBeVisible();
    await expect(requirementsTable.getByText('Replaced by an addendum').first()).toBeVisible();
    await expect(requirementsTable.getByText('Document needs manual review').first()).toBeVisible();
    await page.getByLabel('Source status').selectOption('contradicted');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('link', { name: 'Email submission permitted' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Signed Proposal Form A-1' })).not.toBeVisible();
    await page.getByRole('link', { name: 'Clear' }).click();
    await page.getByRole('link', { name: 'Signed Proposal Form A-1' }).click();
    await expect(page.getByText('What the RFP requires', { exact: true })).toBeVisible();
    await expect(page.getByText(pages[0], { exact: true }).first()).toBeVisible();
    await expect(page.locator('mark')).toContainText('Proposal Form A-1');
    await expect(page.getByRole('link', { name: 'related requirement' })).toBeVisible();
    await expect(page.getByText('succeeded: entails')).toBeVisible();
    await expect(page.getByText('succeeded: no material objection')).toBeVisible();
    await expect(page.getByText(/no pixel-level PDF highlight is claimed/i)).toBeVisible();
    const sourceLink = page.getByRole('link', { name: /Open source page/ });
    await expect(sourceLink).toHaveAttribute(
      'href',
      new RegExp(`/documents/${documentId}\\?page=1`),
    );
    await page.getByLabel('Decision').selectOption('accepted');
    await page.getByLabel('Reviewer note').fill('Evidence checked');
    await page.getByRole('button', { name: 'Record review' }).click();
    await expect(page.getByText('Evidence checked')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Requirement list', exact: true }).click();
    await page.getByRole('link', { name: 'Email submission permitted' }).click();
    await expect(
      page.getByText('Email submissions are not accepted.', { exact: true }).first(),
    ).toBeVisible();
    await page.getByLabel('Decision').selectOption('rejected');
    await page.getByLabel('Reviewer note').fill('Machine scope is wrong');
    await page.getByRole('button', { name: 'Record review' }).click();
    await expect(page.getByText('Machine scope is wrong')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Requirement list', exact: true }).click();
    await page.getByRole('link', { name: 'Pending challenge candidate' }).click();
    await expect(page.getByText('succeeded: entails')).toBeVisible();
    await expect(
      page
        .getByText('Pass B — challenge', { exact: true })
        .locator('..')
        .getByText('Team review pending', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Requirement list', exact: true }).click();
    await page.getByRole('link', { name: 'Certificate proof' }).click();
    await expect(
      page.getByText(/Challenge failed; this candidate cannot be source-supported/),
    ).toBeVisible();
    await expect(page.getByText('Deterministic/model disagreement')).toBeVisible();
    await page.getByRole('link', { name: 'Requirement list', exact: true }).click();
    await page.getByRole('link', { name: 'Unresolved North Campus insurance conflict' }).click();
    await expect(
      page
        .getByText('Is this still current?', { exact: true })
        .locator('..')
        .getByText('Conflicting source instructions', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Requirement list', exact: true }).click();
    await page.getByRole('link', { name: 'Image-only obligation' }).click();
    await page.getByLabel('Decision').selectOption('needs_follow_up');
    await page.getByLabel('Reviewer note').fill('Confirm with procurement');
    await page.getByRole('button', { name: 'Record review' }).click();
    await expect(page.getByText('Confirm with procurement')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Follow-up needed', { exact: true }).first()).toBeVisible();
    const detailUrl = page.url();
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signIn(pageB, 'B');
    await pageB.goto(detailUrl);
    await expect(pageB.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await ctxB.close();
  });
});
