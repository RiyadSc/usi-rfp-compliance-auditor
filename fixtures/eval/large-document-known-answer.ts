import { createHash } from 'node:crypto';
import { buildPhase8Pdf } from '../../scripts/lib/phase8-prepared-demo';

export const LARGE_DOCUMENT_FIXTURE_VERSION = 'large-document-known-answer-v1';
export const LARGE_DOCUMENT_PAGE_COUNT = 420;
export const LARGE_DOCUMENT_SCANNED_PAGES = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
] as const;
export const LARGE_DOCUMENT_TABLE_PAGES = [40, 50, 51, 80, 120, 160, 200, 240] as const;
export const LARGE_DOCUMENT_PAGES = Array.from(
  { length: LARGE_DOCUMENT_PAGE_COUNT },
  (_, index) => {
    const pageNumber = index + 1;
    let text = `Section ${Math.ceil(pageNumber / 20)}. Contextual procurement language for page ${pageNumber}.`;
    if (pageNumber === 12)
      text = 'Vendors shall submit mandatory Form A-1 with an authorized signature.';
    if (pageNumber === 40) text = 'TABLE: General Liability | Per occurrence | $2,000,000';
    if (pageNumber === 50) text = 'TABLE CONTINUED: Staffing Role | Minimum Count';
    if (pageNumber === 51) text = 'TABLE CONTINUED: Security Officer | 12 | Site Supervisor | 2';
    if (pageNumber === 80) text = 'TABLE: Automobile | Combined single limit | $1,000,000';
    if (pageNumber === 120) text = 'TABLE: Pricing Form P-1 | hourly rate | required';
    if (pageNumber === 160) text = 'TABLE: Response time | maximum | 15 minutes';
    if (pageNumber === 200) text = 'TABLE: Experience | minimum | 5 years';
    if (pageNumber === 240) text = 'TABLE: Small business participation | minimum | 10%';
    if (pageNumber === 390)
      text = 'Original deadline: proposals must be received August 1, 2027 at 2:00 PM ET.';
    if (pageNumber === 409)
      text = 'Addendum 1 is hereby issued and explicitly revises the submission deadline.';
    if (pageNumber === 410)
      text = 'Delete August 1, 2027 and replace it with August 15, 2027 at 2:00 PM ET.';
    if (pageNumber === 411)
      text = 'Addendum 1 changes General Liability per occurrence to $3,000,000.';
    return {
      pageNumber,
      text,
      scanned: (LARGE_DOCUMENT_SCANNED_PAGES as readonly number[]).includes(pageNumber),
    };
  },
);
export const LARGE_DOCUMENT_PDF = buildPhase8Pdf(LARGE_DOCUMENT_PAGES);
export const LARGE_DOCUMENT_SOURCE_HASH = createHash('sha256')
  .update(LARGE_DOCUMENT_PDF)
  .digest('hex');
export const LARGE_DOCUMENT_EXPECTED = {
  pageCount: 420,
  nativePages: 410,
  ocrRequiredPages: 10,
  tableCount: 8,
  splitTablePages: [50, 51],
  mandatoryForms: ['Form A-1'],
  activeDeadline: '2027-08-15T14:00:00-04:00',
  supersededDeadline: '2027-08-01T14:00:00-04:00',
  activeGeneralLiabilityPerOccurrence: 3_000_000,
  providerCalls: 0,
  providerSpendUsd: 0,
};
