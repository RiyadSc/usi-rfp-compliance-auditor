import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import {
  PROPOSAL_AUDIT_VERSIONS,
  auditProposalDraft,
  type ProposalAuditRequirement,
  type ProposalCompanyEvidence,
  type ProposalPage,
} from '@usi/domain';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type ProposalAuditRequest = {
  workspaceId: string;
  documentId: string;
  checklistGenerationRunId: string;
  actorId: string;
  priorDraftId?: string | null;
  fixtureVersion?: string | null;
};

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

function requireOk(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function runProposalAudit(request: ProposalAuditRequest): Promise<{
  auditRunId: string;
  proposalDraftId: string;
  inputHash: string;
  reused: boolean;
  findingCount: number;
}> {
  const admin = createSupabaseAdminClient();
  const { data: workspace, error: workspaceError } = await admin
    .from('workspaces')
    .select('id,name,customer')
    .eq('id', request.workspaceId)
    .maybeSingle();
  requireOk(workspaceError, 'workspace lookup failed');
  if (!workspace) throw new Error('workspace_not_found');

  const { data: member } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', request.workspaceId)
    .eq('user_id', request.actorId)
    .maybeSingle();
  if (!member) throw new Error('proposal_audit_actor_not_in_workspace');

  const { data: document, error: documentError } = await admin
    .from('documents')
    .select(
      'id,workspace_id,document_type,normalized_filename,sha256,status,parser_name,parser_version,deleted_at',
    )
    .eq('id', request.documentId)
    .eq('workspace_id', request.workspaceId)
    .maybeSingle();
  requireOk(documentError, 'proposal document lookup failed');
  if (
    !document ||
    document.document_type !== 'proposal_draft' ||
    document.status !== 'parsed' ||
    document.deleted_at
  )
    throw new Error('parsed_workspace_proposal_draft_required');
  if (!document.sha256 || !/^[0-9a-f]{64}$/.test(document.sha256))
    throw new Error('proposal_document_hash_required');

  const { data: checklistRun, error: checklistRunError } = await admin
    .from('checklist_generation_runs')
    .select('id,workspace_id,analysis_run_id,verification_run_id,status')
    .eq('id', request.checklistGenerationRunId)
    .eq('workspace_id', request.workspaceId)
    .eq('status', 'completed')
    .maybeSingle();
  requireOk(checklistRunError, 'checklist run lookup failed');
  if (!checklistRun) throw new Error('completed_workspace_checklist_run_required');

  const { data: pageRows, error: pagesError } = await admin
    .from('document_pages')
    .select('id,workspace_id,document_id,page_number,text,text_sha256,extraction_status,warnings')
    .eq('workspace_id', request.workspaceId)
    .eq('document_id', request.documentId)
    .order('page_number');
  requireOk(pagesError, 'proposal pages lookup failed');
  if (!pageRows?.length) throw new Error('parsed_proposal_pages_required');
  const pages: ProposalPage[] = pageRows.map((page) => ({
    workspaceId: page.workspace_id,
    documentId: page.document_id,
    pageId: page.id,
    pageNumber: page.page_number,
    text: page.text,
    textSha256: page.text_sha256,
    extractionStatus: page.extraction_status,
    warnings: Array.isArray(page.warnings) ? page.warnings.map(String) : [],
  }));
  const pageSetHash = sha(
    JSON.stringify(pages.map((page) => [page.pageId, page.pageNumber, page.textSha256])),
  );

  const { data: runItems, error: runItemsError } = await admin
    .from('checklist_generation_run_items')
    .select('checklist_item_id')
    .eq('workspace_id', request.workspaceId)
    .eq('generation_run_id', request.checklistGenerationRunId);
  requireOk(runItemsError, 'checklist run item lookup failed');
  const itemIds = (runItems ?? []).map((row) => row.checklist_item_id);
  if (!itemIds.length) throw new Error('checklist_run_has_no_items');

  const { data: items, error: itemsError } = await admin
    .from('checklist_items')
    .select('*')
    .eq('workspace_id', request.workspaceId)
    .in('id', itemIds);
  requireOk(itemsError, 'checklist item lookup failed');
  const { data: sources, error: sourcesError } = await admin
    .from('checklist_item_sources')
    .select('*')
    .eq('workspace_id', request.workspaceId)
    .in('checklist_item_id', itemIds);
  requireOk(sourcesError, 'checklist source lookup failed');
  const sourceByItem = new Map((sources ?? []).map((source) => [source.checklist_item_id, source]));

  const requirements: ProposalAuditRequirement[] = (items ?? []).map((item) => {
    const source = sourceByItem.get(item.id);
    if (!source) throw new Error(`checklist_source_missing:${item.id}`);
    return {
      workspaceId: request.workspaceId,
      checklistItemId: item.id,
      findingId: item.finding_id,
      candidateId: item.candidate_id,
      verificationRunId: item.verification_run_id,
      title: item.title,
      obligation: item.obligation,
      category: item.category,
      mandatory: item.mandatory,
      eligibilityClass: item.eligibility_class,
      lifecycleStatus: item.lifecycle_status,
      sourceSupportStatus: item.source_support_status,
      precedenceStatus: item.precedence_status,
      proofRequirement: item.proof_requirement,
      humanReviewStatus: item.source_human_review_status,
      workflowStatus: item.workflow_status,
      relationshipRole: item.relationship_role,
      documentId: source.document_id,
      pageId: source.document_page_id,
      pageNumber: source.page_number,
      exactQuote: source.quote_exact,
      evidenceId: source.verification_evidence_id,
    };
  });

  const { data: reviewedArtifacts } = await admin
    .from('checklist_required_artifacts')
    .select('id,checklist_item_id')
    .eq('workspace_id', request.workspaceId)
    .eq('state', 'reviewed')
    .in('checklist_item_id', itemIds);
  const reviewedIds = (reviewedArtifacts ?? []).map((row) => row.id);
  const companyEvidence: ProposalCompanyEvidence[] = [];
  if (reviewedIds.length) {
    const { data: links } = await admin
      .from('checklist_artifact_links')
      .select('id,required_artifact_id,document_id')
      .eq('workspace_id', request.workspaceId)
      .eq('state', 'linked')
      .in('required_artifact_id', reviewedIds);
    for (const link of links ?? []) {
      const { data: evidencePage } = await admin
        .from('document_pages')
        .select('id,page_number,text')
        .eq('workspace_id', request.workspaceId)
        .eq('document_id', link.document_id)
        .eq('extraction_status', 'ok')
        .order('page_number')
        .limit(1)
        .maybeSingle();
      if (evidencePage?.text.trim())
        companyEvidence.push({
          id: link.id,
          workspaceId: request.workspaceId,
          kind: 'company_artifact',
          text: evidencePage.text.slice(0, 12000),
          documentId: link.document_id,
          pageId: evidencePage.id,
          pageNumber: evidencePage.page_number,
          exactQuote: evidencePage.text.slice(0, 8000),
          reviewed: true,
        });
    }
  }

  const result = auditProposalDraft({
    workspaceId: request.workspaceId,
    proposalDocumentId: request.documentId,
    proposalDocumentSha256: document.sha256,
    proposalIdentity: {
      procurementName: workspace.name ?? '',
      procurementNumber:
        document.normalized_filename.match(/(?:RFP|IFB|RFQ)[-_ ]?[A-Z0-9.-]+/i)?.[0] ?? '',
      customer: workspace.customer ?? '',
    },
    pages,
    requirements,
    companyEvidence,
  });
  const effectiveInputHash = sha(
    JSON.stringify({
      auditInputHash: result.inputHash,
      priorDraftId: request.priorDraftId ?? null,
    }),
  );
  const correctionFindings: Array<{
    stableKey: string;
    type: 'corrected_in_revision';
    severity: 'informational';
    title: string;
    detail: string;
    checklistItemId: string | null;
    claimStableKey: null;
    proposalPageId: null;
    proposalPageNumber: null;
    sourceDocumentId: string | null;
    sourcePageId: string | null;
    sourcePageNumber: number | null;
    sourceQuote: string | null;
    ruleVersion: string;
  }> = [];
  if (request.priorDraftId) {
    const { data: priorRun } = await admin
      .from('proposal_audit_runs')
      .select('id')
      .eq('workspace_id', request.workspaceId)
      .eq('proposal_draft_id', request.priorDraftId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!priorRun) throw new Error('completed_prior_proposal_audit_required');
    const { data: priorFindings } = await admin
      .from('proposal_audit_findings')
      .select(
        'finding_type,title,detail,checklist_item_id,source_document_id,source_page_id,source_page_number,source_quote',
      )
      .eq('workspace_id', request.workspaceId)
      .eq('proposal_audit_run_id', priorRun.id);
    const currentSignatures = new Set(
      result.findings.map((finding) => `${finding.type}:${finding.checklistItemId ?? ''}`),
    );
    for (const finding of priorFindings ?? []) {
      if (
        finding.finding_type === 'prompt_injection_attempt' ||
        currentSignatures.has(`${finding.finding_type}:${finding.checklist_item_id ?? ''}`)
      )
        continue;
      const detail = 'The prior deterministic finding is absent from this immutable revision.';
      correctionFindings.push({
        stableKey: sha(
          [
            'corrected_in_revision',
            request.priorDraftId,
            finding.finding_type,
            finding.checklist_item_id,
            detail,
          ].join(':'),
        ),
        type: 'corrected_in_revision',
        severity: 'informational',
        title: `Corrected in revision: ${finding.title}`,
        detail,
        checklistItemId: finding.checklist_item_id,
        claimStableKey: null,
        proposalPageId: null,
        proposalPageNumber: null,
        sourceDocumentId: finding.source_document_id,
        sourcePageId: finding.source_page_id,
        sourcePageNumber: finding.source_page_number,
        sourceQuote: finding.source_quote,
        ruleVersion: PROPOSAL_AUDIT_VERSIONS.evaluator,
      });
    }
  }
  const allFindings = [...result.findings, ...correctionFindings];

  const { data: existing } = await admin
    .from('proposal_audit_runs')
    .select('id,proposal_draft_id,finding_count')
    .eq('workspace_id', request.workspaceId)
    .eq('checklist_generation_run_id', request.checklistGenerationRunId)
    .eq('input_hash', effectiveInputHash)
    .eq('evaluator_version', PROPOSAL_AUDIT_VERSIONS.evaluator)
    .eq('status', 'completed')
    .maybeSingle();
  if (existing)
    return {
      auditRunId: existing.id,
      proposalDraftId: existing.proposal_draft_id,
      inputHash: effectiveInputHash,
      reused: true,
      findingCount: existing.finding_count,
    };

  let { data: draft } = await admin
    .from('proposal_drafts')
    .select('*')
    .eq('workspace_id', request.workspaceId)
    .eq('document_id', request.documentId)
    .maybeSingle();
  if (!draft) {
    let lineageId = randomUUID();
    let revisionNumber = 1;
    if (request.priorDraftId) {
      const { data: prior } = await admin
        .from('proposal_drafts')
        .select('id,lineage_id,revision_number')
        .eq('id', request.priorDraftId)
        .eq('workspace_id', request.workspaceId)
        .maybeSingle();
      if (!prior) throw new Error('prior_proposal_draft_not_found_in_workspace');
      lineageId = prior.lineage_id;
      revisionNumber = prior.revision_number + 1;
    }
    const draftId = randomUUID();
    const { data: inserted, error } = await admin
      .from('proposal_drafts')
      .insert({
        id: draftId,
        workspace_id: request.workspaceId,
        document_id: request.documentId,
        lineage_id: lineageId,
        revision_number: revisionNumber,
        prior_draft_id: request.priorDraftId ?? null,
        document_sha256: document.sha256,
        page_set_hash: pageSetHash,
        parser_name: document.parser_name ?? 'unknown',
        parser_version: document.parser_version ?? 'unknown',
        status: 'ready',
        created_by: request.actorId,
      })
      .select('*')
      .single();
    requireOk(error, 'proposal draft registration failed');
    draft = inserted;
    await admin.from('audit_events').insert({
      workspace_id: request.workspaceId,
      actor_type: 'system',
      actor_id: request.actorId,
      event_type: request.priorDraftId ? 'proposal_revision_linked' : 'proposal_draft_registered',
      entity_type: 'proposal_draft',
      entity_id: draftId,
      payload: { revision_number: revisionNumber, document_sha256: document.sha256 },
    });
  }

  const auditRunId = randomUUID();
  const { error: runError } = await admin.from('proposal_audit_runs').insert({
    id: auditRunId,
    workspace_id: request.workspaceId,
    proposal_draft_id: draft.id,
    checklist_generation_run_id: request.checklistGenerationRunId,
    input_hash: effectiveInputHash,
    fixture_version: request.fixtureVersion ?? null,
    section_parser_version: PROPOSAL_AUDIT_VERSIONS.sectionParser,
    claim_segmenter_version: PROPOSAL_AUDIT_VERSIONS.claimSegmenter,
    schema_version: PROPOSAL_AUDIT_VERSIONS.schema,
    matcher_version: PROPOSAL_AUDIT_VERSIONS.matcher,
    support_policy_version: PROPOSAL_AUDIT_VERSIONS.supportPolicy,
    contradiction_version: PROPOSAL_AUDIT_VERSIONS.contradiction,
    severity_version: PROPOSAL_AUDIT_VERSIONS.severity,
    evaluator_version: PROPOSAL_AUDIT_VERSIONS.evaluator,
    status: 'running',
    created_by: request.actorId,
  });
  requireOk(runError, 'proposal audit run creation failed');
  await admin.from('audit_events').insert({
    workspace_id: request.workspaceId,
    actor_type: 'system',
    actor_id: request.actorId,
    event_type: 'proposal_audit_started',
    entity_type: 'proposal_audit_run',
    entity_id: auditRunId,
    payload: {
      input_hash: effectiveInputHash,
      evaluator_version: PROPOSAL_AUDIT_VERSIONS.evaluator,
    },
  });

  try {
    const sectionIds = new Map<string, string>();
    for (const section of result.sections) {
      const id = randomUUID();
      sectionIds.set(section.stableKey, id);
      const { error } = await admin.from('proposal_sections').insert({
        id,
        workspace_id: request.workspaceId,
        proposal_audit_run_id: auditRunId,
        proposal_draft_id: draft.id,
        document_page_id: section.pageId,
        stable_key: section.stableKey,
        heading: section.heading,
        normalized_heading: section.normalizedHeading,
        page_number: section.pageNumber,
        start_offset: section.startOffset,
        end_offset: section.endOffset,
        section_text: section.text,
        parser_uncertain: section.parserUncertain,
        parser_version: PROPOSAL_AUDIT_VERSIONS.sectionParser,
      });
      requireOk(error, 'proposal section persistence failed');
    }
    const claimIds = new Map<string, string>();
    for (const claim of result.claims) {
      const id = randomUUID();
      claimIds.set(claim.stableKey, id);
      const { error } = await admin.from('proposal_claims').insert({
        id,
        workspace_id: request.workspaceId,
        proposal_audit_run_id: auditRunId,
        proposal_section_id: sectionIds.get(claim.sectionStableKey),
        stable_key: claim.stableKey,
        claim_type: claim.claimType,
        claim_text: claim.text,
        normalized_text: claim.normalizedText,
        page_number: claim.pageNumber,
        start_offset: claim.startOffset,
        end_offset: claim.endOffset,
        parser_uncertain: claim.parserUncertain,
        injection_signals: claim.injectionSignals,
        segmenter_version: PROPOSAL_AUDIT_VERSIONS.claimSegmenter,
      });
      requireOk(error, 'proposal claim persistence failed');
    }
    for (const assessment of result.claimAssessments) {
      const { data: persistedMatch, error } = await admin
        .from('proposal_claim_requirement_matches')
        .insert({
          workspace_id: request.workspaceId,
          proposal_audit_run_id: auditRunId,
          proposal_claim_id: claimIds.get(assessment.claimStableKey),
          checklist_item_id: assessment.matchedChecklistItemId,
          match_score: assessment.matchScore,
          match_reason: assessment.matchReason,
          support_status: assessment.supportStatus,
          consistency_status: assessment.consistencyStatus,
          rationale: assessment.rationale,
          proposal_facts: assessment.proposalFacts,
          requirement_facts: assessment.requirementFacts,
          machine_only: true,
          human_resolution_status: 'pending',
          matcher_version: PROPOSAL_AUDIT_VERSIONS.matcher,
        })
        .select('id')
        .single();
      requireOk(error, 'proposal claim assessment persistence failed');
      for (const evidenceId of assessment.evidenceIds) {
        const source = requirements.find((item) => item.evidenceId === evidenceId);
        const company = companyEvidence.find((item) => item.id === evidenceId);
        const { error: evidenceError } = await admin.from('proposal_claim_evidence').insert({
          workspace_id: request.workspaceId,
          proposal_claim_match_id: persistedMatch!.id,
          evidence_kind: source ? 'verification_evidence' : 'company_artifact',
          verification_evidence_id: source?.evidenceId ?? null,
          checklist_artifact_link_id: company?.id ?? null,
          document_id: source?.documentId ?? company?.documentId ?? null,
          document_page_id: source?.pageId ?? company?.pageId ?? null,
          page_number: source?.pageNumber ?? company?.pageNumber ?? null,
          exact_quote: source?.exactQuote ?? company?.exactQuote ?? null,
          match_type: 'exact',
          source_version: source
            ? 'verification-final-assessment-v1'
            : 'reviewed-checklist-artifact-v1',
        });
        requireOk(evidenceError, 'proposal claim evidence persistence failed');
      }
    }
    for (const coverage of result.coverage) {
      const { error } = await admin.from('proposal_response_coverage').insert({
        workspace_id: request.workspaceId,
        proposal_audit_run_id: auditRunId,
        checklist_item_id: coverage.checklistItemId,
        coverage_status: coverage.coverageStatus,
        reason: coverage.reason,
        matched_claim_keys: coverage.matchedClaimStableKeys,
        machine_only: true,
        human_resolution_status: 'pending',
        matcher_version: PROPOSAL_AUDIT_VERSIONS.matcher,
      });
      requireOk(error, 'proposal coverage persistence failed');
    }
    for (const finding of allFindings) {
      const id = randomUUID();
      const { error } = await admin.from('proposal_audit_findings').insert({
        id,
        workspace_id: request.workspaceId,
        proposal_audit_run_id: auditRunId,
        stable_key: finding.stableKey,
        finding_type: finding.type,
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        checklist_item_id: finding.checklistItemId,
        proposal_claim_id: finding.claimStableKey ? claimIds.get(finding.claimStableKey) : null,
        proposal_page_id: finding.proposalPageId,
        proposal_page_number: finding.proposalPageNumber,
        source_document_id: finding.sourceDocumentId,
        source_page_id: finding.sourcePageId,
        source_page_number: finding.sourcePageNumber,
        source_quote: finding.sourceQuote,
        machine_only: true,
        human_resolution_status: 'pending',
        workflow_status: 'open',
        rule_version: finding.ruleVersion,
      });
      requireOk(error, 'proposal finding persistence failed');
      await admin.from('audit_events').insert({
        workspace_id: request.workspaceId,
        actor_type: 'system',
        actor_id: request.actorId,
        event_type: 'proposal_finding_created',
        entity_type: 'proposal_audit_finding',
        entity_id: id,
        payload: {
          finding_type: finding.type,
          severity: finding.severity,
          rule_version: finding.ruleVersion,
        },
      });
      const claim = finding.claimStableKey
        ? result.claims.find((item) => item.stableKey === finding.claimStableKey)
        : null;
      if (claim)
        await admin.from('proposal_finding_evidence').insert({
          workspace_id: request.workspaceId,
          proposal_finding_id: id,
          evidence_role: 'proposal_claim',
          document_id: request.documentId,
          document_page_id: claim.pageId,
          page_number: claim.pageNumber,
          exact_quote: claim.text,
          match_type: 'exact',
        });
      if (
        finding.sourceDocumentId &&
        finding.sourcePageId &&
        finding.sourcePageNumber &&
        finding.sourceQuote
      )
        await admin.from('proposal_finding_evidence').insert({
          workspace_id: request.workspaceId,
          proposal_finding_id: id,
          evidence_role: 'requirement_source',
          document_id: finding.sourceDocumentId,
          document_page_id: finding.sourcePageId,
          page_number: finding.sourcePageNumber,
          exact_quote: finding.sourceQuote,
          match_type: 'exact',
        });
    }
    const { error: completeError } = await admin
      .from('proposal_audit_runs')
      .update({
        status: 'completed',
        section_count: result.sections.length,
        claim_count: result.claims.length,
        finding_count: allFindings.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', auditRunId)
      .eq('workspace_id', request.workspaceId);
    requireOk(completeError, 'proposal audit completion failed');
    await admin.from('audit_events').insert({
      workspace_id: request.workspaceId,
      actor_type: 'system',
      actor_id: request.actorId,
      event_type: 'proposal_audit_completed',
      entity_type: 'proposal_audit_run',
      entity_id: auditRunId,
      payload: {
        input_hash: effectiveInputHash,
        section_count: result.sections.length,
        claim_count: result.claims.length,
        finding_count: allFindings.length,
      },
    });
    return {
      auditRunId,
      proposalDraftId: draft.id,
      inputHash: effectiveInputHash,
      reused: false,
      findingCount: allFindings.length,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'proposal audit failed';
    await admin
      .from('proposal_audit_runs')
      .update({
        status: 'failed',
        error_detail: detail.slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', auditRunId);
    await admin.from('audit_events').insert({
      workspace_id: request.workspaceId,
      actor_type: 'system',
      actor_id: request.actorId,
      event_type: 'proposal_audit_failed',
      entity_type: 'proposal_audit_run',
      entity_id: auditRunId,
      payload: { error: 'normalized_persistence_failure' },
    });
    throw error;
  }
}
