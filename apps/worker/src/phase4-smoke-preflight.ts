import { createHash } from 'node:crypto';
import {
  PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  assertQualifiedPhase4Runtime,
  type Phase4ProductionRuntimeConfig,
} from '@usi/ai';

export const PHASE4_SYNTHETIC_MARKER = 'phase4-synthetic-test-only';
export const PHASE4_COMPLETE_SYNTHETIC_SCOPE_VERSION = 'phase4-complete-scope-v1';
export const PHASE4_COMPLETE_SYNTHETIC_CANDIDATE_COUNT = 24;

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
  expectedCandidateSetHash: string;
  expectedDocumentSetHash: string;
  expectedAnswersHash: string;
  fixtureVersion: string;
};

export type SyntheticSmokeDocument = {
  id: string;
  workspaceId: string;
  objectKey: string;
  sha256: string;
  pageCount: number;
  parserName: string | null;
  parserVersion: string | null;
  deletedAt: string | null;
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
    documentSetHash: string | null;
    expectedAnswersHash: string | null;
    scopeVersion: string;
    syntheticMarker: string;
  } | null;
  membershipPresent: boolean;
  analysisRun: { id: string; workspaceId: string; documentId: string } | null;
  documents: SyntheticSmokeDocument[];
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

export function computeSyntheticDocumentSetHash(documents: SyntheticSmokeDocument[]): string {
  const normalized = [...documents]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((document) => ({
      id: document.id,
      workspaceId: document.workspaceId,
      objectKey: document.objectKey,
      sha256: document.sha256,
      pageCount: document.pageCount,
      parserName: document.parserName,
      parserVersion: document.parserVersion,
    }));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function computeSyntheticExpectedAnswersHash(
  expectedAnswers: Array<{
    id: string;
    expected: {
      sourceSupportStatus: string;
      precedenceStatus: string;
      proofRequirement: string;
      pages: readonly number[];
      critical?: boolean;
      dateCase?: boolean;
      numberCase?: boolean;
      addendumCase?: boolean;
    };
  }>,
): string {
  const normalized = [...expectedAnswers]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => ({ id: item.id, expected: item.expected }));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function computePhase4SmokeRunInputHash(input: {
  analysisRunId: string;
  candidateSetHash: string;
  compatibilityFingerprint: string;
}): string {
  if (
    !input.analysisRunId ||
    !/^[a-f0-9]{64}$/.test(input.candidateSetHash) ||
    !/^[a-f0-9]{64}$/.test(input.compatibilityFingerprint)
  ) {
    stop('invalid_run_input_hash_material');
  }
  return createHash('sha256')
    .update(`${input.analysisRunId}:${input.candidateSetHash}:${input.compatibilityFingerprint}`)
    .digest('hex');
}

export function assertNextPhase4SyntheticSmokeRunVersion(
  requestedVersion: number,
  existingVersions: number[],
): number {
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1) {
    stop('invalid_verification_run_version');
  }
  if (existingVersions.some((version) => !Number.isInteger(version) || version < 1)) {
    stop('invalid_existing_verification_run_version');
  }
  const expectedVersion = existingVersions.length === 0 ? 1 : Math.max(...existingVersions) + 1;
  if (requestedVersion !== expectedVersion) {
    stop(`verification_run_version_must_be_${expectedVersion}`);
  }
  return requestedVersion;
}

export function computePhase4SmokeProcessingJobInputHash(
  verificationInputHash: string,
  verificationVersion: number,
): string {
  if (!/^[a-f0-9]{64}$/.test(verificationInputHash)) {
    stop('invalid_processing_job_input_hash_material');
  }
  if (!Number.isInteger(verificationVersion) || verificationVersion < 1) {
    stop('invalid_processing_job_version');
  }
  return createHash('sha256')
    .update(`${verificationInputHash}:verification-version:${verificationVersion}`)
    .digest('hex');
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
    !input.expectedCandidateSetHash ||
    !input.expectedDocumentSetHash ||
    !input.expectedAnswersHash ||
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
  if (marker.scopeVersion !== PHASE4_COMPLETE_SYNTHETIC_SCOPE_VERSION)
    stop('scope_not_complete_fixture');
  if (marker.syntheticMarker !== PHASE4_SYNTHETIC_MARKER) stop('workspace_not_synthetic');
  if (marker.workspaceId !== input.workspaceId) stop('marker_workspace_mismatch');
  if (marker.authenticatedUserId !== input.authenticatedUserId) stop('marker_identity_mismatch');
  if (marker.analysisRunId !== input.analysisRunId) stop('marker_analysis_run_mismatch');
  if (marker.fixtureVersion !== input.fixtureVersion) stop('fixture_version_mismatch');
  if (marker.compatibilityFingerprint !== input.expectedCompatibilityFingerprint)
    stop('marker_fingerprint_mismatch');
  if (marker.candidateSetHash !== input.expectedCandidateSetHash)
    stop('marker_candidate_set_hash_mismatch');
  if (marker.documentSetHash !== input.expectedDocumentSetHash)
    stop('marker_document_set_hash_mismatch');
  if (marker.expectedAnswersHash !== input.expectedAnswersHash)
    stop('marker_expected_answers_hash_mismatch');
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
  if (
    snapshot.candidates.length !== PHASE4_COMPLETE_SYNTHETIC_CANDIDATE_COUNT ||
    marker.approvedCandidateIds.length !== PHASE4_COMPLETE_SYNTHETIC_CANDIDATE_COUNT
  )
    stop('candidate_count_not_24');
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
  const documentSetHash = computeSyntheticDocumentSetHash(snapshot.documents);
  if (documentSetHash !== marker.documentSetHash) stop('document_set_hash_mismatch');
  return {
    assertedCompatibilityFingerprint: asserted.compatibilityFingerprint,
    candidateSetHash,
    documentSetHash,
    expectedAnswersHash: marker.expectedAnswersHash,
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
