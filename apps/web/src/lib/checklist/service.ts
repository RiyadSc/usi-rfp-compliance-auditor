import 'server-only';
import { createHash } from 'node:crypto';
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
  type ArtifactState,
  type BlockerInputItem,
  type ChecklistSource,
  type GeneratedChecklistItem,
} from '@usi/domain';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type GenerationRequest = {
  workspaceId: string;
  verificationRunId: string;
  actorId: string;
  fixtureVersion?: string | null;
};

type CandidateRow = {
  id: string;
  analysis_run_id: string;
  document_id: string;
  category: string;
  title: string;
  obligation: string;
  mandatory_class: string;
};

type FindingRow = {
  id: string;
  workspace_id: string;
  analysis_run_id: string;
  verification_run_id: string;
  candidate_id: string;
  finding_version: number;
  source_support_status: ChecklistSource['sourceSupportStatus'];
  precedence_status: ChecklistSource['precedenceStatus'];
  proof_requirement: ChecklistSource['proofRequirement'];
  machine_status: 'machine_assessment_only';
  deterministic_facts: unknown;
  schema_version: string;
};

type EvidenceRow = {
  id: string;
  finding_id: string;
  document_id: string;
  document_page_id: string;
  page_number: number;
  quote_exact: string;
  match_type: 'exact' | 'normalized_exact';
  validated: boolean;
};

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function extractDue(facts: unknown): { dueAt: string | null; dueTimezone: string | null } {
  if (!Array.isArray(facts)) return { dueAt: null, dueTimezone: null };
  const deadline = facts.find((fact) => {
    if (!fact || typeof fact !== 'object') return false;
    const row = fact as Record<string, unknown>;
    return (
      typeof row.semanticRole === 'string' &&
      ['submission_deadline', 'question_deadline', 'meeting_date'].includes(row.semanticRole) &&
      typeof row.normalizedValue === 'string'
    );
  }) as Record<string, unknown> | undefined;
  if (!deadline) return { dueAt: null, dueTimezone: null };
  const normalized = String(deadline.normalizedValue);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return { dueAt: null, dueTimezone: null };
  return {
    dueAt: date.toISOString(),
    dueTimezone:
      typeof deadline.timezone === 'string' && deadline.timezone.length > 0
        ? deadline.timezone
        : null,
  };
}

function artifactKind(item: GeneratedChecklistItem) {
  const direct: Record<string, string> = {
    mandatory_form: 'form',
    signature: 'signature',
    initials: 'initials',
    acknowledgment: 'acknowledgment',
    addendum_acknowledgment: 'acknowledgment',
    bond: 'bond',
    insurance: 'insurance',
    certification: 'certificate',
    license: 'license',
    resume: 'resume',
    staffing_plan: 'staffing_plan',
    attachment: 'attachment',
  };
  return direct[item.category] ?? 'other';
}

export async function generateChecklist(request: GenerationRequest) {
  const admin = createSupabaseAdminClient();
  const { data: verificationRun, error: runError } = await admin
    .from('verification_runs')
    .select('id, workspace_id, analysis_run_id, status')
    .eq('id', request.verificationRunId)
    .eq('workspace_id', request.workspaceId)
    .maybeSingle();
  if (runError || !verificationRun || verificationRun.status !== 'completed')
    throw new Error('completed_verification_run_required');

  const { data: rawFindings, error: findingsError } = await admin
    .from('verification_findings')
    .select(
      'id, workspace_id, analysis_run_id, verification_run_id, candidate_id, finding_version, source_support_status, precedence_status, proof_requirement, machine_status, deterministic_facts, schema_version',
    )
    .eq('workspace_id', request.workspaceId)
    .eq('verification_run_id', request.verificationRunId)
    .order('candidate_id');
  if (findingsError) throw new Error(`finding_load_failed:${findingsError.message}`);
  const findings = (rawFindings ?? []) as FindingRow[];
  if (findings.length === 0) throw new Error('verification_findings_required');

  const candidateIds = findings.map((finding) => finding.candidate_id);
  const findingIds = findings.map((finding) => finding.id);
  const [
    { data: rawCandidates, error: candidatesError },
    { data: rawEvidence, error: evidenceError },
    { data: rawDecisions, error: decisionsError },
    { data: rawRelationships, error: relationshipsError },
  ] = await Promise.all([
    admin
      .from('requirement_candidates')
      .select('id, analysis_run_id, document_id, category, title, obligation, mandatory_class')
      .eq('workspace_id', request.workspaceId)
      .in('id', candidateIds),
    admin
      .from('verification_evidence')
      .select(
        'id, finding_id, document_id, document_page_id, page_number, quote_exact, match_type, validated',
      )
      .eq('workspace_id', request.workspaceId)
      .in('finding_id', findingIds)
      .eq('validated', true)
      .in('match_type', ['exact', 'normalized_exact'])
      .order('created_at'),
    admin
      .from('human_review_decisions')
      .select('finding_id, decision, created_at')
      .eq('workspace_id', request.workspaceId)
      .in('finding_id', findingIds)
      .is('relationship_id', null)
      .order('created_at', { ascending: false }),
    admin
      .from('requirement_relationships')
      .select('id, source_candidate_id, target_candidate_id, relationship_type, human_status')
      .eq('workspace_id', request.workspaceId)
      .eq('verification_run_id', request.verificationRunId),
  ]);
  if (candidatesError || evidenceError || decisionsError || relationshipsError)
    throw new Error(
      `checklist_source_load_failed:${candidatesError?.message ?? evidenceError?.message ?? decisionsError?.message ?? relationshipsError?.message}`,
    );
  const candidates = new Map(
    ((rawCandidates ?? []) as CandidateRow[]).map((candidate) => [candidate.id, candidate]),
  );
  if (candidates.size !== candidateIds.length)
    throw new Error('cross_workspace_or_missing_candidate');
  const evidenceByFinding = new Map<string, EvidenceRow>();
  for (const evidence of (rawEvidence ?? []) as EvidenceRow[])
    if (!evidenceByFinding.has(evidence.finding_id))
      evidenceByFinding.set(evidence.finding_id, evidence);
  const reviews = new Map<string, ChecklistSource['humanReviewStatus']>();
  for (const decision of rawDecisions ?? [])
    if (!reviews.has(decision.finding_id))
      reviews.set(decision.finding_id, decision.decision as ChecklistSource['humanReviewStatus']);
  const roles = new Map<string, ChecklistSource['relationshipRole']>();
  for (const relationship of rawRelationships ?? []) {
    if (relationship.relationship_type !== 'parent_child') continue;
    roles.set(relationship.source_candidate_id, 'parent');
    roles.set(relationship.target_candidate_id, 'child');
  }

  const sources: ChecklistSource[] = findings.map((finding) => {
    const candidate = candidates.get(finding.candidate_id);
    if (!candidate || candidate.analysis_run_id !== verificationRun.analysis_run_id)
      throw new Error('candidate_analysis_scope_mismatch');
    const evidence = evidenceByFinding.get(finding.id);
    const due = extractDue(finding.deterministic_facts);
    return {
      workspaceId: request.workspaceId,
      analysisRunId: verificationRun.analysis_run_id,
      verificationRunId: request.verificationRunId,
      findingId: finding.id,
      findingVersion: finding.finding_version,
      candidateId: candidate.id,
      title: candidate.title,
      obligation: candidate.obligation,
      sourceCategory: candidate.category,
      mandatory: candidate.mandatory_class === 'mandatory',
      sourceSupportStatus: finding.source_support_status,
      precedenceStatus: finding.precedence_status,
      proofRequirement: finding.proof_requirement,
      machineStatus: finding.machine_status,
      humanReviewStatus: reviews.get(finding.id) ?? 'pending',
      documentId: evidence?.document_id ?? candidate.document_id,
      documentPageId: evidence?.document_page_id ?? null,
      pageNumber: evidence?.page_number ?? null,
      exactQuote: evidence?.quote_exact ?? null,
      parserConfidence: evidence ? 1 : null,
      dueAt: due.dueAt,
      dueTimezone: due.dueTimezone,
      relationshipRole: roles.get(candidate.id) ?? 'atomic',
      verificationEvidenceId: evidence?.id ?? null,
      validatedEvidence: Boolean(evidence),
    };
  });
  const items = generateChecklistItems(sources);
  const inputHash = hash(
    sources.map((source) => ({
      findingId: source.findingId,
      findingVersion: source.findingVersion,
      humanReviewStatus: source.humanReviewStatus,
      relationshipRole: source.relationshipRole,
      evidenceId: source.verificationEvidenceId,
    })),
  );
  const { data: priorRun } = await admin
    .from('checklist_generation_runs')
    .select('id, status, item_count')
    .eq('workspace_id', request.workspaceId)
    .eq('verification_run_id', request.verificationRunId)
    .eq('input_hash', inputHash)
    .eq('generator_version', CHECKLIST_GENERATOR_VERSION)
    .maybeSingle();
  if (priorRun?.status === 'completed')
    return {
      generationRunId: priorRun.id,
      inputHash,
      itemCount: priorRun.item_count,
      reused: true,
    };

  const { data: generationRun, error: generationError } = await admin
    .from('checklist_generation_runs')
    .insert({
      workspace_id: request.workspaceId,
      analysis_run_id: verificationRun.analysis_run_id,
      verification_run_id: request.verificationRunId,
      input_hash: inputHash,
      fixture_version: request.fixtureVersion ?? null,
      eligibility_version: CHECKLIST_ELIGIBILITY_VERSION,
      category_version: CHECKLIST_CATEGORY_VERSION,
      generator_version: CHECKLIST_GENERATOR_VERSION,
      blocker_version: CHECKLIST_BLOCKER_VERSION,
      readiness_version: CHECKLIST_READINESS_VERSION,
      schema_version: CHECKLIST_SCHEMA_VERSION,
      status: 'generating',
      source_count: sources.length,
      created_by: request.actorId,
    })
    .select('id')
    .single();
  if (generationError) throw new Error(`generation_run_insert_failed:${generationError.message}`);

  try {
    const existing = await admin
      .from('checklist_items')
      .select('id, stable_key, workflow_status, artifact_state')
      .eq('workspace_id', request.workspaceId)
      .in(
        'stable_key',
        items.map((item) => item.stableKey),
      );
    if (existing.error) throw existing.error;
    const existingByKey = new Map((existing.data ?? []).map((item) => [item.stable_key, item]));
    const itemIds = new Map<string, string>();
    for (const item of items) {
      const found = existingByKey.get(item.stableKey);
      if (found) {
        itemIds.set(item.stableKey, found.id);
        await admin
          .from('checklist_items')
          .update({ lifecycle_status: 'active', obsolete_reason: null })
          .eq('id', found.id)
          .eq('workspace_id', request.workspaceId);
      } else {
        const { data, error } = await admin
          .from('checklist_items')
          .insert({
            workspace_id: request.workspaceId,
            analysis_run_id: item.analysisRunId,
            verification_run_id: item.verificationRunId,
            finding_id: item.findingId,
            candidate_id: item.candidateId,
            stable_key: item.stableKey,
            title: item.title,
            obligation: item.obligation,
            category: item.category,
            mandatory: item.mandatory,
            eligibility_class: item.eligibility,
            eligibility_reason: item.eligibilityReason,
            contributes_to_required_total: item.contributesToRequiredTotal,
            source_support_status: item.sourceSupportStatus,
            precedence_status: item.precedenceStatus,
            proof_requirement: item.proofRequirement,
            machine_status: item.machineStatus,
            source_human_review_status: item.humanReviewStatus,
            workflow_status: item.workflowStatus,
            artifact_state: item.artifactState,
            due_at: item.dueAt,
            due_timezone: item.dueTimezone,
            relationship_role: item.relationshipRole,
            source_version: findings.find((finding) => finding.id === item.findingId)!
              .schema_version,
            generation_version: CHECKLIST_GENERATOR_VERSION,
          })
          .select('id')
          .single();
        if (error) throw error;
        itemIds.set(item.stableKey, data.id);
        await admin.from('audit_events').insert({
          workspace_id: request.workspaceId,
          actor_type: 'system',
          actor_id: request.actorId,
          event_type: 'checklist_item_created',
          entity_type: 'checklist_item',
          entity_id: data.id,
          payload: { stable_key: item.stableKey, generation_run_id: generationRun.id },
        });
      }
      const itemId = itemIds.get(item.stableKey)!;
      await admin.from('checklist_generation_run_items').upsert(
        {
          workspace_id: request.workspaceId,
          generation_run_id: generationRun.id,
          checklist_item_id: itemId,
        },
        { onConflict: 'generation_run_id,checklist_item_id' },
      );
      if (
        item.verificationEvidenceId &&
        item.documentId &&
        item.documentPageId &&
        item.pageNumber &&
        item.exactQuote
      )
        await admin.from('checklist_item_sources').upsert(
          {
            workspace_id: request.workspaceId,
            checklist_item_id: itemId,
            finding_id: item.findingId,
            verification_evidence_id: item.verificationEvidenceId,
            document_id: item.documentId,
            document_page_id: item.documentPageId,
            page_number: item.pageNumber,
            quote_exact: item.exactQuote,
            match_type: evidenceByFinding.get(item.findingId)!.match_type,
            parser_confidence: item.parserConfidence,
            source_version: findings.find((finding) => finding.id === item.findingId)!
              .schema_version,
          },
          { onConflict: 'checklist_item_id,verification_evidence_id', ignoreDuplicates: true },
        );
      if (item.requiresArtifact)
        await admin.from('checklist_required_artifacts').upsert(
          {
            workspace_id: request.workspaceId,
            checklist_item_id: itemId,
            artifact_kind: artifactKind(item),
            label: item.title,
            required: item.mandatory,
            state: item.artifactState,
            source_version: CHECKLIST_GENERATOR_VERSION,
          },
          { onConflict: 'checklist_item_id,artifact_kind,label', ignoreDuplicates: true },
        );
    }

    for (const relationship of rawRelationships ?? []) {
      const source = items.find((item) => item.candidateId === relationship.source_candidate_id);
      const target = items.find((item) => item.candidateId === relationship.target_candidate_id);
      if (!source || !target) continue;
      const supportedTypes = [
        'parent_child',
        'exact_duplicate',
        'semantic_duplicate',
        'restatement',
        'related_distinct',
        'uncertain',
      ];
      if (!supportedTypes.includes(relationship.relationship_type)) continue;
      await admin.from('checklist_relationships').upsert(
        {
          workspace_id: request.workspaceId,
          source_item_id: itemIds.get(source.stableKey),
          target_item_id: itemIds.get(target.stableKey),
          requirement_relationship_id: relationship.id,
          relationship_type: relationship.relationship_type,
          machine_proposed: true,
          human_review_status: relationship.human_status,
        },
        { onConflict: 'source_item_id,target_item_id,relationship_type', ignoreDuplicates: true },
      );
    }

    const activeStableKeys = items.map((item) => item.stableKey);
    const { data: currentItems } = await admin
      .from('checklist_items')
      .select('id, stable_key')
      .eq('workspace_id', request.workspaceId)
      .eq('analysis_run_id', verificationRun.analysis_run_id)
      .eq('lifecycle_status', 'active');
    const obsolete = (currentItems ?? []).filter(
      (item) => !activeStableKeys.includes(item.stable_key),
    );
    for (const old of obsolete ?? []) {
      await admin
        .from('checklist_items')
        .update({
          lifecycle_status: 'obsolete',
          obsolete_reason: 'source_not_present_in_latest_generation',
        })
        .eq('id', old.id);
      await admin.from('audit_events').insert({
        workspace_id: request.workspaceId,
        actor_type: 'system',
        actor_id: request.actorId,
        event_type: 'checklist_item_obsoleted',
        entity_type: 'checklist_item',
        entity_id: old.id,
        payload: { generation_run_id: generationRun.id },
      });
    }

    await recalculateChecklistState({
      workspaceId: request.workspaceId,
      generationRunId: generationRun.id,
      actorId: request.actorId,
      generatedItems: items,
      itemIds,
    });
    await admin
      .from('checklist_generation_runs')
      .update({
        status: 'completed',
        item_count: items.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', generationRun.id);
    await admin.from('audit_events').insert({
      workspace_id: request.workspaceId,
      actor_type: 'system',
      actor_id: request.actorId,
      event_type: priorRun ? 'checklist_regenerated' : 'checklist_generated',
      entity_type: 'checklist_generation_run',
      entity_id: generationRun.id,
      payload: {
        input_hash: inputHash,
        item_count: items.length,
        generator_version: CHECKLIST_GENERATOR_VERSION,
      },
    });
    return { generationRunId: generationRun.id, inputHash, itemCount: items.length, reused: false };
  } catch (error) {
    await admin
      .from('checklist_generation_runs')
      .update({
        status: 'failed',
        error_detail: error instanceof Error ? error.message.slice(0, 1000) : 'unknown',
      })
      .eq('id', generationRun.id);
    throw error;
  }
}

export async function recalculateChecklistState(input: {
  workspaceId: string;
  generationRunId: string;
  actorId: string;
  generatedItems?: GeneratedChecklistItem[];
  itemIds?: Map<string, string>;
}) {
  const admin = createSupabaseAdminClient();
  const { data: links, error: linksError } = await admin
    .from('checklist_generation_run_items')
    .select('checklist_item_id')
    .eq('workspace_id', input.workspaceId)
    .eq('generation_run_id', input.generationRunId);
  if (linksError) throw linksError;
  const ids = (links ?? []).map((link) => link.checklist_item_id);
  if (ids.length === 0 && !input.generatedItems?.length)
    throw new Error('checklist_items_required');
  const { data: dbItems } = ids.length
    ? await admin
        .from('checklist_items')
        .select('*')
        .eq('workspace_id', input.workspaceId)
        .in('id', ids)
        .eq('lifecycle_status', 'active')
    : { data: [] };
  const { data: waivers } = ids.length
    ? await admin
        .from('checklist_waivers')
        .select('checklist_item_id, status, created_at')
        .eq('workspace_id', input.workspaceId)
        .in('checklist_item_id', ids)
        .order('created_at', { ascending: false })
    : { data: [] };
  const waiverByItem = new Map<string, BlockerInputItem['waiverStatus']>();
  for (const waiver of waivers ?? [])
    if (!waiverByItem.has(waiver.checklist_item_id))
      waiverByItem.set(waiver.checklist_item_id, waiver.status as BlockerInputItem['waiverStatus']);
  const generatedByStable = new Map(
    (input.generatedItems ?? []).map((item) => [item.stableKey, item]),
  );
  const blockerInputs: BlockerInputItem[] = (dbItems ?? []).map((row) => {
    const generated = generatedByStable.get(row.stable_key);
    return {
      stableKey: row.stable_key,
      findingId: row.finding_id,
      title: row.title,
      category: row.category,
      mandatory: row.mandatory,
      eligibility: row.eligibility_class,
      eligibilityReason: row.eligibility_reason,
      contributesToRequiredTotal: row.contributes_to_required_total,
      workflowStatus: row.workflow_status,
      artifactState: row.artifact_state as ArtifactState,
      proofRequirement: row.proof_requirement,
      precedenceStatus: row.precedence_status,
      sourceSupportStatus: row.source_support_status,
      dueAt: row.due_at,
      dueTimezone: row.due_timezone,
      relationshipRole: row.relationship_role,
      waiverStatus: waiverByItem.get(row.id) ?? 'none',
      meetingConfirmed: generated ? false : row.workflow_status === 'completed',
    } as BlockerInputItem;
  });
  if (blockerInputs.length === 0 && input.generatedItems)
    blockerInputs.push(
      ...input.generatedItems.map((item) => ({ ...item, waiverStatus: 'none' as const })),
    );
  const blockers = calculateBlockers(blockerInputs);
  const idByStable =
    input.itemIds ?? new Map((dbItems ?? []).map((item) => [item.stable_key, item.id]));
  for (const blocker of blockers) {
    const itemId = idByStable.get(blocker.itemStableKey);
    if (!itemId) continue;
    const { data: existing } = await admin
      .from('checklist_blockers')
      .select('id,status')
      .eq('workspace_id', input.workspaceId)
      .eq('stable_key', blocker.stableKey)
      .maybeSingle();
    if (!existing) {
      await admin.from('checklist_blockers').insert({
        workspace_id: input.workspaceId,
        checklist_item_id: itemId,
        stable_key: blocker.stableKey,
        blocker_type: blocker.type,
        severity: blocker.severity,
        source: blocker.rule,
        reason: blocker.message,
        readiness_impact: blocker.readinessImpact
          ? 'blocks'
          : blocker.severity === 'warning'
            ? 'warns'
            : 'none',
        status: 'open',
        engine_version: blocker.engineVersion,
      });
      await admin.from('audit_events').insert({
        workspace_id: input.workspaceId,
        actor_type: 'system',
        actor_id: input.actorId,
        event_type: 'checklist_blocker_created',
        entity_type: 'checklist_item',
        entity_id: itemId,
        payload: {
          stable_key: blocker.stableKey,
          blocker_type: blocker.type,
          engine_version: blocker.engineVersion,
        },
      });
    } else if (existing.status === 'resolved') {
      const { data: prior } = await admin
        .from('checklist_blocker_resolutions')
        .select('id')
        .eq('blocker_id', existing.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      await admin.from('checklist_blocker_resolutions').insert({
        workspace_id: input.workspaceId,
        blocker_id: existing.id,
        actor_id: input.actorId,
        action: 'reopened',
        reason: 'Deterministic blocker condition is present again.',
        prior_resolution_id: prior?.id ?? null,
      });
      await admin.from('checklist_blockers').update({ status: 'reopened' }).eq('id', existing.id);
      await admin.from('audit_events').insert({
        workspace_id: input.workspaceId,
        actor_type: 'system',
        actor_id: input.actorId,
        event_type: 'checklist_blocker_reopened',
        entity_type: 'checklist_blocker',
        entity_id: existing.id,
        payload: { reason: 'deterministic_condition_reappeared' },
      });
    }
  }
  const activeKeys = new Set(blockers.map((blocker) => blocker.stableKey));
  const { data: oldBlockers } = ids.length
    ? await admin
        .from('checklist_blockers')
        .select('id,stable_key,status')
        .eq('workspace_id', input.workspaceId)
        .in('checklist_item_id', ids)
        .in('status', ['open', 'reopened'])
    : { data: [] };
  for (const old of oldBlockers ?? [])
    if (!activeKeys.has(old.stable_key)) {
      const { data: prior } = await admin
        .from('checklist_blocker_resolutions')
        .select('id')
        .eq('blocker_id', old.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      await admin.from('checklist_blocker_resolutions').insert({
        workspace_id: input.workspaceId,
        blocker_id: old.id,
        actor_id: input.actorId,
        action: 'resolved',
        reason: 'Deterministic blocker condition is no longer present.',
        prior_resolution_id: prior?.id ?? null,
      });
      await admin.from('checklist_blockers').update({ status: 'resolved' }).eq('id', old.id);
      await admin.from('audit_events').insert({
        workspace_id: input.workspaceId,
        actor_type: 'system',
        actor_id: input.actorId,
        event_type: 'checklist_blocker_resolved',
        entity_type: 'checklist_blocker',
        entity_id: old.id,
        payload: { reason: 'deterministic_condition_cleared' },
      });
    }
  const readiness = calculateReadiness(blockerInputs, blockers);
  const readinessInputHash = hash({
    items: blockerInputs.map((item) => [
      item.stableKey,
      item.workflowStatus,
      item.artifactState,
      item.waiverStatus,
    ]),
    blockers: blockers.map((blocker) => blocker.stableKey),
    version: CHECKLIST_READINESS_VERSION,
  });
  await admin.from('checklist_readiness_snapshots').insert({
    workspace_id: input.workspaceId,
    generation_run_id: input.generationRunId,
    input_hash: readinessInputHash,
    status: readiness.status,
    total_required: readiness.totalRequiredItems,
    completed_required: readiness.completedRequiredItems,
    incomplete_required: readiness.incompleteRequiredItems,
    blocked_items: readiness.blockedItems,
    unresolved_items: readiness.unresolvedItems,
    items_requiring_human_proof: readiness.itemsRequiringHumanProof,
    informational_items: readiness.informationalItems,
    active_critical_blockers: readiness.activeCriticalBlockers,
    warnings: readiness.warnings,
    excluded_items: readiness.excludedItems,
    excluded_reasons: {},
    summary: readiness.summary,
    engine_version: readiness.engineVersion,
  });
  await admin.from('audit_events').insert({
    workspace_id: input.workspaceId,
    actor_type: 'system',
    actor_id: input.actorId,
    event_type: 'checklist_readiness_calculated',
    entity_type: 'checklist_generation_run',
    entity_id: input.generationRunId,
    payload: {
      input_hash: readinessInputHash,
      engine_version: CHECKLIST_READINESS_VERSION,
      status: readiness.status,
    },
  });
  return readiness;
}
