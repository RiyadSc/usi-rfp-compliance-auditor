import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { formatDate } from '@/lib/presentation';
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
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="proposal-audit"
      />
      <div className="mb-6">
        <p className="section-kicker">Stage 4</p>
        <h1
          aria-label="Proposal draft audit"
          className="mt-1 text-3xl font-semibold tracking-tight"
        >
          Draft review
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Compare the proposal against the RFP-backed submission plan and focus the team on material
          issues before final review.
        </p>
      </div>
      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link href={`/w/${workspaceId}/documents`} className="text-blue-700 hover:underline">
          Upload a new proposal revision
        </Link>
        <Link href={`/w/${workspaceId}/checklist`} className="text-blue-700 hover:underline">
          Open the submission plan
        </Link>
      </div>
      <details className="surface-card" open={!auditRuns?.length}>
        <summary className="cursor-pointer list-none px-4 py-4 font-semibold">
          Start a review for a new proposal revision
          <span className="ml-2 text-sm font-normal text-slate-500">
            Only needed when the proposal changes
          </span>
        </summary>
        <div className="border-t border-slate-200 p-4">
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
        </div>
      </details>
      <section className="mt-8">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Completed draft reviews</h2>
          <p className="text-sm text-slate-600">
            Open an existing result; run a new review only after uploading a new revision.
          </p>
        </div>
        {auditRuns?.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {auditRuns.map((run) => (
              <li key={run.id} className="surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/w/${workspaceId}/proposal-audit/${run.id}`}
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    {String(
                      (
                        run.proposal_drafts as unknown as {
                          documents: { normalized_filename: string };
                        }
                      ).documents.normalized_filename,
                    )}
                  </Link>
                  <StatusBadge value={run.status} />
                </div>
                <p className="mt-3 text-2xl font-semibold">{run.finding_count}</p>
                <p className="text-sm text-slate-600">
                  issue{run.finding_count === 1 ? '' : 's'} found · {run.claim_count} proposal
                  claims checked
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Completed {formatDate(run.created_at)} · Human decisions remain separate
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            No draft reviews yet. Upload a parsed proposal PDF, then start the first review above.
          </p>
        )}
      </section>
    </main>
  );
}
