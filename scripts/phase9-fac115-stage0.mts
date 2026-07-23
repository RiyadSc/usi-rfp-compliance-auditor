/** Provider-free Massachusetts FAC115 Phase 9 readiness and budget preflight. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  FAC115_PHASE9_STAGE0_VERSION,
  buildFac115Phase9ExpectedArtifact,
  estimateChatCost,
  extractTypedDateFacts,
  extractTypedNumberFacts,
  mapFac115HistoricalCandidates,
  normalizeEvidenceText,
  officialPortalHtmlToText,
  parseDeterministicNumbers,
  sha256Stable,
  validateEvidenceQuote,
  type Phase9AnswerPolicy,
} from '../packages/ai/src/index.ts';
import type { RequirementCandidate } from '../packages/ai/src/schemas.ts';
import { DocxParserAdapter, XlsxParserAdapter } from '../packages/documents/src/parser/adapters.ts';
import { PdfJsParserAdapter } from '../packages/documents/src/parser/pdfjs-adapter.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const ROOT = resolve('fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375');
const SOURCE = resolve(ROOT, 'source');
const RENDITIONS = resolve(ROOT, 'renditions/pdf');
const ARTIFACTS = resolve('artifacts/evaluation');
const POPULATION_PATH = resolve(
  ARTIFACTS,
  'public-rfp-fac115-population-5d2401ea-f042-4c3c-a6f8-f6c3dfb94fd0.json',
);
const EXPECTED_PATH = resolve(ROOT, 'phase9-expected-answers-v1.json');
const REPORT_PATH = resolve(ARTIFACTS, 'phase9-fac115-stage0-readiness-v1.json');
const FAILURE_TRACE_RELATIVE =
  'artifacts/evaluation/phase9-fac115-candidate-mapping-failures-v1.json';
const FAILURE_TRACE_PATH = resolve(FAILURE_TRACE_RELATIVE);
const VERIFY_MODEL = 'gpt-5.5-2026-04-23';
const PHASE3_CEILING_USD = 10;
const PHASE4_CEILING_USD = 15;
const PUBLIC_NOTE = /public-rfp/i;

for (const name of [
  'PUBLIC_RFP_FAC115_LIVE_EXTRACT',
  'PUBLIC_RFP_FAC115_LIVE_VERIFY',
  'PUBLIC_RFP_FAC115_LIVE_PILOT',
]) {
  if (process.env[name] === '1') throw new Error(`Stage 0 forbids provider flag ${name}=1`);
}

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const round = (value: number) => Number(value.toFixed(6));

const sourceManifest = JSON.parse(
  await readFile(resolve(ROOT, 'source-manifest.json'), 'utf8'),
) as {
  version: string;
  solicitationId: string;
  officialPortalUrl: string;
  evaluationScope: { publicOnly: boolean; category: string };
  sources: Array<{
    file: string;
    sha256: string;
    bytes: number;
    attachmentId: string | null;
    activeForCategory1: boolean;
  }>;
};
const renditionManifest = JSON.parse(
  await readFile(resolve(ROOT, 'renditions/rendition-manifest.json'), 'utf8'),
) as {
  version: string;
  renditions: Array<{ file: string; sha256: string; bytes: number; kind: string }>;
};
const frozenAnswers = JSON.parse(
  await readFile(resolve(ROOT, 'known-answers-draft.json'), 'utf8'),
) as {
  version: string;
  fixture: string;
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
  await readFile(resolve(ROOT, 'phase9-expected-answer-policy-v1.json'), 'utf8'),
) as Phase9AnswerPolicy;
const population = JSON.parse(await readFile(POPULATION_PATH, 'utf8')) as {
  analysisRunId: string;
  candidates: RequirementCandidate[];
  quoteGate: { acceptedCandidateIds: string[] };
  verificationPlan: {
    populationHash: string;
    candidateCount: number;
    plannedMaximumUsd: number;
  };
};

const sourceFiles = (await readdir(SOURCE)).sort();
const expectedSourceFiles = sourceManifest.sources.map((item) => item.file).sort();
const sourceChecks = [];
for (const source of sourceManifest.sources) {
  const bytes = new Uint8Array(await readFile(resolve(SOURCE, source.file)));
  sourceChecks.push({
    file: source.file,
    expectedSha256: source.sha256,
    actualSha256: sha256(bytes),
    expectedBytes: source.bytes,
    actualBytes: bytes.byteLength,
    officialAttachmentId: source.attachmentId,
    activeForCategory1: source.activeForCategory1,
    valid: sha256(bytes) === source.sha256 && bytes.byteLength === source.bytes,
  });
}
const portalHtml = await readFile(resolve(SOURCE, 'official-solicitation-page.html'), 'utf8');
const portalText = officialPortalHtmlToText(portalHtml);
const attachmentBindings = sourceManifest.sources
  .filter((source) => source.attachmentId)
  .map((source) => ({
    file: source.file,
    attachmentId: source.attachmentId!,
    presentInPreservedOfficialPortal: portalHtml.includes(`downloadFile('${source.attachmentId}')`),
  }));

const renditionFiles = (await readdir(RENDITIONS)).filter((name) => name.endsWith('.pdf')).sort();
const renditionChecks = [];
const pdfParser = new PdfJsParserAdapter();
const pdfPages = new Map<string, Array<{ pageNumber: number; text: string }>>();
const parserWarnings: Array<{ file: string; warnings: string[]; emptyPages: number }> = [];
for (const rendition of renditionManifest.renditions) {
  const bytes = new Uint8Array(await readFile(resolve(RENDITIONS, rendition.file)));
  const actualSha256 = sha256(bytes);
  const actualBytes = bytes.byteLength;
  const parsed = await pdfParser.parse(bytes, { maxPages: 100, timeoutMs: 120_000 });
  const pages = parsed.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text }));
  pdfPages.set(rendition.file, pages);
  renditionChecks.push({
    file: rendition.file,
    kind: rendition.kind,
    expectedSha256: rendition.sha256,
    actualSha256,
    expectedBytes: rendition.bytes,
    actualBytes,
    pages: pages.length,
    valid: actualSha256 === rendition.sha256 && actualBytes === rendition.bytes,
  });
  parserWarnings.push({
    file: rendition.file,
    warnings: parsed.warnings,
    emptyPages: pages.filter((page) => !normalizeEvidenceText(page.text)).length,
  });
}

const xlsxNative = new Map<
  string,
  {
    contentHash: string;
    sheets: Array<{
      sheetName: string;
      parserState: string;
      cells: Array<{ cellRange?: string; text: string }>;
    }>;
  }
>();
for (const source of sourceManifest.sources.filter((item) => item.file.endsWith('.xlsx'))) {
  const bytes = new Uint8Array(await readFile(resolve(SOURCE, source.file)));
  const parsed = await new XlsxParserAdapter().parse({
    workspaceId: 'phase9-stage0-offline',
    sourceDocumentId: source.file,
    filename: source.file,
    declaredMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes,
  });
  xlsxNative.set(source.file, {
    contentHash: parsed.contentHash,
    sheets: parsed.pages.map((page) => ({
      sheetName: page.displayedPageLabel ?? '',
      parserState: page.parserState,
      cells: page.tables.flatMap((table) =>
        table.cells.map((cell) => ({
          cellRange: cell.provenance.cellRange,
          text: cell.normalizedText,
        })),
      ),
    })),
  });
}

const docxNative = [];
for (const source of sourceManifest.sources.filter((item) => item.file.endsWith('.docx'))) {
  const bytes = new Uint8Array(await readFile(resolve(SOURCE, source.file)));
  const parsed = await new DocxParserAdapter().parse({
    workspaceId: 'phase9-stage0-offline',
    sourceDocumentId: source.file,
    filename: source.file,
    declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes,
  });
  docxNative.push({
    file: source.file,
    contentHash: parsed.contentHash,
    blocks: parsed.pages.reduce((sum, page) => sum + page.blocks.length, 0),
    warnings: parsed.warnings.map((warning) => warning.code),
  });
}

const expectedArtifact = buildFac115Phase9ExpectedArtifact(frozenAnswers.expected, policy);
const expectedHash = sha256Stable(expectedArtifact);
const citationChecks = expectedArtifact.expected.map((answer) => {
  const pages = pdfPages.get(answer.sourceFile);
  if (!pages && answer.sourceFile === 'official-solicitation-page.html') {
    const match = validateEvidenceQuote(portalText, answer.exactQuotation);
    return {
      id: answer.id,
      sourceFile: answer.sourceFile,
      renderedPage: answer.renderedPage,
      matchType: match.matchType,
      valid: match.matchType === 'exact' || match.matchType === 'normalized_exact',
    };
  }
  const page = pages?.find((item) => item.pageNumber === answer.renderedPage);
  const match = validateEvidenceQuote(page?.text ?? '', answer.exactQuotation);
  return {
    id: answer.id,
    sourceFile: answer.sourceFile,
    renderedPage: answer.renderedPage,
    matchType: match.matchType,
    valid: match.matchType === 'exact' || match.matchType === 'normalized_exact',
  };
});
const nativeSpreadsheetChecks = expectedArtifact.expected
  .filter((answer) => answer.nativeReference.kind === 'xlsx')
  .map((answer) => {
    if (answer.nativeReference.kind !== 'xlsx') throw new Error('unreachable');
    const workbook = xlsxNative.get(answer.nativeReference.originalFile);
    const sheet = workbook?.sheets.find(
      (item) => item.sheetName === answer.nativeReference.sheetName,
    );
    const cell = sheet?.cells.find((item) => item.cellRange === answer.nativeReference.cellRange);
    return {
      id: answer.id,
      originalFile: answer.nativeReference.originalFile,
      sheetName: answer.nativeReference.sheetName,
      cellRange: answer.nativeReference.cellRange,
      renderedPage: answer.nativeReference.renderedPage,
      nativeText: cell?.text ?? null,
      exactNativeMatch: cell?.text === normalizeEvidenceText(answer.exactQuotation),
    };
  });

const documentIdBySourceFile: Record<string, string> = {
  'FAC115_Request_for_Response_03.29.2022.pdf': '80000000-0000-4000-8000-000000000001',
  'FAC115_Attachment_A_Bidder_Response_Form_03.29.2022.pdf': '80000000-0000-4000-8000-000000000002',
  'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf':
    '80000000-0000-4000-8000-000000000003',
  'FAC115_Attachment_D_SDP_Form_03.29.2022.pdf': '80000000-0000-4000-8000-000000000004',
  'FAC115_Attachment_E_Prompt_Pay_Discount_Form_03.29.2022.pdf':
    '80000000-0000-4000-8000-000000000005',
  'FAC115_Creating_a_Quote_in_COMMBUYS_Job_Aid_03.29.2022.pdf':
    '80000000-0000-4000-8000-000000000006',
  'Intent_to_Bid_Notice_FAC115.pdf': '80000000-0000-4000-8000-000000000007',
  'official-solicitation-page.html': '80000000-0000-4000-8000-000000000008',
};
const candidateBindings = mapFac115HistoricalCandidates({
  answers: expectedArtifact.expected,
  candidates: population.candidates,
  acceptedCandidateIds: population.quoteGate.acceptedCandidateIds,
  documentIdBySourceFile,
});
const acceptedCandidateIds = new Set(population.quoteGate.acceptedCandidateIds);
const normalizedForBinding = (value: string) =>
  normalizeEvidenceText(value).toLowerCase().replace(/[“”]/g, '"');
const candidateFailureTraces = candidateBindings
  .filter((binding) => !binding.exactBinding)
  .map((binding) => {
    const answer = expectedArtifact.expected.find((item) => item.id === binding.answerId)!;
    const expectedDocumentId = documentIdBySourceFile[answer.sourceFile];
    const expectedQuote = normalizedForBinding(answer.exactQuotation);
    const quotationMatches = population.candidates
      .filter((candidate) => candidate.documentId === expectedDocumentId)
      .filter((candidate) => {
        const quote = normalizedForBinding(candidate.evidenceQuote);
        return expectedQuote.includes(quote) || quote.includes(expectedQuote);
      })
      .map((candidate) => ({
        candidateId: candidate.id,
        acceptedByHistoricalQuoteGate: acceptedCandidateIds.has(candidate.id),
        preliminaryPage: candidate.preliminaryPage,
        expectedRenderedPage: answer.renderedPage,
        title: candidate.title,
        evidenceQuote: candidate.evidenceQuote,
      }));
    const answerTokens = new Set(
      normalizedForBinding(`${answer.summary} ${answer.exactQuotation}`)
        .split(/[^a-z0-9%]+/)
        .filter((token) => token.length >= 4),
    );
    const lexicalRecoveryCandidates = population.candidates
      .filter((candidate) => candidate.documentId === expectedDocumentId)
      .map((candidate) => {
        const text = normalizedForBinding(
          `${candidate.title} ${candidate.obligation} ${candidate.evidenceQuote}`,
        );
        return {
          candidateId: candidate.id,
          acceptedByHistoricalQuoteGate: acceptedCandidateIds.has(candidate.id),
          preliminaryPage: candidate.preliminaryPage,
          title: candidate.title,
          overlap: [...answerTokens].filter((token) => text.includes(token)).length,
        };
      })
      .filter((candidate) => candidate.overlap > 0)
      .sort(
        (left, right) =>
          right.overlap - left.overlap || left.candidateId.localeCompare(right.candidateId),
      )
      .slice(0, 3);
    const category = quotationMatches.some(
      (candidate) =>
        candidate.acceptedByHistoricalQuoteGate &&
        candidate.preliminaryPage !== answer.renderedPage,
    )
      ? 'accepted_candidate_wrong_rendered_page'
      : quotationMatches.some(
            (candidate) =>
              !candidate.acceptedByHistoricalQuoteGate &&
              candidate.preliminaryPage !== answer.renderedPage,
          )
        ? 'candidate_rejected_after_printed_page_label'
        : quotationMatches.length
          ? 'quote_or_document_alignment_mismatch'
          : 'no_exact_extracted_candidate';
    return {
      answerId: answer.id,
      expectedCandidateId: answer.candidateId,
      sourceFile: answer.sourceFile,
      renderedPage: answer.renderedPage,
      exactQuotation: answer.exactQuotation,
      category,
      quotationMatches,
      lexicalRecoveryCandidates,
      acceptedAsBinding: false,
      recoveryRule:
        'Recovery candidates are diagnostic only. No fuzzy or lexical match becomes a scored citation.',
    };
  });

const dateChecks = expectedArtifact.expected.flatMap((answer) =>
  answer.materialDates.map((expected) => {
    const parsed = extractTypedDateFacts(`${answer.summary} ${expected.raw}`).find(
      (fact) => fact.normalized === expected.normalized,
    );
    const normalizeTime = (value: string | null | undefined) =>
      value?.replace(/^0(?=\d:)/, '').toUpperCase() ?? null;
    return {
      answerId: answer.id,
      role: expected.role,
      expected: expected.normalized,
      parsed: parsed?.normalized ?? null,
      expectedTime: expected.time,
      parsedTime: parsed?.time ?? null,
      ambiguousTime: expected.ambiguousTime,
      valid:
        Boolean(parsed) &&
        (expected.ambiguousTime ||
          !expected.time ||
          normalizeTime(parsed?.time) === normalizeTime(expected.time)),
    };
  }),
);
const numberChecks = expectedArtifact.expected.flatMap((answer) =>
  answer.materialNumbers.map((expected) => {
    const typed = extractTypedNumberFacts(`${answer.summary} ${expected.raw}`);
    const parsed = parseDeterministicNumbers(expected.raw).find((fact) => {
      const normalized =
        fact.unit === 'percent' ? Number(fact.normalizedValue) / 100 : fact.normalizedValue;
      return normalized === expected.normalized;
    });
    return {
      answerId: answer.id,
      role: expected.role,
      expected: expected.normalized,
      parsed:
        parsed?.unit === 'percent'
          ? Number(parsed.normalizedValue) / 100
          : (parsed?.normalizedValue ?? null),
      typedRoles: typed.map((fact) => fact.role),
      valid: Boolean(parsed),
    };
  }),
);

const injectionPatterns = [
  /ignore (?:all |the )?(?:previous|prior|system) instructions/i,
  /reveal (?:the )?(?:api key|secret|system prompt)/i,
  /mark (?:this|me|itself) (?:as )?verified/i,
  /omit (?:all )?other pages/i,
  /change (?:the )?output (?:schema|requirements)/i,
  /use (?:a )?(?:tool|function|mcp|web search)/i,
];
const sourceTexts = [
  portalText,
  ...[...pdfPages.values()].flat().map((page) => page.text),
  ...[...xlsxNative.values()].flatMap((workbook) =>
    workbook.sheets.flatMap((sheet) => sheet.cells.map((cell) => cell.text)),
  ),
];
const promptInjectionHits = injectionPatterns.flatMap((pattern) =>
  sourceTexts.flatMap((text, index) =>
    pattern.test(text) ? [{ pattern: pattern.source, sourceIndex: index }] : [],
  ),
);

const pilotAnswers = policy.pilotAnswerIds.map((id) => {
  const answer = expectedArtifact.expected.find((item) => item.id === id);
  if (!answer) throw new Error(`Unknown pilot answer ID: ${id}`);
  return answer;
});
const contextTextsFor = (answer: (typeof pilotAnswers)[number]) => {
  if (answer.sourceFile === 'official-solicitation-page.html') return [portalText];
  const pages = pdfPages.get(answer.sourceFile) ?? [];
  const citedIndex = pages.findIndex((page) => page.pageNumber === answer.renderedPage);
  if (citedIndex < 0) return [];
  return pages.slice(citedIndex, Math.min(pages.length, citedIndex + 2)).map((page) => page.text);
};
const pilotReserveCandidates = pilotAnswers.map((answer) => {
  const contexts = contextTextsFor(answer).slice(0, 2);
  const estimatedInputTokens =
    contexts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0) + 2500;
  const entailmentMaximumUsd = estimateChatCost(estimatedInputTokens, 1800, VERIFY_MODEL);
  const challengeMaximumUsd = estimateChatCost(estimatedInputTokens, 1600, VERIFY_MODEL);
  return {
    answerId: answer.id,
    contextCount: contexts.length,
    estimatedInputTokens,
    maximumUsd: round((entailmentMaximumUsd + challengeMaximumUsd) * 3),
  };
});
const pilotMaximumUsd = round(
  pilotReserveCandidates.reduce((sum, candidate) => sum + candidate.maximumUsd, 0),
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Supabase ledger runtime unavailable');
const projectRef = new URL(url).hostname.split('.')[0];
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const ledger: Array<{
  id: string;
  phase: string | null;
  kind: string | null;
  estimated_cost_usd: number | string | null;
  note: string | null;
}> = [];
for (let start = 0; ; start += 1000) {
  const { data, error } = await admin
    .from('spend_ledger')
    .select('id,phase,kind,estimated_cost_usd,note')
    .order('id', { ascending: true })
    .range(start, start + 999);
  if (error) throw error;
  ledger.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const ledgerSum = (rows: typeof ledger) =>
  round(rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0));
const ledgers = {
  rows: ledger.length,
  phase3Usd: ledgerSum(ledger.filter((row) => row.phase === 'phase3')),
  phase4Usd: ledgerSum(ledger.filter((row) => row.phase === 'phase4')),
  publicEvaluationUsd: ledgerSum(ledger.filter((row) => PUBLIC_NOTE.test(String(row.note ?? '')))),
  remediationUsd: ledgerSum(ledger.filter((row) => String(row.note ?? '').includes('remediation'))),
  cumulativeApiUsd: ledgerSum(ledger),
};

const coverageGaps = [
  ...(expectedArtifact.coverage.genuineUnresolvedConflictCaseIds.length
    ? []
    : ['no_genuine_unresolved_conflict_case']),
  ...(expectedArtifact.coverage.parserUncertainCaseIds.length
    ? []
    : ['no_parser_uncertain_expected_case']),
  ...(expectedArtifact.coverage.promptInjectionCaseIds.length
    ? []
    : ['no_source_native_prompt_injection_case']),
];
const exactBindings = candidateBindings.filter((binding) => binding.exactBinding).length;
const currentHeadroom = {
  phase3Usd: round(PHASE3_CEILING_USD - ledgers.phase3Usd),
  phase4Usd: round(PHASE4_CEILING_USD - ledgers.phase4Usd),
};
const blockers = [
  ...(sourceChecks.every((item) => item.valid) ? [] : ['source_hash_or_size_mismatch']),
  ...(sourceFiles.join('|') === expectedSourceFiles.join('|')
    ? []
    : ['source_set_extra_or_missing']),
  ...(renditionChecks.every((item) => item.valid) ? [] : ['rendition_hash_or_size_mismatch']),
  ...(renditionFiles.length === renditionManifest.renditions.length
    ? []
    : ['rendition_set_extra_or_missing']),
  ...(attachmentBindings.every((item) => item.presentInPreservedOfficialPortal)
    ? []
    : ['official_attachment_binding_missing']),
  ...(citationChecks.every((item) => item.valid) ? [] : ['citation_validation_failed']),
  ...(nativeSpreadsheetChecks.every((item) => item.exactNativeMatch)
    ? []
    : ['spreadsheet_native_provenance_failed']),
  ...(dateChecks.every((item) => item.valid) ? [] : ['deterministic_date_validation_failed']),
  ...(numberChecks.every((item) => item.valid) ? [] : ['deterministic_number_validation_failed']),
  ...(exactBindings === expectedArtifact.expected.length
    ? []
    : ['historical_candidate_to_answer_mapping_incomplete']),
  ...coverageGaps,
  ...(pilotMaximumUsd <= currentHeadroom.phase3Usd || pilotMaximumUsd <= currentHeadroom.phase4Usd
    ? []
    : ['pilot_reserve_exceeds_existing_phase_headroom']),
  'separate_explicit_pilot_budget_authorization_required',
];

const report = {
  version: FAC115_PHASE9_STAGE0_VERSION,
  generatedAt: new Date().toISOString(),
  providerCalls: 0,
  providerConstructed: false,
  fixture: frozenAnswers.fixture,
  solicitationId: sourceManifest.solicitationId,
  categoryScope: sourceManifest.evaluationScope.category,
  publicOnly: sourceManifest.evaluationScope.publicOnly,
  officialPortalUrl: sourceManifest.officialPortalUrl,
  supabaseProjectRef: projectRef,
  source: {
    manifestVersion: sourceManifest.version,
    exactSet: sourceFiles.join('|') === expectedSourceFiles.join('|'),
    checks: sourceChecks,
    officialAttachmentBindings: attachmentBindings,
    containsVendorSubmission: sourceFiles.some((name) =>
      /vendor.*(?:proposal|submission)|bidder.*proposal/i.test(name),
    ),
    containsUsiMaterial: sourceFiles.some((name) => /usi/i.test(name)),
  },
  rendering: {
    manifestVersion: renditionManifest.version,
    exactSet: renditionFiles.length === renditionManifest.renditions.length,
    checks: renditionChecks,
    parserWarnings,
    nativeDocx: docxNative,
    nativeXlsx: [...xlsxNative.entries()].map(([file, workbook]) => ({
      file,
      contentHash: workbook.contentHash,
      sheets: workbook.sheets.map((sheet) => ({
        sheetName: sheet.sheetName,
        parserState: sheet.parserState,
        populatedCells: sheet.cells.filter((cell) => cell.text).length,
      })),
    })),
  },
  expectedAnswers: {
    version: expectedArtifact.version,
    policyVersion: expectedArtifact.policyVersion,
    hash: expectedHash,
    count: expectedArtifact.expected.length,
    previousFrozenAnswerCount: frozenAnswers.expected.length,
    supplementalAnswerIds: expectedArtifact.expected
      .filter((answer) => !frozenAnswers.expected.some((item) => item.id === answer.id))
      .map((answer) => answer.id),
    citationChecks,
    nativeSpreadsheetChecks,
    coverage: expectedArtifact.coverage,
    coverageGaps,
  },
  deterministic: {
    dateChecks,
    numberChecks,
    conferenceSupersessionEvidence:
      /Pre-Bid Conference changed from[\s\S]*March 31[\s\S]*to[\s\S]*April 5/i.test(portalHtml),
    priceWorkbookReplacementEvidence: /Update to Attachment B/i.test(portalHtml),
    promptInjectionSourceHits: promptInjectionHits,
  },
  candidatePopulation: {
    analysisRunId: population.analysisRunId,
    populationHash: population.verificationPlan.populationHash,
    extractedCandidates: population.candidates.length,
    acceptedCandidates: population.quoteGate.acceptedCandidateIds.length,
    plannedCandidates: population.verificationPlan.candidateCount,
    exactExpectedAnswerBindings: exactBindings,
    expectedAnswerCount: expectedArtifact.expected.length,
    bindings: candidateBindings,
    failureTraceArtifact: FAILURE_TRACE_RELATIVE,
  },
  budget: {
    ledgers,
    ceilings: { phase3Usd: PHASE3_CEILING_USD, phase4Usd: PHASE4_CEILING_USD },
    currentHeadroom,
    pilotCandidateCount: pilotAnswers.length,
    pilotMaximumUsd,
    pilotReserveCandidates,
    fullEvaluationMaximumUsd: round(population.verificationPlan.plannedMaximumUsd),
    projectedWithPilot: {
      phase3Usd: round(ledgers.phase3Usd + pilotMaximumUsd),
      phase4Usd: round(ledgers.phase4Usd + pilotMaximumUsd),
      publicEvaluationUsd: round(ledgers.publicEvaluationUsd + pilotMaximumUsd),
      cumulativeApiUsd: round(ledgers.cumulativeApiUsd + pilotMaximumUsd),
    },
    projectedWithFullEvaluation: {
      phase3Usd: round(ledgers.phase3Usd + population.verificationPlan.plannedMaximumUsd),
      phase4Usd: round(ledgers.phase4Usd + population.verificationPlan.plannedMaximumUsd),
      publicEvaluationUsd: round(
        ledgers.publicEvaluationUsd + population.verificationPlan.plannedMaximumUsd,
      ),
      cumulativeApiUsd: round(
        ledgers.cumulativeApiUsd + population.verificationPlan.plannedMaximumUsd,
      ),
    },
  },
  workspaceAndRls: {
    projectRef,
    dedicatedFac115WorkspaceProvisioned: false,
    status: 'repository_integration_gate_required_before_pilot',
  },
  readiness: {
    sourceReady: blockers.every(
      (blocker) =>
        ![
          'source_hash_or_size_mismatch',
          'source_set_extra_or_missing',
          'rendition_hash_or_size_mismatch',
          'rendition_set_extra_or_missing',
          'official_attachment_binding_missing',
          'citation_validation_failed',
          'spreadsheet_native_provenance_failed',
        ].includes(blocker),
    ),
    pilotReady: blockers.length === 0,
    fullEvaluationReady: false,
    blockers,
  },
};

await mkdir(ARTIFACTS, { recursive: true });
await writeFile(EXPECTED_PATH, `${JSON.stringify(expectedArtifact, null, 2)}\n`);
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  FAILURE_TRACE_PATH,
  `${JSON.stringify(
    {
      version: 'massachusetts-fac115-candidate-mapping-failures-v1',
      generatedAt: report.generatedAt,
      providerCalls: 0,
      expectedAnswerHash: expectedHash,
      populationHash: population.verificationPlan.populationHash,
      failedBindings: candidateFailureTraces.length,
      traces: candidateFailureTraces,
    },
    null,
    2,
  )}\n`,
);

console.info(
  JSON.stringify(
    {
      stage: 'phase9_fac115_stage0_complete',
      providerCalls: 0,
      expectedAnswerHash: expectedHash,
      sourceReady: report.readiness.sourceReady,
      pilotReady: report.readiness.pilotReady,
      exactExpectedAnswerBindings: exactBindings,
      expectedAnswerCount: expectedArtifact.expected.length,
      pilotMaximumUsd,
      fullEvaluationMaximumUsd: report.budget.fullEvaluationMaximumUsd,
      ledgers,
      blockers,
      expectedArtifact: EXPECTED_PATH,
      reportArtifact: REPORT_PATH,
      failureTraceArtifact: FAILURE_TRACE_PATH,
    },
    null,
    2,
  ),
);

if (process.argv.includes('--strict') && !report.readiness.pilotReady) process.exitCode = 1;
