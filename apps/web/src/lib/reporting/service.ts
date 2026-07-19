import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import {
  REPORT_DOWNLOAD_EXPIRY_SECONDS,
  REPORT_VERSIONS,
  aggregateReport,
  calculateReportInputHash,
  csvDatasetSchema,
  generateReportCsv,
  generateReportHtml,
  reportInputSchema,
  reportSnapshotSchema,
  reportTypeSchema,
  safeExportFilename,
  type CsvDataset,
  type ReportInput,
  type ReportSnapshot,
} from '@usi/domain';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const uuid = z.string().uuid();
const PHASE4_FINGERPRINT = 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b';
const EXPORT_BUCKET = 'workspace-exports';
const EXPORT_RETENTION_DAYS = 7;

export const reportGenerationRequestSchema = z
  .object({
    workspaceId: uuid,
    actorId: uuid,
    analysisRunId: uuid,
    verificationRunId: uuid,
    checklistGenerationRunId: uuid,
    readinessSnapshotId: uuid,
    proposalAuditRunId: uuid,
    reportType: reportTypeSchema,
  })
  .strict();

export const exportRequestSchema = z
  .object({
    workspaceId: uuid,
    actorId: uuid,
    reportSnapshotId: uuid,
    format: z.enum(['csv', 'html']),
    csvDataset: csvDatasetSchema.nullable(),
    regenerate: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.format === 'csv') !== Boolean(value.csvDataset))
      context.addIssue({ code: 'custom', message: 'CSV requires one dataset; HTML requires none' });
  });

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function requireOk(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}:${error.message}`);
}

async function requireMember(admin: Admin, workspaceId: string, actorId: string): Promise<void> {
  const { data, error } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', actorId)
    .maybeSingle();
  requireOk(error, 'report_member_lookup_failed');
  if (!data) throw new Error('report_actor_not_in_workspace');
}

async function audit(
  admin: Admin,
  workspaceId: string,
  actorId: string,
  eventType: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('audit_events').insert({
    workspace_id: workspaceId,
    actor_type: 'system',
    actor_id: actorId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    payload: details,
  });
  requireOk(error, 'report_audit_failed');
}

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const latestBy = <T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, T> => {
  const result = new Map<string, T>();
  for (const row of [...rows].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  ))
    if (!result.has(String(row[key]))) result.set(String(row[key]), row);
  return result;
};

async function loadReportInput(admin: Admin, raw: unknown): Promise<ReportInput> {
  const request = reportGenerationRequestSchema.parse(raw);
  await requireMember(admin, request.workspaceId, request.actorId);

  const [
    workspaceResult,
    analysisResult,
    verificationResult,
    checklistResult,
    readinessResult,
    auditResult,
  ] = await Promise.all([
    admin.from('workspaces').select('id,name').eq('id', request.workspaceId).maybeSingle(),
    admin
      .from('analysis_runs')
      .select(
        'id,workspace_id,status,verification_compatibility_fingerprint,completed_at,created_at',
      )
      .eq('id', request.analysisRunId)
      .eq('workspace_id', request.workspaceId)
      .maybeSingle(),
    admin
      .from('verification_runs')
      .select(
        'id,workspace_id,analysis_run_id,status,compatibility_fingerprint,completed_at,created_at',
      )
      .eq('id', request.verificationRunId)
      .eq('workspace_id', request.workspaceId)
      .maybeSingle(),
    admin
      .from('checklist_generation_runs')
      .select('*')
      .eq('id', request.checklistGenerationRunId)
      .eq('workspace_id', request.workspaceId)
      .maybeSingle(),
    admin
      .from('checklist_readiness_snapshots')
      .select('*')
      .eq('id', request.readinessSnapshotId)
      .eq('workspace_id', request.workspaceId)
      .maybeSingle(),
    admin
      .from('proposal_audit_runs')
      .select('*')
      .eq('id', request.proposalAuditRunId)
      .eq('workspace_id', request.workspaceId)
      .maybeSingle(),
  ]);
  for (const [name, result] of [
    ['workspace', workspaceResult],
    ['analysis', analysisResult],
    ['verification', verificationResult],
    ['checklist', checklistResult],
    ['readiness', readinessResult],
    ['proposal_audit', auditResult],
  ] as const)
    requireOk(result.error, `report_${name}_lookup_failed`);
  const workspace = workspaceResult.data;
  const analysis = analysisResult.data;
  const verification = verificationResult.data;
  const checklist = checklistResult.data;
  const readiness = readinessResult.data;
  const proposalAudit = auditResult.data;
  if (!workspace || !analysis || !verification || !checklist || !readiness || !proposalAudit)
    throw new Error('report_complete_source_selection_required');
  if (
    analysis.status !== 'completed' ||
    verification.status !== 'completed' ||
    checklist.status !== 'completed' ||
    proposalAudit.status !== 'completed'
  )
    throw new Error('report_completed_source_runs_required');
  if (
    verification.analysis_run_id !== analysis.id ||
    checklist.analysis_run_id !== analysis.id ||
    checklist.verification_run_id !== verification.id ||
    readiness.generation_run_id !== checklist.id ||
    proposalAudit.checklist_generation_run_id !== checklist.id
  )
    throw new Error('report_source_run_linkage_mismatch');
  const fingerprint =
    verification.compatibility_fingerprint ?? analysis.verification_compatibility_fingerprint;
  if (fingerprint !== PHASE4_FINGERPRINT) throw new Error('report_phase4_fingerprint_mismatch');

  const { data: draft, error: draftError } = await admin
    .from('proposal_drafts')
    .select('*')
    .eq('id', proposalAudit.proposal_draft_id)
    .eq('workspace_id', request.workspaceId)
    .maybeSingle();
  requireOk(draftError, 'report_proposal_draft_lookup_failed');
  if (!draft) throw new Error('report_proposal_draft_required');

  const { data: syntheticScope, error: scopeError } = await admin
    .from('phase4_synthetic_smoke_scopes')
    .select('id,synthetic_marker')
    .eq('workspace_id', request.workspaceId)
    .eq('analysis_run_id', request.analysisRunId)
    .eq('synthetic_marker', 'phase4-synthetic-test-only')
    .maybeSingle();
  requireOk(scopeError, 'report_demo_scope_lookup_failed');
  const demo = Boolean(syntheticScope);

  const { data: findingRows, error: findingsError } = await admin
    .from('verification_findings')
    .select('*')
    .eq('workspace_id', request.workspaceId)
    .eq('verification_run_id', request.verificationRunId);
  requireOk(findingsError, 'report_verification_findings_lookup_failed');
  const findings = findingRows ?? [];
  const findingIds = findings.map((row) => row.id);
  const candidateIds = findings.map((row) => row.candidate_id);
  const [
    { data: candidates, error: candidatesError },
    { data: verificationEvidence, error: evidenceError },
    { data: humanReviews, error: reviewsError },
  ] = await Promise.all([
    candidateIds.length
      ? admin
          .from('requirement_candidates')
          .select('id,title')
          .eq('workspace_id', request.workspaceId)
          .in('id', candidateIds)
      : Promise.resolve({ data: [], error: null }),
    findingIds.length
      ? admin
          .from('verification_evidence')
          .select('*')
          .eq('workspace_id', request.workspaceId)
          .eq('validated', true)
          .in('finding_id', findingIds)
      : Promise.resolve({ data: [], error: null }),
    findingIds.length
      ? admin
          .from('human_review_decisions')
          .select('*')
          .eq('workspace_id', request.workspaceId)
          .in('finding_id', findingIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  requireOk(candidatesError, 'report_candidates_lookup_failed');
  requireOk(evidenceError, 'report_verification_evidence_lookup_failed');
  requireOk(reviewsError, 'report_human_reviews_lookup_failed');
  const candidateById = new Map((candidates ?? []).map((row) => [row.id, row]));
  const evidenceByFinding = new Map<string, NonNullable<typeof verificationEvidence>[number]>();
  for (const row of verificationEvidence ?? [])
    if (
      row.evidence_role === 'supporting' &&
      ['exact', 'normalized_exact'].includes(row.match_type) &&
      !evidenceByFinding.has(row.finding_id)
    )
      evidenceByFinding.set(row.finding_id, row);
  const reviewByFinding = latestBy(humanReviews ?? [], 'finding_id');

  const { data: runItems, error: runItemsError } = await admin
    .from('checklist_generation_run_items')
    .select('checklist_item_id')
    .eq('workspace_id', request.workspaceId)
    .eq('generation_run_id', request.checklistGenerationRunId);
  requireOk(runItemsError, 'report_checklist_run_items_lookup_failed');
  const itemIds = (runItems ?? []).map((row) => row.checklist_item_id);
  if (!itemIds.length) throw new Error('report_checklist_items_required');
  const [
    itemsResult,
    sourcesResult,
    blockersResult,
    artifactsResult,
    artifactLinksResult,
    waiversResult,
    exceptionsResult,
  ] = await Promise.all([
    admin
      .from('checklist_items')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .in('id', itemIds),
    admin
      .from('checklist_item_sources')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .in('checklist_item_id', itemIds),
    admin
      .from('checklist_blockers')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .in('checklist_item_id', itemIds),
    admin
      .from('checklist_required_artifacts')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .in('checklist_item_id', itemIds),
    admin
      .from('checklist_artifact_links')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .eq('state', 'linked')
      .in('checklist_item_id', itemIds)
      .order('created_at', { ascending: false }),
    admin
      .from('checklist_waivers')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .in('checklist_item_id', itemIds),
    admin
      .from('checklist_exception_notes')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .in('checklist_item_id', itemIds),
  ]);
  for (const [name, result] of [
    ['items', itemsResult],
    ['sources', sourcesResult],
    ['blockers', blockersResult],
    ['artifacts', artifactsResult],
    ['artifact_links', artifactLinksResult],
    ['waivers', waiversResult],
    ['exceptions', exceptionsResult],
  ] as const)
    requireOk(result.error, `report_checklist_${name}_lookup_failed`);
  const items = itemsResult.data ?? [];
  const sourceByItem = new Map(
    (sourcesResult.data ?? []).map((row) => [row.checklist_item_id, row]),
  );
  const linkByRequiredArtifact = latestBy(artifactLinksResult.data ?? [], 'required_artifact_id');

  const [
    claimsResult,
    matchesResult,
    claimEvidenceResult,
    proposalFindingsResult,
    findingEvidenceResult,
    findingResolutionsResult,
  ] = await Promise.all([
    admin
      .from('proposal_claims')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .eq('proposal_audit_run_id', request.proposalAuditRunId),
    admin
      .from('proposal_claim_requirement_matches')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .eq('proposal_audit_run_id', request.proposalAuditRunId),
    admin
      .from('proposal_claim_evidence')
      .select('id,proposal_claim_match_id')
      .eq('workspace_id', request.workspaceId),
    admin
      .from('proposal_audit_findings')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .eq('proposal_audit_run_id', request.proposalAuditRunId),
    admin.from('proposal_finding_evidence').select('*').eq('workspace_id', request.workspaceId),
    admin
      .from('proposal_finding_resolutions')
      .select('*')
      .eq('workspace_id', request.workspaceId)
      .order('created_at', { ascending: false }),
  ]);
  for (const [name, result] of [
    ['claims', claimsResult],
    ['matches', matchesResult],
    ['claim_evidence', claimEvidenceResult],
    ['findings', proposalFindingsResult],
    ['finding_evidence', findingEvidenceResult],
    ['finding_resolutions', findingResolutionsResult],
  ] as const)
    requireOk(result.error, `report_proposal_${name}_lookup_failed`);
  const matches = matchesResult.data ?? [];
  const matchByClaim = new Map(matches.map((row) => [row.proposal_claim_id, row]));
  const evidenceCountByMatch = new Map<string, number>();
  for (const row of claimEvidenceResult.data ?? [])
    evidenceCountByMatch.set(
      row.proposal_claim_match_id,
      (evidenceCountByMatch.get(row.proposal_claim_match_id) ?? 0) + 1,
    );
  const resolutionByFinding = latestBy(findingResolutionsResult.data ?? [], 'proposal_finding_id');
  const proposalEvidenceByFinding = new Map<
    string,
    Array<NonNullable<typeof findingEvidenceResult.data>[number]>
  >();
  for (const row of findingEvidenceResult.data ?? []) {
    const rows = proposalEvidenceByFinding.get(row.proposal_finding_id) ?? [];
    rows.push(row);
    proposalEvidenceByFinding.set(row.proposal_finding_id, rows);
  }

  const requirements = findings.map((finding) => {
    const evidence = evidenceByFinding.get(finding.id);
    return {
      findingId: finding.id,
      candidateId: finding.candidate_id,
      title:
        candidateById.get(finding.candidate_id)?.title ?? `Requirement ${finding.candidate_id}`,
      sourceSupportStatus: finding.source_support_status,
      precedenceStatus: finding.precedence_status,
      proofRequirement: finding.proof_requirement,
      humanReviewStatus: reviewByFinding.get(finding.id)?.decision ?? 'pending',
      documentId: evidence?.document_id ?? null,
      pageNumber: evidence?.page_number ?? null,
      exactQuote: textOrNull(evidence?.quote_exact),
      evidenceMatchType: evidence?.match_type ?? null,
      parserUncertain:
        finding.source_support_status === 'parser_uncertain' ||
        (Array.isArray(finding.parser_concerns) && finding.parser_concerns.length > 0),
      relationshipRole:
        items.find((item) => item.finding_id === finding.id)?.relationship_role ?? 'atomic',
    };
  });

  const checklistItems = items.map((item) => {
    const source = sourceByItem.get(item.id);
    return {
      id: item.id,
      candidateId: item.candidate_id,
      findingId: item.finding_id,
      title: item.title,
      category: item.category,
      mandatory: item.mandatory,
      requiredDenominator: item.contributes_to_required_total,
      eligibilityClass: item.eligibility_class,
      lifecycleStatus: item.lifecycle_status,
      workflowStatus: item.workflow_status,
      artifactState: item.artifact_state,
      owner: textOrNull(item.owner_id),
      reviewer: textOrNull(item.reviewer_id),
      dueAt: item.due_at,
      dueTimezone: textOrNull(item.due_timezone),
      sourceDocumentId: source?.document_id ?? null,
      sourcePageNumber: source?.page_number ?? null,
      sourceQuote: textOrNull(source?.quote_exact),
      sourceEvidenceValidated: Boolean(
        source && ['exact', 'normalized_exact'].includes(source.match_type),
      ),
      sourceSupportStatus: item.source_support_status,
      precedenceStatus: item.precedence_status,
      proofRequirement: item.proof_requirement,
      humanReviewStatus: item.source_human_review_status,
      relationshipRole: item.relationship_role,
    };
  });
  const proposalFindings = (proposalFindingsResult.data ?? []).map((finding) => {
    const claimMatch = finding.proposal_claim_id
      ? matchByClaim.get(finding.proposal_claim_id)
      : null;
    const resolution = resolutionByFinding.get(finding.id);
    const evidences = proposalEvidenceByFinding.get(finding.id) ?? [];
    const proposalEvidence = evidences.find((row) => row.evidence_role === 'proposal_claim');
    const sourceEvidence = evidences.find((row) =>
      ['requirement_source', 'contradicting_source'].includes(row.evidence_role),
    );
    return {
      id: finding.id,
      checklistItemId: finding.checklist_item_id,
      claimId: finding.proposal_claim_id,
      type: finding.finding_type,
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      workflowStatus: resolution?.workflow_status ?? finding.workflow_status,
      humanResolutionStatus: resolution?.human_resolution_status ?? finding.human_resolution_status,
      supportStatus: claimMatch?.support_status ?? null,
      consistencyStatus: claimMatch?.consistency_status ?? null,
      proofRequirement:
        finding.finding_type === 'human_proof_required'
          ? 'requires_human_confirmation'
          : ((finding.checklist_item_id
              ? items.find((item) => item.id === finding.checklist_item_id)?.proof_requirement
              : null) ?? 'none_identified'),
      proposalDocumentId: draft.document_id,
      proposalPageNumber: finding.proposal_page_number,
      proposalQuote:
        textOrNull(proposalEvidence?.exact_quote) ??
        textOrNull(
          (claimsResult.data ?? []).find((claim) => claim.id === finding.proposal_claim_id)
            ?.claim_text,
        ),
      sourceDocumentId: finding.source_document_id ?? sourceEvidence?.document_id ?? null,
      sourcePageNumber: finding.source_page_number ?? sourceEvidence?.page_number ?? null,
      sourceQuote: textOrNull(finding.source_quote) ?? textOrNull(sourceEvidence?.exact_quote),
      machineOnly: true as const,
      resolvedByRevision:
        finding.finding_type === 'corrected_in_revision' || finding.workflow_status === 'obsolete',
      resolvedByEvidence: Boolean(
        resolution && resolution.reason.toLowerCase().includes('evidence'),
      ),
    };
  });

  const sourceSnapshotAt = [
    analysis.completed_at,
    verification.completed_at,
    checklist.completed_at,
    readiness.created_at,
    proposalAudit.completed_at,
    draft.created_at,
    ...findings.map((row) => row.created_at),
    ...(humanReviews ?? []).map((row) => row.created_at),
    ...items.map((row) => row.updated_at ?? row.created_at),
    ...(blockersResult.data ?? []).map((row) => row.updated_at ?? row.created_at),
    ...(artifactsResult.data ?? []).map((row) => row.updated_at ?? row.created_at),
    ...(waiversResult.data ?? []).map((row) => row.created_at),
    ...(exceptionsResult.data ?? []).map((row) => row.created_at),
    ...(claimsResult.data ?? []).map((row) => row.created_at),
    ...(proposalFindingsResult.data ?? []).map((row) => row.updated_at ?? row.created_at),
    ...(findingResolutionsResult.data ?? []).map((row) => row.created_at),
  ]
    .filter(Boolean)
    .map(String)
    .sort()
    .at(-1)!;
  const sourceSnapshotIso = new Date(sourceSnapshotAt).toISOString();

  return reportInputSchema.parse({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      procurementTitle: workspace.name,
      solicitationNumber: null,
      demo,
      dataClassification: demo ? 'synthetic_demo' : 'internal_authorized',
    },
    reportType: request.reportType,
    sourceSnapshotAt: sourceSnapshotIso,
    runs: {
      analysisRunId: analysis.id,
      verificationRunId: verification.id,
      checklistGenerationRunId: checklist.id,
      readinessSnapshotId: readiness.id,
      proposalAuditRunId: proposalAudit.id,
      proposalDraftId: draft.id,
      proposalRevision: draft.revision_number,
    },
    versions: {
      phase4Fingerprint: fingerprint,
      checklistGenerator: checklist.generator_version,
      blockerEngine: checklist.blocker_version,
      readinessEngine: checklist.readiness_version,
      proposalParser: proposalAudit.section_parser_version,
      proposalSegmenter: proposalAudit.claim_segmenter_version,
      proposalMatcher: proposalAudit.matcher_version,
      proposalContradiction: proposalAudit.contradiction_version,
      proposalSeverity: proposalAudit.severity_version,
      proposalEvaluator: proposalAudit.evaluator_version,
    },
    providerUseStatement: 'No Phase 7 provider calls; deterministic persisted data only.',
    requirements,
    checklistItems,
    blockers: (blockersResult.data ?? []).map((row) => ({
      id: row.id,
      checklistItemId: row.checklist_item_id,
      type: row.blocker_type,
      severity: row.severity,
      title: row.blocker_type.replaceAll('_', ' '),
      explanation: row.reason,
      status: row.status,
      resolutionState:
        row.status === 'resolved'
          ? 'resolved'
          : row.status === 'reopened'
            ? 'reopened'
            : 'unresolved',
    })),
    artifacts: (artifactsResult.data ?? []).map((row) => ({
      id: row.id,
      checklistItemId: row.checklist_item_id,
      artifactType: row.artifact_kind,
      state: row.state,
      documentId: linkByRequiredArtifact.get(row.id)?.document_id ?? null,
      reviewed: row.state === 'reviewed',
    })),
    waivers: (waiversResult.data ?? []).map((row) => ({
      id: row.id,
      checklistItemId: row.checklist_item_id,
      status: row.status === 'requested' ? 'pending' : row.status,
      designation: row.designation,
      validForReadiness: row.status === 'accepted' && row.designation === 'final',
    })),
    exceptions: (exceptionsResult.data ?? []).map((row) => ({
      id: row.id,
      checklistItemId: row.checklist_item_id,
      text: row.explanation,
      status: 'open',
    })),
    proposalClaims: (claimsResult.data ?? []).map((claim) => {
      const match = matchByClaim.get(claim.id);
      return {
        id: claim.id,
        text: claim.claim_text,
        pageNumber: claim.page_number,
        claimType: claim.claim_type,
        supportStatus:
          match?.support_status ?? (claim.parser_uncertain ? 'parser_uncertain' : 'unsupported'),
        consistencyStatus: match?.consistency_status ?? 'not_applicable',
        parserUncertain: claim.parser_uncertain,
        evidenceCount: match ? (evidenceCountByMatch.get(match.id) ?? 0) : 0,
      };
    }),
    proposalFindings,
    readiness: {
      id: readiness.id,
      state: readiness.status,
      summary: readiness.summary,
      totalRequired: readiness.total_required,
      completedRequired: readiness.completed_required,
      incompleteRequired: readiness.incomplete_required,
      blockedItems: readiness.blocked_items,
      unresolvedItems: readiness.unresolved_items,
      humanProofItems: readiness.items_requiring_human_proof,
      informationalItems: readiness.informational_items,
      criticalBlockers: readiness.active_critical_blockers,
      warnings: readiness.warnings,
      excludedItems: readiness.excluded_items,
      createdAt: new Date(readiness.created_at).toISOString(),
    },
  });
}

export async function generateReport(
  raw: unknown,
): Promise<{ runId: string; snapshotId: string; inputHash: string; reused: boolean }> {
  const request = reportGenerationRequestSchema.parse(raw);
  const admin = createSupabaseAdminClient();
  const input = await loadReportInput(admin, request);
  const inputHash = calculateReportInputHash(input);
  const { data: existing, error: existingError } = await admin
    .from('report_generation_runs')
    .select('id,report_snapshots!inner(id)')
    .eq('workspace_id', request.workspaceId)
    .eq('input_hash', inputHash)
    .eq('report_type', request.reportType)
    .eq('report_version', REPORT_VERSIONS.executive)
    .eq('status', 'completed')
    .maybeSingle();
  requireOk(existingError, 'report_idempotency_lookup_failed');
  if (existing) {
    const related = existing.report_snapshots as unknown as { id: string } | Array<{ id: string }>;
    const snapshotId = Array.isArray(related) ? related[0]?.id : related?.id;
    if (!snapshotId) throw new Error('completed_report_snapshot_link_missing');
    return { runId: existing.id, snapshotId, inputHash, reused: true };
  }

  const runId = randomUUID();
  const { error: runError } = await admin.from('report_generation_runs').insert({
    id: runId,
    workspace_id: request.workspaceId,
    analysis_run_id: request.analysisRunId,
    verification_run_id: request.verificationRunId,
    checklist_generation_run_id: request.checklistGenerationRunId,
    readiness_snapshot_id: request.readinessSnapshotId,
    proposal_audit_run_id: request.proposalAuditRunId,
    proposal_draft_id: input.runs.proposalDraftId,
    report_type: request.reportType,
    report_version: REPORT_VERSIONS.executive,
    input_version: REPORT_VERSIONS.input,
    aggregation_version: REPORT_VERSIONS.aggregation,
    schema_version: REPORT_VERSIONS.schema,
    input_hash: inputHash,
    source_snapshot_at: input.sourceSnapshotAt,
    status: 'generating',
    demo: input.workspace.demo,
    data_classification: input.workspace.dataClassification,
    created_by: request.actorId,
  });
  requireOk(runError, 'report_run_insert_failed');
  try {
    await audit(
      admin,
      request.workspaceId,
      request.actorId,
      'report_generation_requested',
      'report_generation_run',
      runId,
      { reportType: request.reportType, inputHash, versions: REPORT_VERSIONS },
    );
    const snapshot = aggregateReport(input);
    const snapshotId = randomUUID();
    const { error: snapshotError } = await admin.from('report_snapshots').insert({
      id: snapshotId,
      workspace_id: request.workspaceId,
      report_generation_run_id: runId,
      report_type: request.reportType,
      report_version: REPORT_VERSIONS.executive,
      schema_version: REPORT_VERSIONS.schema,
      input_hash: inputHash,
      demo: input.workspace.demo,
      data_classification: input.workspace.dataClassification,
      summary: snapshot.summary,
      snapshot,
      generated_by: request.actorId,
    });
    requireOk(snapshotError, 'report_snapshot_insert_failed');
    const { error: completeError } = await admin
      .from('report_generation_runs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('status', 'generating');
    requireOk(completeError, 'report_run_complete_failed');
    await audit(
      admin,
      request.workspaceId,
      request.actorId,
      'report_generation_completed',
      'report_generation_run',
      runId,
      { reportSnapshotId: snapshotId, reportType: request.reportType, inputHash },
    );
    return { runId, snapshotId, inputHash, reused: false };
  } catch (error) {
    await admin
      .from('report_generation_runs')
      .update({
        status: 'failed',
        error_detail: error instanceof Error ? error.message.slice(0, 2000) : 'unknown',
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .eq('status', 'generating');
    await audit(
      admin,
      request.workspaceId,
      request.actorId,
      'report_generation_failed',
      'report_generation_run',
      runId,
      { errorCategory: 'deterministic_generation_failed' },
    );
    throw error;
  }
}

export async function createReportExport(
  raw: unknown,
): Promise<{ artifactId: string; filename: string; reused: boolean }> {
  const request = exportRequestSchema.parse(raw);
  const admin = createSupabaseAdminClient();
  await requireMember(admin, request.workspaceId, request.actorId);
  const { data: snapshotRow, error: snapshotError } = await admin
    .from('report_snapshots')
    .select('*')
    .eq('id', request.reportSnapshotId)
    .eq('workspace_id', request.workspaceId)
    .maybeSingle();
  requireOk(snapshotError, 'export_snapshot_lookup_failed');
  if (!snapshotRow) throw new Error('export_snapshot_not_found');
  const snapshot = reportSnapshotSchema.parse(snapshotRow.snapshot);
  let priorQuery = admin
    .from('export_manifests')
    .select(
      'id,regeneration_number,export_artifacts!inner(id,normalized_filename,status,object_path)',
    )
    .eq('workspace_id', request.workspaceId)
    .eq('report_snapshot_id', request.reportSnapshotId)
    .eq('export_format', request.format);
  priorQuery = request.csvDataset
    ? priorQuery.eq('csv_dataset', request.csvDataset)
    : priorQuery.is('csv_dataset', null);
  const { data: prior, error: priorError } = await priorQuery
    .eq('status', 'completed')
    .order('regeneration_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  requireOk(priorError, 'export_idempotency_lookup_failed');
  const relatedPriorArtifact = prior?.export_artifacts as unknown as
    | { id: string; normalized_filename: string; status: string; object_path: string }
    | Array<{ id: string; normalized_filename: string; status: string; object_path: string }>
    | undefined;
  const priorArtifact = Array.isArray(relatedPriorArtifact)
    ? relatedPriorArtifact[0]
    : relatedPriorArtifact;
  if (prior && priorArtifact?.status === 'active' && !request.regenerate)
    return {
      artifactId: priorArtifact.id,
      filename: priorArtifact.normalized_filename,
      reused: true,
    };

  const content =
    request.format === 'csv'
      ? generateReportCsv(snapshot, request.csvDataset as CsvDataset)
      : generateReportHtml(snapshot);
  const contentType = request.format === 'csv' ? 'text/csv' : 'text/html';
  const filename = safeExportFilename({
    workspaceName: request.csvDataset
      ? `${snapshot.workspace.procurementTitle}-${request.csvDataset}`
      : snapshot.workspace.procurementTitle,
    reportType: snapshot.reportType,
    format: request.format,
    demo: snapshot.workspace.demo,
  });
  const manifestId = randomUUID();
  const artifactId = randomUUID();
  const objectPath = `${request.workspaceId}/${request.reportSnapshotId}/${artifactId}/${filename}`;
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.byteLength > 10_485_760) throw new Error('export_exceeds_private_bucket_limit');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const regenerationNumber = (prior?.regeneration_number ?? 0) + 1;
  const { error: uploadError } = await admin.storage
    .from(EXPORT_BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: false });
  requireOk(uploadError, 'private_export_upload_failed');
  try {
    const { error: manifestError } = await admin.from('export_manifests').insert({
      id: manifestId,
      workspace_id: request.workspaceId,
      report_snapshot_id: request.reportSnapshotId,
      export_format: request.format,
      csv_dataset: request.csvDataset,
      manifest_version: REPORT_VERSIONS.manifest,
      export_schema_version: request.format === 'csv' ? REPORT_VERSIONS.csv : REPORT_VERSIONS.html,
      input_hash: snapshot.inputHash,
      regeneration_number: regenerationNumber,
      status: 'completed',
      created_by: request.actorId,
    });
    requireOk(manifestError, 'export_manifest_insert_failed');
    const retentionUntil = new Date(Date.now() + EXPORT_RETENTION_DAYS * 86_400_000).toISOString();
    const { error: artifactError } = await admin.from('export_artifacts').insert({
      id: artifactId,
      workspace_id: request.workspaceId,
      export_manifest_id: manifestId,
      bucket_id: EXPORT_BUCKET,
      object_path: objectPath,
      normalized_filename: filename,
      content_type: contentType,
      content_length: bytes.byteLength,
      sha256,
      demo: snapshot.workspace.demo,
      status: 'active',
      retention_until: retentionUntil,
      created_by: request.actorId,
    });
    requireOk(artifactError, 'export_artifact_insert_failed');
    const eventType =
      request.format === 'csv' ? 'report_export_csv_created' : 'report_export_html_created';
    await audit(
      admin,
      request.workspaceId,
      request.actorId,
      eventType,
      'export_artifact',
      artifactId,
      {
        reportSnapshotId: request.reportSnapshotId,
        manifestId,
        format: request.format,
        csvDataset: request.csvDataset,
        sha256,
        contentLength: bytes.byteLength,
        regenerationNumber,
      },
    );
    if (prior && priorArtifact && request.regenerate) {
      const supersedeReason = `Superseded by export artifact ${artifactId}.`;
      const { error: removePriorError } = await admin.storage
        .from(EXPORT_BUCKET)
        .remove([priorArtifact.object_path]);
      requireOk(removePriorError, 'prior_export_removal_failed');
      const { error: revokePriorError } = await admin
        .from('export_artifacts')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revocation_reason: supersedeReason,
        })
        .eq('id', priorArtifact.id)
        .eq('status', 'active');
      requireOk(revokePriorError, 'prior_export_revocation_failed');
      const { error: obsoletePriorError } = await admin
        .from('export_manifests')
        .update({ status: 'obsolete' })
        .eq('id', prior.id)
        .eq('status', 'completed');
      requireOk(obsoletePriorError, 'prior_export_manifest_obsolete_failed');
      await audit(
        admin,
        request.workspaceId,
        request.actorId,
        'report_export_regenerated',
        'export_artifact',
        artifactId,
        { priorManifestId: prior.id, regenerationNumber },
      );
      await audit(
        admin,
        request.workspaceId,
        request.actorId,
        'report_export_obsoleted',
        'export_artifact',
        priorArtifact.id,
        { replacementArtifactId: artifactId, replacementManifestId: manifestId },
      );
    }
    return { artifactId, filename, reused: false };
  } catch (error) {
    await admin.storage.from(EXPORT_BUCKET).remove([objectPath]);
    throw error;
  }
}

export async function createReportDownloadGrant(
  raw: unknown,
): Promise<{ signedUrl: string; expiresAt: string; grantId: string }> {
  const request = z
    .object({ workspaceId: uuid, actorId: uuid, artifactId: uuid })
    .strict()
    .parse(raw);
  const admin = createSupabaseAdminClient();
  await requireMember(admin, request.workspaceId, request.actorId);
  const { data: artifact, error: artifactError } = await admin
    .from('export_artifacts')
    .select('id,object_path,status,retention_until')
    .eq('id', request.artifactId)
    .eq('workspace_id', request.workspaceId)
    .maybeSingle();
  requireOk(artifactError, 'download_artifact_lookup_failed');
  if (
    !artifact ||
    artifact.status !== 'active' ||
    new Date(artifact.retention_until).getTime() <= Date.now()
  ) {
    if (artifact)
      await audit(
        admin,
        request.workspaceId,
        request.actorId,
        'report_export_permission_denied',
        'export_artifact',
        request.artifactId,
        { reason: 'inactive_or_expired' },
      );
    throw new Error('download_artifact_unavailable');
  }
  const { data: signed, error: signError } = await admin.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(artifact.object_path, REPORT_DOWNLOAD_EXPIRY_SECONDS);
  requireOk(signError, 'private_export_sign_failed');
  if (!signed?.signedUrl) throw new Error('private_export_signed_url_missing');
  const grantId = randomUUID();
  const expiresAt = new Date(Date.now() + REPORT_DOWNLOAD_EXPIRY_SECONDS * 1000).toISOString();
  const { error: grantError } = await admin.from('export_download_grants').insert({
    id: grantId,
    workspace_id: request.workspaceId,
    export_artifact_id: artifact.id,
    actor_id: request.actorId,
    expires_at: expiresAt,
    policy_version: REPORT_VERSIONS.downloadPolicy,
  });
  requireOk(grantError, 'download_grant_insert_failed');
  const { error: eventError } = await admin.from('export_access_events').insert({
    workspace_id: request.workspaceId,
    export_artifact_id: artifact.id,
    download_grant_id: grantId,
    actor_id: request.actorId,
    event_type: 'signed_url_created',
    detail: { expiresAt, policyVersion: REPORT_VERSIONS.downloadPolicy },
  });
  requireOk(eventError, 'download_access_event_insert_failed');
  const { error: requestEventError } = await admin.from('export_access_events').insert({
    workspace_id: request.workspaceId,
    export_artifact_id: artifact.id,
    download_grant_id: grantId,
    actor_id: request.actorId,
    event_type: 'download_recorded',
    detail: { stage: 'download_requested' },
  });
  requireOk(requestEventError, 'download_request_event_insert_failed');
  await audit(
    admin,
    request.workspaceId,
    request.actorId,
    'report_download_url_created',
    'export_artifact',
    artifact.id,
    { grantId, expiresAt, policyVersion: REPORT_VERSIONS.downloadPolicy },
  );
  await audit(
    admin,
    request.workspaceId,
    request.actorId,
    'report_export_accessed',
    'export_artifact',
    artifact.id,
    { grantId, stage: 'download_requested' },
  );
  return { signedUrl: signed.signedUrl, expiresAt, grantId };
}

export async function revokeReportExport(raw: unknown): Promise<void> {
  const request = z
    .object({
      workspaceId: uuid,
      actorId: uuid,
      artifactId: uuid,
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(raw);
  const admin = createSupabaseAdminClient();
  await requireMember(admin, request.workspaceId, request.actorId);
  const { data: artifact, error } = await admin
    .from('export_artifacts')
    .select('id,object_path,status')
    .eq('id', request.artifactId)
    .eq('workspace_id', request.workspaceId)
    .maybeSingle();
  requireOk(error, 'revoke_artifact_lookup_failed');
  if (!artifact || artifact.status !== 'active') throw new Error('active_export_artifact_required');
  const { error: removeError } = await admin.storage
    .from(EXPORT_BUCKET)
    .remove([artifact.object_path]);
  requireOk(removeError, 'private_export_removal_failed');
  const { error: updateError } = await admin
    .from('export_artifacts')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revocation_reason: request.reason,
    })
    .eq('id', artifact.id)
    .eq('workspace_id', request.workspaceId)
    .eq('status', 'active');
  requireOk(updateError, 'export_revocation_failed');
  await admin.from('export_access_events').insert({
    workspace_id: request.workspaceId,
    export_artifact_id: artifact.id,
    actor_id: request.actorId,
    event_type: 'revoked',
    detail: { reason: request.reason },
  });
  await audit(
    admin,
    request.workspaceId,
    request.actorId,
    'report_export_revoked',
    'export_artifact',
    artifact.id,
    { reason: request.reason },
  );
}

/** Server-maintenance path only. Expired private objects are removed while
 * their immutable manifests and access history remain available for audit. */
export async function purgeExpiredReportExportsForMaintenance(now = new Date()): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data: expired, error } = await admin
    .from('export_artifacts')
    .select('id,workspace_id,object_path,created_by')
    .eq('status', 'active')
    .lte('retention_until', now.toISOString())
    .limit(500);
  requireOk(error, 'expired_export_lookup_failed');
  let purged = 0;
  for (const artifact of expired ?? []) {
    const { error: removeError } = await admin.storage
      .from(EXPORT_BUCKET)
      .remove([artifact.object_path]);
    requireOk(removeError, 'expired_export_removal_failed');
    const reason = 'Expired under the versioned Phase 7 retention policy.';
    const { error: updateError } = await admin
      .from('export_artifacts')
      .update({ status: 'revoked', revoked_at: now.toISOString(), revocation_reason: reason })
      .eq('id', artifact.id)
      .eq('workspace_id', artifact.workspace_id)
      .eq('status', 'active');
    requireOk(updateError, 'expired_export_revocation_failed');
    const { error: eventError } = await admin.from('export_access_events').insert({
      workspace_id: artifact.workspace_id,
      export_artifact_id: artifact.id,
      actor_id: null,
      event_type: 'revoked',
      detail: { reason: 'retention_expired', policyVersion: REPORT_VERSIONS.downloadPolicy },
    });
    requireOk(eventError, 'expired_export_event_failed');
    await audit(
      admin,
      artifact.workspace_id,
      artifact.created_by,
      'report_export_revoked',
      'export_artifact',
      artifact.id,
      { reason: 'retention_expired', policyVersion: REPORT_VERSIONS.downloadPolicy },
    );
    purged += 1;
  }
  return purged;
}

export function aggregateReportForTest(input: ReportInput): ReportSnapshot {
  return aggregateReport(input);
}
