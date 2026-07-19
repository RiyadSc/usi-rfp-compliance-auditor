import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { StatusBadge } from '@/components/status-badge';
import { businessLabel, formatDate } from '@/lib/presentation';
import { UploadForm } from './upload-form';

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
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="documents"
      />
      <div className="mb-6">
        <p className="section-kicker">Stage 1</p>
        <h1 aria-label="Documents" className="mt-1 text-3xl font-semibold tracking-tight">
          RFP files
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Keep the main RFP, addenda, forms, and proposal drafts clearly separated. Processing
          status does not imply that a document has been reviewed by your team.
        </p>
      </div>

      <details className="surface-card mb-7" open={!documents?.length}>
        <summary className="cursor-pointer list-none px-4 py-4 font-semibold">
          Upload a document
          <span className="ml-2 text-sm font-normal text-slate-500">PDF files only</span>
        </summary>
        <div className="border-t border-slate-200 p-4">
          <UploadForm
            workspaceId={workspaceId}
            supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL}
            supabaseAnonKey={env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
            maxUploadBytes={env.MAX_UPLOAD_BYTES}
          />
        </div>
      </details>

      {documents?.length ? (
        <div className="space-y-7">
          {groups.map((group) => {
            const rows = documents.filter((document) =>
              group.key === 'other'
                ? !['primary_rfp', 'addendum', 'proposal_draft'].includes(document.document_type)
                : document.document_type === group.key,
            );
            if (!rows.length) return null;
            return (
              <section key={group.key} aria-labelledby={`documents-${group.key}`}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 id={`documents-${group.key}`} className="text-lg font-semibold">
                      {group.title}
                    </h2>
                    <p className="text-sm text-slate-600">{group.description}</p>
                  </div>
                  <span className="text-sm text-slate-500">
                    {rows.length} file{rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="surface-card divide-y divide-slate-200">
                  {rows.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/w/${workspaceId}/documents/${d.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50"
                      >
                        <span>
                          <span className="block font-medium">{d.normalized_filename}</span>
                          <span className="block text-sm text-slate-600">
                            {businessLabel(d.document_type)}
                            {d.page_count != null ? ` · ${d.page_count} pages` : ''}
                            {d.created_at ? ` · added ${formatDate(d.created_at)}` : ''}
                          </span>
                        </span>
                        <StatusBadge
                          value={d.status}
                          label={`${businessLabel(d.status)} (${d.status})`}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <aside className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <strong>Addendum review:</strong> open each amendment to confirm what changed. The
            requirements stage keeps superseded and current instructions separate.
            <Link
              href={`/w/${workspaceId}/requirements?precedence=superseded`}
              className="ml-2 font-semibold underline"
            >
              Review changed requirements →
            </Link>
          </aside>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
          No RFP files yet. Upload the main solicitation to begin.
        </p>
      )}
    </main>
  );
}
