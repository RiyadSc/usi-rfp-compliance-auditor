import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { DeleteDocumentButton } from './delete-button';
import { PageViewer } from './page-viewer';
import { ParseStatusPoller } from './parse-status-poller';
import { StartExtractionButton } from './start-extraction-button';
import { ProcessingPanel } from './processing-panel';
import { StructuredTableEvidence } from './structured-table-evidence';

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
      'id, normalized_filename, document_type, source_format, status, page_count, created_at, warnings, error_category, parser_name, parser_version, object_key, mime_type',
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

  const [{ data: normalized }, { data: jobs }] = await Promise.all([
    supabase
      .from('normalized_documents')
      .select('id,source_format,statistics,warnings,created_at')
      .eq('workspace_id', workspaceId)
      .eq('source_document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('large_document_jobs')
      .select('id,status,current_stage,progress_numerator,progress_denominator,created_at')
      .eq('workspace_id', workspaceId)
      .eq('source_document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  const job = jobs?.[0] ?? null;
  const [{ data: stages }, { data: failedUnits }, { data: costs }, { data: caches }] =
    await Promise.all([
      job
        ? supabase
            .from('processing_stage_runs')
            .select('id,stage,status,progress_numerator,progress_denominator')
            .eq('workspace_id', workspaceId)
            .eq('job_id', job.id)
            .order('created_at')
        : Promise.resolve({ data: [] }),
      job
        ? supabase
            .from('processing_work_units')
            .select('id,unit_type,unit_key,status,last_error_code')
            .eq('workspace_id', workspaceId)
            .eq('job_id', job.id)
            .in('status', ['failed_retryable', 'failed_terminal'])
        : Promise.resolve({ data: [] }),
      job
        ? supabase
            .from('analysis_cost_estimates')
            .select(
              'expected_low_usd,expected_high_usd,hard_maximum_usd,estimated_calls_low,estimated_calls_high,largest_cost_stage,execution_allowed,block_reason',
            )
            .eq('workspace_id', workspaceId)
            .eq('job_id', job.id)
            .order('created_at', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] }),
      supabase
        .from('analysis_cache_entries')
        .select('status,invalidated_at')
        .eq('workspace_id', workspaceId)
        .eq('source_document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

  const currentPage = Math.max(1, Number(pageParam) || 1);
  const page = pages?.find((p) => p.page_number === currentPage) ?? pages?.[0] ?? null;
  let structuredTables: Array<{
    id: string;
    title: string | null;
    caption: string | null;
    row_count: number;
    column_count: number;
    confidence: number;
    continuation_of_table_id: string | null;
    repeated_header: boolean;
    cells: Array<{
      id: string;
      row_index: number;
      column_index: number;
      row_span: number;
      column_span: number;
      raw_text: string;
      cell_role: string;
      provenance: Record<string, unknown>;
    }>;
  }> = [];
  let normalizedPageWarnings: string[] = [];
  let normalizedParserState: string | null = null;
  if (normalized && page) {
    const { data: normalizedPage } = await supabase
      .from('normalized_pages')
      .select('id,warnings,parser_state')
      .eq('workspace_id', workspaceId)
      .eq('normalized_document_id', normalized.id)
      .eq('physical_page_index', page.page_number - 1)
      .maybeSingle();
    if (normalizedPage) {
      normalizedPageWarnings = Array.isArray(normalizedPage.warnings)
        ? (normalizedPage.warnings as Array<{ message?: string } | string>).map((warning) =>
            typeof warning === 'string' ? warning : (warning.message ?? 'Parser warning'),
          )
        : [];
      normalizedParserState = normalizedPage.parser_state;
      const { data: tableRows } = await supabase
        .from('normalized_tables')
        .select(
          'id,title,caption,row_count,column_count,confidence,continuation_of_table_id,repeated_header',
        )
        .eq('workspace_id', workspaceId)
        .eq('normalized_page_id', normalizedPage.id)
        .order('created_at');
      if (tableRows?.length) {
        const tableIds = tableRows.map((table) => table.id);
        const { data: cellRows } = await supabase
          .from('normalized_table_cells')
          .select(
            'id,normalized_table_id,row_index,column_index,row_span,column_span,raw_text,cell_role,provenance',
          )
          .eq('workspace_id', workspaceId)
          .in('normalized_table_id', tableIds)
          .order('row_index')
          .order('column_index');
        structuredTables = tableRows.map((table) => ({
          ...table,
          confidence: Number(table.confidence),
          cells: (cellRows ?? []).filter((cell) => cell.normalized_table_id === table.id),
        }));
      }
    }
  }

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
        <div className="flex flex-col items-end gap-3">
          <DeleteDocumentButton workspaceId={workspaceId} documentId={documentId} />
          <StartExtractionButton
            workspaceId={workspaceId}
            documentId={documentId}
            canStart={document.status === 'parsed'}
          />
        </div>
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

      <ProcessingPanel
        workspaceId={workspaceId}
        documentId={documentId}
        inspection={
          normalized
            ? {
                sourceFormat: normalized.source_format,
                pages: Number((normalized.statistics as Record<string, unknown>).pageCount ?? 0),
                nativePages: Number(
                  (normalized.statistics as Record<string, unknown>).nativeTextPages ?? 0,
                ),
                ocrPages: Number((normalized.statistics as Record<string, unknown>).ocrPages ?? 0),
                uncertainPages: Number(
                  (normalized.statistics as Record<string, unknown>).uncertainPages ?? 0,
                ),
                tables: Number((normalized.statistics as Record<string, unknown>).tableCount ?? 0),
                blocks: Number((normalized.statistics as Record<string, unknown>).blockCount ?? 0),
                warnings: Array.isArray(normalized.warnings)
                  ? (normalized.warnings as Array<{ message?: string }>).map(
                      (warning) => warning.message ?? 'Parser warning',
                    )
                  : [],
              }
            : null
        }
        job={
          job
            ? {
                id: job.id,
                status: job.status,
                currentStage: job.current_stage,
                progressNumerator: job.progress_numerator,
                progressDenominator: job.progress_denominator,
              }
            : null
        }
        stages={(stages ?? []).map((stage) => ({
          id: stage.id,
          stage: stage.stage,
          status: stage.status,
          progressNumerator: stage.progress_numerator,
          progressDenominator: stage.progress_denominator,
        }))}
        failedUnits={(failedUnits ?? []).map((unit) => ({
          id: unit.id,
          unitType: unit.unit_type,
          unitKey: unit.unit_key,
          status: unit.status,
          error: unit.last_error_code,
        }))}
        cost={
          costs?.[0]
            ? {
                low: Number(costs[0].expected_low_usd),
                high: Number(costs[0].expected_high_usd),
                maximum: Number(costs[0].hard_maximum_usd),
                callsLow: costs[0].estimated_calls_low,
                callsHigh: costs[0].estimated_calls_high,
                largestStage: costs[0].largest_cost_stage,
                allowed: costs[0].execution_allowed,
                blockReason: costs[0].block_reason,
              }
            : null
        }
        cacheDecision={
          caches?.[0]
            ? caches[0].invalidated_at
              ? 'miss_invalidated_dependency'
              : caches[0].status === 'completed'
                ? 'hit'
                : 'miss_incomplete'
            : null
        }
      />

      {document.status === 'parsed' && page ? (
        <PageViewer
          workspaceId={workspaceId}
          documentId={documentId}
          pages={(pages ?? []).map((p) => ({
            pageNumber: p.page_number,
            extractionStatus:
              p.page_number === page.page_number && normalizedParserState
                ? normalizedParserState
                : p.extraction_status,
            text: p.text,
            warnings:
              p.page_number === page.page_number
                ? [...((p.warnings as string[]) ?? []), ...normalizedPageWarnings]
                : ((p.warnings as string[]) ?? []),
          }))}
          currentPage={page.page_number}
          signedPdfUrl={signedPdfUrl}
          sourceFormat={document.source_format ?? normalized?.source_format ?? 'pdf'}
        />
      ) : document.status === 'parsed' ? (
        <p className="text-sm text-slate-600">No page records available.</p>
      ) : processing ? (
        <p className="text-sm text-slate-600">Waiting for asynchronous parsing…</p>
      ) : null}
      <StructuredTableEvidence tables={structuredTables} />
    </main>
  );
}
