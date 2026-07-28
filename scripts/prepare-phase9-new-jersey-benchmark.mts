import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import {
  NEW_JERSEY_CRITICAL_BENCHMARK_CASES,
  NEW_JERSEY_CRITICAL_BENCHMARK_VERSION,
} from '../benchmarks/new-jersey-08-x-39231/critical-obligation-cases-v1';

for (const flag of [
  'PHASE3_LIVE_EVAL',
  'PHASE4_LIVE_EVAL',
  'PHASE4_LIVE_SMOKE',
  'PHASE9_LIVE_EVAL',
  'PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED',
])
  if (process.env[flag] === '1' || process.env[flag] === 'true')
    throw new Error(`phase9_nj_benchmark_preparation_refuses_live_flag:${flag}`);

type SourcePackage = {
  artifactVersion: string;
  source: {
    sourcePackageHash: string;
    documentSha256: string;
    machineFindingsRead: false;
    databaseTablesRead: string[];
  };
  document: { pageCount: number };
  pages: Array<{ pageNumber: number; text: string; textSha256: string }>;
};

const source = JSON.parse(
  await readFile('benchmarks/new-jersey-08-x-39231/source-pages-v1.json', 'utf8'),
) as SourcePackage;
if (
  source.artifactVersion !== 'new-jersey-08-x-39231-source-pages-v1' ||
  source.source.machineFindingsRead !== false ||
  source.source.databaseTablesRead.some(
    (table) => table !== 'documents' && table !== 'document_pages',
  ) ||
  source.pages.length !== 48
)
  throw new Error('phase9_nj_benchmark_source_boundary_invalid');

const pages = new Map(source.pages.map((page) => [page.pageNumber, page]));
const cases = NEW_JERSEY_CRITICAL_BENCHMARK_CASES.map((entry) => {
  const page = pages.get(entry.pageNumber);
  if (!page) throw new Error(`phase9_nj_benchmark_page_missing:${entry.id}`);
  const occurrenceCount = page.text.split(entry.exactQuote).length - 1;
  if (occurrenceCount !== 1)
    throw new Error(
      `phase9_nj_benchmark_quote_not_unique:${entry.id}:${entry.pageNumber}:${occurrenceCount}`,
    );
  return {
    ...entry,
    sourceDocumentSha256: source.source.documentSha256,
    sourcePage: entry.pageNumber,
    sourcePageTextSha256: page.textSha256,
    quoteMatch: 'exact' as const,
    humanSubjectMatterReview: 'pending' as const,
  };
});
const answerSetHash = createHash('sha256')
  .update(
    JSON.stringify({
      version: NEW_JERSEY_CRITICAL_BENCHMARK_VERSION,
      sourcePackageHash: source.source.sourcePackageHash,
      cases,
    }),
  )
  .digest('hex');
const artifact = {
  artifactVersion: NEW_JERSEY_CRITICAL_BENCHMARK_VERSION,
  status: 'draft_pending_independent_human_review',
  runtimeEligible: false,
  answerSetHash,
  source: {
    artifactVersion: source.artifactVersion,
    sourcePackageHash: source.source.sourcePackageHash,
    documentSha256: source.source.documentSha256,
    pagesReviewed: source.document.pageCount,
  },
  methodology: {
    authoringInput: 'immutable_source_pages_only',
    machineFindingsAvailableToAuthoringProcess: false,
    providerCalls: 0,
    providerSpendUsd: 0,
    categoriesRequired: [
      'deadlines',
      'forms',
      'signatures',
      'licensing',
      'insurance',
      'bond',
      'pricing',
      'staffing',
      'submission_instructions',
      'addenda',
      'disqualifying_conditions',
    ],
    citationRule: 'one unique exact quotation on the cited source page',
    reviewerMethod:
      'A human subject-matter reviewer must independently compare every draft case with the official source package, add objectively missing critical obligations, and sign off before scoring.',
  },
  limitations: [
    'This draft is benchmark preparation, not an application input.',
    'It is not a completeness, precision, or recall claim.',
    'The source package references external signatory and standard-terms documents that are not part of this one-document draft.',
    'No benchmark case is independently accepted until a qualified human reviewer records review.',
  ],
  cases,
};

await writeFile(
  'benchmarks/new-jersey-08-x-39231/critical-obligations-draft-v1.json',
  await format(JSON.stringify(artifact), { parser: 'json', printWidth: 100 }),
  'utf8',
);
console.info(
  JSON.stringify({
    artifactVersion: artifact.artifactVersion,
    cases: artifact.cases.length,
    exactCitations: artifact.cases.filter((entry) => entry.quoteMatch === 'exact').length,
    status: artifact.status,
    runtimeEligible: artifact.runtimeEligible,
    providerCalls: 0,
    providerSpendUsd: 0,
  }),
);
