import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href={`/w/${workspaceId}`} className="text-blue-700 hover:underline">
          ← {workspace.name}
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold mb-6">Documents</h1>

      <div className="mb-10">
        <UploadForm
          workspaceId={workspaceId}
          supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL}
          supabaseAnonKey={env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
        />
      </div>

      <section aria-labelledby="docs-heading">
        <h2 id="docs-heading" className="text-base font-medium mb-3">
          Uploaded documents
        </h2>
        {documents && documents.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {documents.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/w/${workspaceId}/documents/${d.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                >
                  <span>
                    <span className="block font-medium">{d.normalized_filename}</span>
                    <span className="block text-sm text-slate-600">
                      {d.document_type}
                      {d.page_count != null ? ` · ${d.page_count} pages` : ''}
                    </span>
                  </span>
                  <span className="text-sm capitalize text-slate-600">{d.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">
            No documents yet.
          </p>
        )}
      </section>
    </main>
  );
}
