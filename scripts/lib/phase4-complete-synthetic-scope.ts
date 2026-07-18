import { createHash } from 'node:crypto';
import {
  FIXTURE_ANALYSIS_RUN_ID,
  FIXTURE_DOCUMENT_ID,
  FIXTURE_WORKSPACE_ID,
  VERIFICATION_CASES,
  VERIFICATION_FIXTURE_VERSION,
  VERIFICATION_PAGES_V2,
} from '../../fixtures/eval/verification-cases.ts';
import {
  PHASE4_COMPLETE_SYNTHETIC_SCOPE_VERSION,
  PHASE4_SYNTHETIC_MARKER,
  computeSyntheticCandidateSetHash,
  computeSyntheticDocumentSetHash,
  computeSyntheticExpectedAnswersHash,
  type SyntheticSmokeCandidate,
  type SyntheticSmokeDocument,
} from '../../apps/worker/src/phase4-smoke-preflight.ts';
import { PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT } from '../../packages/ai/src/phase4-qualified-config.ts';

export const PHASE4_COMPLETE_SCOPE_ID = '40000000-0000-4000-8000-000000000001';
export const PHASE4_SYNTHETIC_PARSE_RUN_ID = '10000000-0000-4000-8000-000000000005';
export const PHASE4_SYNTHETIC_OBJECT_KEY = `${FIXTURE_WORKSPACE_ID}/phase4-synthetic/verification-cases-v2.pdf`;
export const PHASE4_SYNTHETIC_PARSER_VERSION = 'phase4-scope-provision-v1';
export const PHASE4_SYNTHETIC_SCOPE_VERSION = PHASE4_COMPLETE_SYNTHETIC_SCOPE_VERSION;
export const PHASE4_SYNTHETIC_PROJECT_REF = 'uxmxkdjschbekkbnweby';

const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

function escapePdfText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '-')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function wrap(value: string, width = 88): string[] {
  const words = escapePdfText(value).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Deterministic 17-page PDF used only for the frozen synthetic scope. */
export function buildPhase4SyntheticPdf(): Buffer {
  const pageCount = VERIFICATION_PAGES_V2.length;
  const pageObject = (index: number) => 4 + index * 2;
  const contentObject = (index: number) => 5 + index * 2;
  const objects = new Map<number, string>();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(
    2,
    `<< /Type /Pages /Kids [${VERIFICATION_PAGES_V2.map((_, index) => `${pageObject(index)} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  );
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  VERIFICATION_PAGES_V2.forEach((page, index) => {
    const lines = [`SYNTHETIC FIXTURE - PAGE ${page.pageNumber}`, ...wrap(page.text)];
    const stream = `BT\n/F1 9 Tf\n48 748 Td\n12 TL\n${lines
      .map((line, lineIndex) => `${lineIndex ? 'T*\n' : ''}(${line}) Tj`)
      .join('\n')}\nET`;
    objects.set(
      pageObject(index),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject(index)} 0 R >>`,
    );
    objects.set(
      contentObject(index),
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });
  const maxObject = 3 + pageCount * 2;
  let pdf = '%PDF-1.4\n% synthetic-only\n';
  const offsets = [0];
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    offsets[objectNumber] = Buffer.byteLength(pdf);
    pdf += `${objectNumber} 0 obj\n${objects.get(objectNumber)}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

export function phase4SyntheticCandidates(): SyntheticSmokeCandidate[] {
  return VERIFICATION_CASES.map((candidate) => ({
    id: candidate.id,
    workspaceId: FIXTURE_WORKSPACE_ID,
    analysisRunId: FIXTURE_ANALYSIS_RUN_ID,
    documentId: FIXTURE_DOCUMENT_ID,
    category: candidate.category,
    title: candidate.title,
    obligation: candidate.obligation,
    preliminaryPage: candidate.preliminaryPage,
    evidenceQuote: candidate.evidenceQuote,
  }));
}

export function phase4SyntheticManifest() {
  const pdf = buildPhase4SyntheticPdf();
  const document: SyntheticSmokeDocument = {
    id: FIXTURE_DOCUMENT_ID,
    workspaceId: FIXTURE_WORKSPACE_ID,
    objectKey: PHASE4_SYNTHETIC_OBJECT_KEY,
    sha256: sha256(pdf),
    pageCount: VERIFICATION_PAGES_V2.length,
    parserName: 'synthetic-fixture',
    parserVersion: PHASE4_SYNTHETIC_PARSER_VERSION,
    deletedAt: null,
  };
  const candidates = phase4SyntheticCandidates();
  return {
    scopeId: PHASE4_COMPLETE_SCOPE_ID,
    workspaceId: FIXTURE_WORKSPACE_ID,
    documentId: FIXTURE_DOCUMENT_ID,
    analysisRunId: FIXTURE_ANALYSIS_RUN_ID,
    parseRunId: PHASE4_SYNTHETIC_PARSE_RUN_ID,
    fixtureVersion: VERIFICATION_FIXTURE_VERSION,
    compatibilityFingerprint: PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
    scopeVersion: PHASE4_SYNTHETIC_SCOPE_VERSION,
    syntheticMarker: PHASE4_SYNTHETIC_MARKER,
    objectKey: PHASE4_SYNTHETIC_OBJECT_KEY,
    pdf,
    document,
    candidates,
    candidateIds: candidates.map((candidate) => candidate.id).sort(),
    documentIds: [FIXTURE_DOCUMENT_ID],
    candidateSetHash: computeSyntheticCandidateSetHash(candidates),
    documentSetHash: computeSyntheticDocumentSetHash([document]),
    expectedAnswersHash: computeSyntheticExpectedAnswersHash([...VERIFICATION_CASES]),
    pageTextHashes: VERIFICATION_PAGES_V2.map((page) => ({
      pageNumber: page.pageNumber,
      textSha256: sha256(page.text),
    })),
  };
}
