import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { StatusBadge } from '@/components/status-badge';
import { EmptyStateArt } from '@/components/brand';
import { IconDocument, IconInfo } from '@/components/icons';
import { businessLabel, formatDate } from '@/lib/presentation';
import { UploadForm } from './upload-form';
import { DocumentDownloadButton } from './download-button';

const uuidSchema = z.string().uuid();

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!uuidSchema.safeParse(workspaceId).success) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();

  const { data: documents } = await supabase
    .from('documents')
    .select('id, normalized_filename, document_type, status, page_count, created_at, warnings')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  const env = serverEnv();

  const groups = [
    {
      key: 'primary_rfp',
      title: 'Main RFP',
      description: 'The authoritative solicitation and procurement instructions.',
    },
    {
      key: 'addendum',
      title: 'Addenda and amendments',
      description: 'Changes that may replace dates, values, forms, or instructions.',
    },
    {
      key: 'proposal_draft',
      title: 'Proposal drafts',
      description: 'Your response documents used for draft review.',
    },
    {
      key: 'other',
      title: 'Forms and supporting files',
      description: 'RFP attachments, forms, and other workspace documents.',
    },
  ];

  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="documents"
      />
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Opportunity source library</p>
          <h1 aria-label="Documents" className="page-title mt-1.5">
            Documents
          </h1>
          <p className="page-lede mt-3">
            Keep the main RFP, addenda, forms, and proposal drafts clearly separated. Processing
            status does not imply that a document has been reviewed by your team.
          </p>
        </div>
      </div>

      <details className="disclosure mb-8" open={!documents?.length}>
        <summary>
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink">Upload a document</span>
            <span className="text-metadata">PDF, Office, HTML, text, images, or ZIP</span>
          </span>
        </summary>
        <div className="disclosure-body">
          <ol className="mb-6 grid gap-3 text-sm sm:grid-cols-3" aria-label="Document upload steps">
            <li className="surface-panel p-4">
              <strong className="text-[0.8125rem] font-semibold text-ink">
                1. Choose its purpose
              </strong>
              <span className="mt-1.5 block text-ink-soft">
                Main RFP, addendum, attachment, form, or proposal draft.
              </span>
            </li>
            <li className="surface-panel p-4">
              <strong className="text-[0.8125rem] font-semibold text-ink">
                2. Select the file
              </strong>
              <span className="mt-1.5 block text-ink-soft">
                The file stays private and workspace-scoped.
              </span>
            </li>
            <li className="surface-panel p-4">
              <strong className="text-[0.8125rem] font-semibold text-ink">
                3. Review processing
              </strong>
              <span className="mt-1.5 block text-ink-soft">
                Resolve reading warnings before trusting source text.
              </span>
            </li>
          </ol>
          <UploadForm
            workspaceId={workspaceId}
            supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL}
            supabaseAnonKey={env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
            maxUploadBytes={env.MAX_UPLOAD_BYTES}
          />
        </div>
      </details>

      {documents?.length ? (
        <div className="space-y-10">
          {groups.map((group) => {
            const rows = documents.filter((document) =>
              group.key === 'other'
                ? !['primary_rfp', 'addendum', 'proposal_draft'].includes(document.document_type)
                : document.document_type === group.key,
            );
            if (!rows.length) return null;
            return (
              <section key={group.key} aria-labelledby={`documents-${group.key}`}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                  <div>
                    <h2 id={`documents-${group.key}`} className="section-title">
                      {group.title}
                    </h2>
                    <p className="section-lede">{group.description}</p>
                  </div>
                  <span className="text-metadata tabular">
                    {rows.length} file{rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="surface-card divide-y divide-line-subtle overflow-hidden">
                  {rows.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-surface-800/40 sm:px-5"
                    >
                      <Link
                        href={`/w/${workspaceId}/documents/${d.id}`}
                        className="group flex min-w-0 flex-1 items-start gap-3"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-line-subtle bg-surface-800 text-teal-300"
                        >
                          <IconDocument size={17} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink group-hover:text-mist-100">
                            {d.normalized_filename}
                          </span>
                          <span className="text-metadata mt-0.5 block">
                            {businessLabel(d.document_type)}
                            {d.page_count != null ? ` · ${d.page_count} pages` : ''}
                            {d.created_at ? ` · added ${formatDate(d.created_at)}` : ''}
                          </span>
                        </span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-3 text-right">
                        <DocumentDownloadButton workspaceId={workspaceId} documentId={d.id} />
                        <span>
                          <StatusBadge value={d.status} label={businessLabel(d.status)} />
                          <code className="analyst-only mono mt-1 block text-[10px] text-ink-faint">
                            {d.status}
                          </code>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <aside className="notice notice-info flex gap-3">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-info-400">
              <IconInfo size={16} />
            </span>
            <span>
              <strong className="font-semibold text-ink">Addendum review:</strong> open each
              amendment to confirm what changed. The requirements stage keeps superseded and current
              instructions separate.
              <Link
                href={`/w/${workspaceId}/requirements?precedence=superseded`}
                className="action-link ml-2 inline-flex items-center gap-1.5"
              >
                Review changed requirements →
              </Link>
            </span>
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <EmptyStateArt>
            <IconDocument size={20} />
          </EmptyStateArt>
          <p className="empty-state-body">
            No RFP files yet. Upload the main solicitation to begin.
          </p>
        </div>
      )}
    </main>
  );
}
