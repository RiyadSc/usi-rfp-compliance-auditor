import Link from 'next/link';
import { EmptyStateArt } from '@/components/brand';
import { IconAlert, IconChevronLeft, IconChevronRight, IconExternal } from '@/components/icons';

type Page = {
  pageNumber: number;
  extractionStatus: string;
  text: string;
  warnings: string[];
};

type Props = {
  workspaceId: string;
  documentId: string;
  pages: Page[];
  currentPage: number;
  signedPdfUrl: string | null;
  sourceFormat: string;
};

export function PageViewer({
  workspaceId,
  documentId,
  pages,
  currentPage,
  signedPdfUrl,
  sourceFormat,
}: Props) {
  const page = pages.find((p) => p.pageNumber === currentPage) ?? pages[0];
  if (!page) return null;

  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < pages.length ? currentPage + 1 : null;
  const base = `/w/${workspaceId}/documents/${documentId}`;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section
        aria-labelledby="pdf-heading"
        className="surface-card flex min-w-0 flex-col overflow-hidden"
      >
        <div className="border-b border-line-subtle px-5 py-4">
          <h2 id="pdf-heading" className="section-title">
            {sourceFormat === 'pdf' ? 'Original page view' : 'Original source file'}
          </h2>
        </div>
        <div className="p-4 sm:p-5">
          {signedPdfUrl && sourceFormat === 'pdf' ? (
            <div className="paper-surface p-2">
              <iframe
                title={`PDF page ${page.pageNumber}`}
                src={`${signedPdfUrl}#page=${page.pageNumber}`}
                className="h-[70vh] w-full rounded-xs border border-line-onlight bg-paper-100"
              />
            </div>
          ) : signedPdfUrl ? (
            <div className="surface-inset space-y-3 p-4 text-sm text-ink-soft">
              <p>
                This format does not have dependable PDF-style page coordinates. Evidence is
                anchored to its native sheet, cell, paragraph, line, or package path.
              </p>
              <a className="action-link inline-flex items-center gap-1.5" href={signedPdfUrl}>
                Open original {sourceFormat.toUpperCase()} source
                <IconExternal size={15} />
              </a>
            </div>
          ) : (
            <p className="surface-inset p-4 text-sm text-ink-muted">
              Signed source preview unavailable.
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby="text-heading"
        className="surface-card flex min-w-0 flex-col overflow-hidden"
      >
        <div className="border-b border-line-subtle px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <h2 id="text-heading" className="section-title">
              Extracted text —{' '}
              <span className="mono font-normal text-ink-soft">
                page {page.pageNumber} of {pages.length}
              </span>
            </h2>
            <nav
              aria-label="Page navigation"
              className="flex shrink-0 items-center gap-1.5 rounded-sm border border-line-subtle bg-canvas-950/50 p-1"
            >
              {prev ? (
                <Link className="secondary-action btn-sm" href={`${base}?page=${prev}`}>
                  <IconChevronLeft size={14} />
                  Previous
                </Link>
              ) : (
                <span className="secondary-action btn-sm cursor-not-allowed border-line-subtle bg-transparent text-ink-faint">
                  <IconChevronLeft size={14} />
                  Previous
                </span>
              )}
              {next ? (
                <Link className="secondary-action btn-sm" href={`${base}?page=${next}`}>
                  Next
                  <IconChevronRight size={14} />
                </Link>
              ) : (
                <span className="secondary-action btn-sm cursor-not-allowed border-line-subtle bg-transparent text-ink-faint">
                  Next
                  <IconChevronRight size={14} />
                </span>
              )}
            </nav>
          </div>

          <p className="text-metadata mt-3">
            Extraction status:{' '}
            <span className="font-medium text-ink-soft">{page.extractionStatus}</span>
          </p>
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          {page.warnings.length > 0 ? (
            <div className="notice notice-warning rail-warning flex gap-3">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-warning-400">
                <IconAlert size={15} />
              </span>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {page.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {['empty', 'error', 'uncertain', 'failed'].includes(page.extractionStatus) ||
          page.text.trim().length === 0 ? (
            <div className="empty-state">
              <EmptyStateArt />
              <p className="empty-state-body">
                No dependable native text is available for this unit. Selective OCR or human review
                is required; no source conclusion is inferred from missing text.
              </p>
            </div>
          ) : (
            <pre className="paper-surface max-h-[60vh] overflow-auto whitespace-pre-wrap p-5 text-[0.8125rem] leading-relaxed text-paper-ink sm:p-6">
              {page.text}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}
