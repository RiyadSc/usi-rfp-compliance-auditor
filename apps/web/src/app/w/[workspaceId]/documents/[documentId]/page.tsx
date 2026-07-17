import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { DeleteDocumentButton } from './delete-button';
import { PageViewer } from './page-viewer';
import { ParseStatusPoller } from './parse-status-poller';

const uuidSchema = z.string().uuid();

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; documentId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { workspaceId, documentId } = await params;
  const { page: pageParam } = await searchParams;
  if (!uuidSchema.safeParse(workspaceId).success || !uuidSchema.safeParse(documentId).success) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();

  const { data: document } = await supabase
    .from('documents')
    .select(
      'id, normalized_filename, document_type, status, page_count, created_at, warnings, error_category, parser_name, parser_version, object_key, mime_type',
    )
    .eq('id', documentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!document) notFound();

  const { data: pages } = await supabase
    .from('document_pages')
    .select('id, page_number, extraction_status, text, warnings, parser_name, parser_version')
    .eq('document_id', documentId)
    .eq('workspace_id', workspaceId)
    .order('page_number', { ascending: true });

  const currentPage = Math.max(1, Number(pageParam) || 1);
  const page = pages?.find((p) => p.page_number === currentPage) ?? pages?.[0] ?? null;

  // Signed URL for original PDF (short-lived). Membership already verified via RLS.
  let signedPdfUrl: string | null = null;
  if (document.status !== 'deleted') {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.storage
      .from('workspace-documents')
      .createSignedUrl(document.object_key, 120);
    signedPdfUrl = data?.signedUrl ?? null;
  }

  const processing =
    document.status === 'uploaded' ||
    document.status === 'validating' ||
    document.status === 'validated' ||
    document.status === 'parsing';

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href={`/w/${workspaceId}/documents`} className="text-blue-700 hover:underline">
          ← Documents
        </Link>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1">{document.normalized_filename}</h1>
          <p className="text-sm text-slate-600">
            {document.document_type} · status{' '}
            <span className="font-medium capitalize">{document.status}</span>
            {document.page_count != null ? ` · ${document.page_count} pages` : ''}
            {document.parser_name ? ` · ${document.parser_name}@${document.parser_version}` : ''}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Uploaded {new Date(document.created_at).toLocaleString()}
          </p>
        </div>
        <DeleteDocumentButton workspaceId={workspaceId} documentId={documentId} />
      </div>

      {processing ? <ParseStatusPoller /> : null}

      {document.status === 'failed' || document.status === 'rejected' ? (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          Parsing failed
          {document.error_category ? ` (${document.error_category})` : ''}. Review the file and
          re-upload if needed.
        </p>
      ) : null}

      {Array.isArray(document.warnings) && document.warnings.length > 0 ? (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium mb-1">Parser warnings</p>
          <ul className="list-disc pl-5">
            {(document.warnings as string[]).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {document.status === 'parsed' && page ? (
        <PageViewer
          workspaceId={workspaceId}
          documentId={documentId}
          pages={(pages ?? []).map((p) => ({
            pageNumber: p.page_number,
            extractionStatus: p.extraction_status,
            text: p.text,
            warnings: (p.warnings as string[]) ?? [],
          }))}
          currentPage={page.page_number}
          signedPdfUrl={signedPdfUrl}
        />
      ) : document.status === 'parsed' ? (
        <p className="text-sm text-slate-600">No page records available.</p>
      ) : processing ? (
        <p className="text-sm text-slate-600">Waiting for asynchronous parsing…</p>
      ) : null}
    </main>
  );
}
