/** Evaluator-only FAC115 logic. Production extraction must never import this module. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildFac115Phase9ExpectedArtifact,
  normalizeEvidenceText,
  phase9PrecedenceForEvidence,
  sha256Stable,
  validateEvidenceQuote,
  type Phase9AmendmentRelationship,
  type Phase9AnswerPolicy,
  type Phase9CandidateSeed,
  type Phase9FinalFinding,
  type Phase9SourceBlock,
} from '../../packages/ai/src/index.ts';
import { FAC115_ROOT } from './phase9-fac115-production.mts';

export const FAC115_EXPECTED_ARTIFACT_VERSION = 'phase9-fac115-expected-v2';

export async function loadFac115ExpectedAnswers() {
  const frozen = JSON.parse(
    await readFile(resolve(FAC115_ROOT, 'known-answers-draft.json'), 'utf8'),
  ) as {
    expected: Array<{
      id: string;
      expectedSourceStatus: string;
      expectedPrecedenceStatus: string;
      source: string;
      page: number;
      section: string;
      summary: string;
      evidence: string;
    }>;
  };
  const policy = JSON.parse(
    await readFile(resolve(FAC115_ROOT, 'phase9-expected-answer-policy-v1.json'), 'utf8'),
  ) as Phase9AnswerPolicy;
  const artifact = buildFac115Phase9ExpectedArtifact(frozen.expected, policy);
  return { artifact, expectedHash: sha256Stable(artifact) };
}

export async function evaluateFac115Phase9(input: {
  sourcePackageHash: string;
  blocks: Phase9SourceBlock[];
  candidates: Phase9CandidateSeed[];
  findings: Phase9FinalFinding[];
  amendmentRelationships: Phase9AmendmentRelationship[];
}) {
  const { artifact, expectedHash } = await loadFac115ExpectedAnswers();
  const normalize = (value: string) =>
    normalizeEvidenceText(value).toLocaleLowerCase().replace(/[“”]/g, '"');
  const findingByCandidate = new Map(
    input.findings.map((finding) => [finding.candidateId, finding]),
  );
  const normalizedDate = (value: string | null) => {
    if (!value) return null;
    const numeric = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (numeric)
      return `${numeric[3]}-${numeric[1]!.padStart(2, '0')}-${numeric[2]!.padStart(2, '0')}`;
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
  };
  const normalizedNumber = (value: string | null) => {
    if (!value) return null;
    const match = value.replaceAll(',', '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    let amount = Number(match[0]);
    if (/%/.test(value)) amount /= 100;
    if (/\bmillion|\d\s*m\b/i.test(value)) amount *= 1_000_000;
    if (/\bthousand|\d\s*k\b/i.test(value)) amount *= 1_000;
    return amount;
  };
  const rows = artifact.expected.map((answer) => {
    const expectedDocument =
      answer.nativeReference.kind === 'xlsx'
        ? answer.nativeReference.originalFile
        : answer.sourceFile;
    const exactBlocks = input.blocks.filter((block) => {
      if (block.documentName !== expectedDocument) return false;
      if (
        answer.nativeReference.kind === 'xlsx' &&
        (block.sheetName !== answer.nativeReference.sheetName ||
          block.cellRange !== answer.nativeReference.cellRange)
      )
        return false;
      if (answer.nativeReference.kind !== 'xlsx' && block.pageNumber !== answer.renderedPage)
        return false;
      const match = validateEvidenceQuote(block.text, answer.exactQuotation);
      return match.matchType === 'exact' || match.matchType === 'normalized_exact';
    });
    const candidates = input.candidates.filter((candidate) => {
      if (!candidate.sourceBlockIds.some((id) => exactBlocks.some((block) => block.id === id)))
        return false;
      const evidence = normalize(candidate.evidenceText);
      const quote = normalize(answer.exactQuotation);
      return evidence.includes(quote) || quote.includes(evidence);
    });
    const findings = candidates
      .map((candidate) => findingByCandidate.get(candidate.id))
      .filter(Boolean) as Phase9FinalFinding[];
    const actualSourceStatus =
      findings.find((finding) => finding.sourceSupportStatus === 'supported')
        ?.sourceSupportStatus ??
      findings.at(0)?.sourceSupportStatus ??
      'missing';
    const actualPrecedenceStatus = phase9PrecedenceForEvidence(
      answer.exactQuotation,
      input.amendmentRelationships,
    );
    const allMatchingLocations = input.blocks.filter((block) => {
      if (block.documentName !== expectedDocument) return false;
      const match = validateEvidenceQuote(block.text, answer.exactQuotation);
      return match.matchType === 'exact' || match.matchType === 'normalized_exact';
    });
    const actualProofRequirement =
      findings.find((finding) => finding.sourceSupportStatus === 'supported')?.proofRequirement ??
      findings.at(0)?.proofRequirement ??
      'missing';
    const datePass =
      answer.materialDates.length === 0 ||
      answer.materialDates.every((expectedDate) =>
        candidates.some(
          (candidate) => normalizedDate(candidate.dateValue) === expectedDate.normalized,
        ),
      );
    const numberPass =
      answer.materialNumbers.length === 0 ||
      answer.materialNumbers.every((expectedNumber) =>
        candidates.some((candidate) => {
          const actual = normalizedNumber(candidate.numberValue);
          return actual !== null && Math.abs(actual - expectedNumber.normalized) < 0.0000001;
        }),
      );
    return {
      answerId: answer.id,
      expectedSourceStatus: answer.expectedSourceStatus,
      actualSourceStatus,
      expectedPrecedenceStatus: answer.expectedPrecedenceStatus,
      actualPrecedenceStatus,
      expectedProofRequirement: answer.expectedProofRequirement,
      actualProofRequirement,
      expectedDocument,
      expectedPage: answer.nativeReference.kind === 'xlsx' ? null : answer.renderedPage,
      expectedSheet:
        answer.nativeReference.kind === 'xlsx' ? answer.nativeReference.sheetName : null,
      expectedCell:
        answer.nativeReference.kind === 'xlsx' ? answer.nativeReference.cellRange : null,
      evidenceBlockIds: exactBlocks.map((block) => block.id),
      candidateIds: candidates.map((candidate) => candidate.id),
      findingIds: findings.map((finding) => finding.candidateId),
      evidenceValid: exactBlocks.length > 0,
      provenanceValid:
        exactBlocks.length > 0 &&
        exactBlocks.every(
          (block) =>
            block.documentName === expectedDocument &&
            (answer.nativeReference.kind === 'xlsx'
              ? block.sheetName === answer.nativeReference.sheetName &&
                block.cellRange === answer.nativeReference.cellRange
              : block.pageNumber === answer.renderedPage),
        ),
      ambiguousEvidenceLocation: allMatchingLocations.length > 1,
      datePass,
      numberPass,
      proofPass: actualProofRequirement === answer.expectedProofRequirement,
      sourcePass: actualSourceStatus === answer.expectedSourceStatus,
      precedencePass: actualPrecedenceStatus === answer.expectedPrecedenceStatus,
    };
  });
  const passed = rows.every(
    (row) =>
      row.sourcePass &&
      row.precedencePass &&
      row.proofPass &&
      row.datePass &&
      row.numberPass &&
      row.evidenceValid &&
      row.provenanceValid &&
      row.candidateIds.length > 0,
  );
  return {
    version: FAC115_EXPECTED_ARTIFACT_VERSION,
    sourcePackageHash: input.sourcePackageHash,
    expectedHash,
    total: rows.length,
    matched: rows.filter(
      (row) =>
        row.sourcePass &&
        row.precedencePass &&
        row.proofPass &&
        row.datePass &&
        row.numberPass &&
        row.evidenceValid &&
        row.provenanceValid &&
        row.candidateIds.length > 0,
    ).length,
    rows,
    metrics: {
      expectedAnswerCoverage:
        rows.filter((row) => row.candidateIds.length > 0).length / rows.length,
      sourceStatusAccuracy: rows.filter((row) => row.sourcePass).length / rows.length,
      precedenceAccuracy: rows.filter((row) => row.precedencePass).length / rows.length,
      proofRequirementAccuracy: rows.filter((row) => row.proofPass).length / rows.length,
      dateAccuracy: rows.filter((row) => row.datePass).length / rows.length,
      numericalAccuracy: rows.filter((row) => row.numberPass).length / rows.length,
      spreadsheetEvidenceAccuracy:
        rows.filter((row) => row.expectedCell !== null && row.evidenceValid && row.provenanceValid)
          .length / Math.max(1, rows.filter((row) => row.expectedCell !== null).length),
      evidenceValidity: rows.filter((row) => row.evidenceValid).length / rows.length,
      provenanceValidity: rows.filter((row) => row.provenanceValid).length / rows.length,
      falseVerified: rows.filter(
        (row) => row.actualSourceStatus === 'supported' && row.expectedSourceStatus !== 'supported',
      ).length,
      falseActive: rows.filter(
        (row) =>
          row.actualPrecedenceStatus === 'active' && row.expectedPrecedenceStatus !== 'active',
      ).length,
    },
    passed,
  };
}
