import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProposalAuditControls } from './audit-controls';

export default async function ProposalAuditPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!z.string().uuid().safeParse(workspaceId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const [{ data: documents }, { data: checklistRuns }, { data: auditRuns }, { data: drafts }] =
    await Promise.all([
      supabase
        .from('documents')
        .select('id,normalized_filename')
        .eq('workspace_id', workspaceId)
        .eq('document_type', 'proposal_draft')
        .eq('status', 'parsed')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('checklist_generation_runs')
        .select('id,created_at')
        .eq('workspace_id', workspaceId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
      supabase
        .from('proposal_audit_runs')
        .select(
          'id,status,section_count,claim_count,finding_count,created_at,proposal_drafts!inner(revision_number,documents!inner(normalized_filename))',
        )
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('proposal_drafts')
        .select('id,revision_number,documents!inner(normalized_filename)')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
    ]);
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href={`/w/${workspaceId}`} className="text-blue-700 hover:underline">
          ← {workspace.name}
        </Link>
      </nav>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Proposal draft audit</h1>
        <p className="mt-1 text-sm text-slate-600">
          Deterministic, evidence-linked audit. Machine findings remain pending until a human
          records a decision.
        </p>
      </div>
      <div className="mb-6 flex gap-4 text-sm">
        <Link href={`/w/${workspaceId}/documents`} className="text-blue-700 hover:underline">
          Upload proposal PDF
        </Link>
        <Link href={`/w/${workspaceId}/checklist`} className="text-blue-700 hover:underline">
          Open source checklist
        </Link>
      </div>
      <ProposalAuditControls
        workspaceId={workspaceId}
        documents={(documents ?? []).map((document) => ({
          id: document.id,
          name: document.normalized_filename,
        }))}
        checklistRuns={(checklistRuns ?? []).map((run) => ({
          id: run.id,
          createdAt: run.created_at,
        }))}
        priorDrafts={(drafts ?? []).map((draft) => ({
          id: draft.id,
          label: `${(draft.documents as unknown as { normalized_filename: string }).normalized_filename} · revision ${draft.revision_number}`,
        }))}
      />
      <section className="mt-8">
        <h2 className="mb-3 font-medium">Audit history</h2>
        {auditRuns?.length ? (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {auditRuns.map((run) => (
              <li key={run.id} className="p-4">
                <Link
                  href={`/w/${workspaceId}/proposal-audit/${run.id}`}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {String(
                    (
                      run.proposal_drafts as unknown as {
                        documents: { normalized_filename: string };
                      }
                    ).documents.normalized_filename,
                  )}
                </Link>
                <p className="text-sm text-slate-600">
                  {run.status} · {run.claim_count} claims · {run.finding_count} findings ·{' '}
                  {new Date(run.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No proposal audits yet.</p>
        )}
      </section>
    </main>
  );
}
