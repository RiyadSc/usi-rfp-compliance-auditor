import 'server-only';

import {
  PHASE8_VERSIONS,
  RATE_LIMIT_POLICIES,
  assertValidPhase8Binding,
  assertUsablePhase8Cache,
  buildRateLimitKey,
  classifyPhase8Failure,
  performanceEventSchema,
  phase8FallbackManifestSchema,
  sha256Canonical,
  type PerformanceEvent,
  type RateLimitedOperation,
} from '@usi/domain';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Consumes a database-atomic, server-owned rate bucket. Limit/window values are never accepted
 * from callers. The thrown message is deliberately generic and does not reveal object existence.
 */
export async function enforceRateLimit(input: {
  operation: RateLimitedOperation;
  actorId?: string | null;
  workspaceId?: string | null;
  discriminator?: string | null;
  admin?: Admin;
}): Promise<RateLimitResult> {
  const operation = input.operation;
  const policy = RATE_LIMIT_POLICIES[operation];
  const keyHash = buildRateLimitKey({
    operation,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    discriminator: input.discriminator,
  });
  const admin = input.admin ?? createSupabaseAdminClient();
  const { data, error } = await admin.rpc('consume_phase8_rate_limit', {
    p_operation: operation,
    p_key_hash: keyHash,
    p_workspace_id: input.workspaceId ?? null,
    p_actor_id: input.actorId ?? null,
  });
  if (error) throw new Error('Request could not be processed');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || Number(row.limit_value) !== policy.limit) {
    throw new Error('Request could not be processed');
  }
  const result = {
    allowed: Boolean(row.allowed),
    limit: Number(row.limit_value),
    remaining: Number(row.remaining),
    retryAfterSeconds: Number(row.retry_after_seconds),
  };
  if (!result.allowed) throw new Error('Rate limit exceeded. Try again later.');
  return result;
}

export async function recordPerformanceEvent(input: {
  workspaceId?: string | null | undefined;
  actorId?: string | null | undefined;
  event: PerformanceEvent;
  admin?: Admin;
}): Promise<void> {
  const event = performanceEventSchema.parse(input.event);
  const admin = input.admin ?? createSupabaseAdminClient();
  const { error } = await admin.from('performance_events').insert({
    workspace_id: input.workspaceId ?? null,
    actor_id: input.actorId ?? null,
    operation: event.operation,
    duration_ms: event.durationMs,
    item_count: event.itemCount,
    page_count: event.pageCount,
    cache_outcome: event.cacheOutcome,
    status: event.status,
    error_category: event.errorCategory,
    policy_version: PHASE8_VERSIONS.performance,
  });
  if (error) throw new Error('performance_event_write_failed');
}

export async function measureServerOperation<T>(input: {
  operation: PerformanceEvent['operation'];
  workspaceId?: string | null | undefined;
  actorId?: string | null | undefined;
  itemCount?: number | null;
  pageCount?: number | null;
  cacheOutcome?: PerformanceEvent['cacheOutcome'];
  execute: () => Promise<T>;
}): Promise<T> {
  const started = performance.now();
  try {
    const result = await input.execute();
    // Observability is best-effort: a telemetry outage must not replace a successful action.
    try {
      await recordPerformanceEvent({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        event: {
          version: PHASE8_VERSIONS.performance,
          operation: input.operation,
          durationMs: Math.round(performance.now() - started),
          itemCount: input.itemCount ?? null,
          pageCount: input.pageCount ?? null,
          cacheOutcome: input.cacheOutcome ?? null,
          status: 'success',
          errorCategory: null,
        },
      });
    } catch {
      // Do not log database errors because they may carry sensitive request metadata.
    }
    return result;
  } catch (error) {
    // Instrumentation failure must never replace the normalized operation failure.
    try {
      await recordPerformanceEvent({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        event: {
          version: PHASE8_VERSIONS.performance,
          operation: input.operation,
          durationMs: Math.round(performance.now() - started),
          itemCount: input.itemCount ?? null,
          pageCount: input.pageCount ?? null,
          cacheOutcome: input.cacheOutcome ?? null,
          status: 'failure',
          errorCategory: classifyPhase8Failure(error),
        },
      });
    } catch {
      // Deliberately no document, prompt, URL, or secret-bearing error logging.
    }
    throw error;
  }
}

export async function loadExactPhase8DemoScope(input: {
  scopeId: string;
  workspaceId: string;
  actorId: string;
  admin?: Admin;
}) {
  const admin = input.admin ?? createSupabaseAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.actorId)
    .maybeSingle();
  if (membershipError || !membership) throw new Error('Demo scope unavailable');
  const { data, error } = await admin
    .from('phase8_demo_scopes')
    .select('*')
    .eq('id', input.scopeId)
    .eq('workspace_id', input.workspaceId)
    .eq('authorized_identity_id', input.actorId)
    .maybeSingle();
  if (error || !data) throw new Error('Demo scope unavailable');
  const binding = assertValidPhase8Binding(data.binding);
  if (binding.workspaceId !== input.workspaceId || binding.authorizedIdentityId !== input.actorId) {
    throw new Error('Demo scope unavailable');
  }
  return { row: data, binding };
}

export async function loadValidatedPhase8Cache(input: {
  scopeId: string;
  workspaceId: string;
  actorId: string;
  admin?: Admin;
}) {
  const admin = input.admin ?? createSupabaseAdminClient();
  const scope = await loadExactPhase8DemoScope({ ...input, admin });
  const [
    { data: cache, error: cacheError },
    { data: documents },
    { data: analysis },
    { data: verification },
  ] = await Promise.all([
    admin
      .from('phase8_demo_cache_entries')
      .select('*')
      .eq('scope_id', input.scopeId)
      .eq('workspace_id', input.workspaceId)
      .eq('cache_key', scope.binding.cacheKey)
      .maybeSingle(),
    admin
      .from('documents')
      .select('id,sha256,status,deleted_at')
      .eq('workspace_id', input.workspaceId)
      .in('id', [scope.binding.sourceDocumentId, scope.binding.proposalDocumentId])
      .order('id'),
    admin
      .from('analysis_runs')
      .select('id,status')
      .eq('workspace_id', input.workspaceId)
      .eq('id', scope.binding.analysisRunId)
      .maybeSingle(),
    admin
      .from('verification_runs')
      .select('id,status,compatibility_fingerprint')
      .eq('workspace_id', input.workspaceId)
      .eq('id', scope.binding.verificationRunId)
      .maybeSingle(),
  ]);
  if (cacheError || !cache || documents?.length !== 2 || !analysis || !verification)
    throw new Error('Validated cache unavailable');
  const documentSetHash = sha256Canonical(
    documents.map((document) => ({ id: document.id, sha256: document.sha256 })),
  );
  if (
    documentSetHash !== scope.binding.documentSetHash ||
    verification.compatibility_fingerprint !== scope.binding.compatibilityFingerprint
  )
    throw new Error('Validated cache unavailable');
  assertUsablePhase8Cache({
    binding: scope.binding,
    record: {
      cacheVersion: cache.cache_version,
      cacheKey: cache.cache_key,
      bindingHash: cache.binding_hash,
      fixtureHash: cache.fixture_hash,
      status: cache.status,
      sourceRunsCompleted: analysis.status === 'completed' && verification.status === 'completed',
      parserHealthy: documents.every(
        (document) => document.status === 'parsed' && document.deleted_at === null,
      ),
    },
  });
  return { ...scope, cache };
}

export async function createPhase8FallbackGrant(input: {
  scopeId: string;
  workspaceId: string;
  actorId: string;
  admin?: Admin;
}) {
  const admin = input.admin ?? createSupabaseAdminClient();
  await loadValidatedPhase8Cache({ ...input, admin });
  await enforceRateLimit({
    operation: 'signed_download',
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    admin,
  });
  const { data: fallback, error } = await admin
    .from('phase8_demo_fallbacks')
    .select('*,export_artifacts!inner(*)')
    .eq('scope_id', input.scopeId)
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !fallback) throw new Error('Prepared fallback unavailable');
  const artifact = fallback.export_artifacts as unknown as {
    id: string;
    bucket_id: string;
    object_path: string;
    sha256: string;
    demo: boolean;
    status: string;
  };
  phase8FallbackManifestSchema.parse({
    fallbackVersion: fallback.fallback_version,
    workspaceId: input.workspaceId,
    scopeId: input.scopeId,
    reportSnapshotId: fallback.report_snapshot_id,
    exportArtifactId: fallback.export_artifact_id,
    contentSha256: fallback.content_sha256,
    label: fallback.label,
    privateBucket: artifact.bucket_id === 'workspace-exports',
    grantSeconds: 300,
    demoWatermark: 'DEMO — SYNTHETIC DATA — NOT FOR SUBMISSION',
  });
  if (!artifact.demo || artifact.status !== 'active' || artifact.sha256 !== fallback.content_sha256)
    throw new Error('Prepared fallback unavailable');
  const { data: signed, error: signedError } = await admin.storage
    .from('workspace-exports')
    .createSignedUrl(artifact.object_path, 300);
  if (signedError || !signed?.signedUrl) throw new Error('Prepared fallback unavailable');
  await admin.from('audit_events').insert({
    workspace_id: input.workspaceId,
    actor_type: 'system',
    actor_id: input.actorId,
    event_type: 'demo_fallback_activated',
    entity_type: 'phase8_demo_scope',
    entity_id: input.scopeId,
    payload: { fallback_version: fallback.fallback_version, label: fallback.label },
  });
  return { signedUrl: signed.signedUrl, expiresInSeconds: 300, label: fallback.label };
}
