import { createHash } from 'node:crypto';
import {
  PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  assertQualifiedPhase4Runtime,
  type Phase4ProductionRuntimeConfig,
} from '@usi/ai';

export const PHASE4_SYNTHETIC_MARKER = 'phase4-synthetic-test-only';

export type SyntheticSmokeCandidate = {
  id: string;
  workspaceId: string;
  analysisRunId: string;
  documentId: string;
  category: string;
  title: string;
  obligation: string;
  preliminaryPage: number;
  evidenceQuote: string;
};

export type Phase4SyntheticSmokeInput = {
  smokeScopeId: string;
  workspaceId: string;
  authenticatedUserId: string;
  documentIds: string[];
  analysisRunId: string;
  expectedCompatibilityFingerprint: string;
  fixtureVersion: string;
};

export type Phase4SyntheticSmokeSnapshot = {
  marker: {
    id: string;
    workspaceId: string;
    authenticatedUserId: string;
    analysisRunId: string;
    fixtureVersion: string;
    compatibilityFingerprint: string;
    approvedDocumentIds: string[];
    approvedCandidateIds: string[];
    candidateSetHash: string;
    syntheticMarker: string;
  } | null;
  membershipPresent: boolean;
  analysisRun: { id: string; workspaceId: string; documentId: string } | null;
  documents: Array<{
    id: string;
    workspaceId: string;
    parserName: string | null;
    deletedAt: string | null;
  }>;
  candidates: SyntheticSmokeCandidate[];
};

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sameSet(left: string[], right: string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

export function computeSyntheticCandidateSetHash(candidates: SyntheticSmokeCandidate[]): string {
  const normalized = [...candidates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((candidate) => ({
      id: candidate.id,
      workspaceId: candidate.workspaceId,
      analysisRunId: candidate.analysisRunId,
      documentId: candidate.documentId,
      category: candidate.category,
      title: candidate.title,
      obligation: candidate.obligation,
      preliminaryPage: candidate.preliminaryPage,
      evidenceQuote: candidate.evidenceQuote,
    }));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function stop(reason: string): never {
  throw new Error(`phase4_synthetic_smoke_preflight_failed:${reason}`);
}

export function validatePhase4SyntheticSmokePreflight(
  input: Phase4SyntheticSmokeInput,
  snapshot: Phase4SyntheticSmokeSnapshot,
  runtime: Phase4ProductionRuntimeConfig,
) {
  if (
    !input.smokeScopeId ||
    !input.workspaceId ||
    !input.authenticatedUserId ||
    !input.analysisRunId ||
    !input.documentIds.length ||
    !input.expectedCompatibilityFingerprint ||
    !input.fixtureVersion
  ) {
    stop('missing_explicit_identifier');
  }
  const asserted = assertQualifiedPhase4Runtime(runtime);
  if (
    input.expectedCompatibilityFingerprint !== PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT ||
    asserted.compatibilityFingerprint !== input.expectedCompatibilityFingerprint
  ) {
    stop('compatibility_fingerprint_mismatch');
  }
  const marker = snapshot.marker;
  if (!marker || marker.id !== input.smokeScopeId) stop('synthetic_marker_missing');
  if (marker.syntheticMarker !== PHASE4_SYNTHETIC_MARKER) stop('workspace_not_synthetic');
  if (marker.workspaceId !== input.workspaceId) stop('marker_workspace_mismatch');
  if (marker.authenticatedUserId !== input.authenticatedUserId) stop('marker_identity_mismatch');
  if (marker.analysisRunId !== input.analysisRunId) stop('marker_analysis_run_mismatch');
  if (marker.fixtureVersion !== input.fixtureVersion) stop('fixture_version_mismatch');
  if (marker.compatibilityFingerprint !== input.expectedCompatibilityFingerprint)
    stop('marker_fingerprint_mismatch');
  if (!snapshot.membershipPresent) stop('identity_not_authorized');
  if (!snapshot.analysisRun) stop('analysis_run_missing');
  if (
    snapshot.analysisRun.id !== input.analysisRunId ||
    snapshot.analysisRun.workspaceId !== input.workspaceId
  ) {
    stop('analysis_run_workspace_mismatch');
  }
  if (!sameSet(input.documentIds, marker.approvedDocumentIds)) stop('document_set_not_approved');
  if (snapshot.documents.length !== sortedUnique(input.documentIds).length)
    stop('document_set_incomplete');
  for (const document of snapshot.documents) {
    if (document.workspaceId !== input.workspaceId) stop('cross_workspace_document');
    if (!input.documentIds.includes(document.id)) stop('unapproved_document');
    if (document.deletedAt) stop('deleted_document');
    if (document.parserName !== 'synthetic-fixture') stop('document_not_synthetic');
  }
  if (!input.documentIds.includes(snapshot.analysisRun.documentId))
    stop('analysis_document_not_approved');
  if (
    !sameSet(
      snapshot.candidates.map((candidate) => candidate.id),
      marker.approvedCandidateIds,
    )
  )
    stop('candidate_set_not_approved');
  for (const candidate of snapshot.candidates) {
    if (
      candidate.workspaceId !== input.workspaceId ||
      candidate.analysisRunId !== input.analysisRunId
    ) {
      stop('cross_workspace_candidate');
    }
    if (!input.documentIds.includes(candidate.documentId)) stop('candidate_document_not_approved');
  }
  const candidateSetHash = computeSyntheticCandidateSetHash(snapshot.candidates);
  if (candidateSetHash !== marker.candidateSetHash) stop('candidate_set_hash_mismatch');
  return {
    assertedCompatibilityFingerprint: asserted.compatibilityFingerprint,
    candidateSetHash,
    candidateIds: sortedUnique(snapshot.candidates.map((candidate) => candidate.id)),
    documentIds: sortedUnique(input.documentIds),
  };
}

export async function runAfterPhase4SyntheticSmokePreflight<T>(input: {
  request: Phase4SyntheticSmokeInput;
  snapshot: Phase4SyntheticSmokeSnapshot;
  runtime: Phase4ProductionRuntimeConfig;
  execute: () => Promise<T>;
}): Promise<T> {
  validatePhase4SyntheticSmokePreflight(input.request, input.snapshot, input.runtime);
  return input.execute();
}
