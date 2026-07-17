import Link from 'next/link';

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
};

export function PageViewer({ workspaceId, documentId, pages, currentPage, signedPdfUrl }: Props) {
  const page = pages.find((p) => p.pageNumber === currentPage) ?? pages[0];
  if (!page) return null;

  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < pages.length ? currentPage + 1 : null;
  const base = `/w/${workspaceId}/documents/${documentId}`;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section
        aria-labelledby="pdf-heading"
        className="rounded border border-slate-200 bg-white p-3"
      >
        <h2 id="pdf-heading" className="text-base font-medium mb-2">
          Original page view
        </h2>
        {signedPdfUrl ? (
          <iframe
            title={`PDF page ${page.pageNumber}`}
            src={`${signedPdfUrl}#page=${page.pageNumber}`}
            className="h-[70vh] w-full rounded border border-slate-200"
          />
        ) : (
          <p className="text-sm text-slate-600">Signed preview unavailable.</p>
        )}
      </section>

      <section
        aria-labelledby="text-heading"
        className="rounded border border-slate-200 bg-white p-3"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="text-heading" className="text-base font-medium">
            Extracted text — page {page.pageNumber} of {pages.length}
          </h2>
          <nav aria-label="Page navigation" className="flex gap-2 text-sm">
            {prev ? (
              <Link className="text-blue-700 hover:underline" href={`${base}?page=${prev}`}>
                Previous
              </Link>
            ) : (
              <span className="text-slate-400">Previous</span>
            )}
            {next ? (
              <Link className="text-blue-700 hover:underline" href={`${base}?page=${next}`}>
                Next
              </Link>
            ) : (
              <span className="text-slate-400">Next</span>
            )}
          </nav>
        </div>

        <p className="mb-2 text-sm text-slate-600">
          Extraction status: <span className="font-medium">{page.extractionStatus}</span>
        </p>

        {page.warnings.length > 0 ? (
          <ul className="mb-3 list-disc pl-5 text-sm text-amber-900">
            {page.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        {page.extractionStatus === 'empty' || page.extractionStatus === 'error' ? (
          <p className="rounded border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600">
            No extractable text on this page. It may be blank or image-only. OCR is out of scope for
            this demo phase.
          </p>
        ) : (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-900">
            {page.text}
          </pre>
        )}
      </section>
    </div>
  );
}
