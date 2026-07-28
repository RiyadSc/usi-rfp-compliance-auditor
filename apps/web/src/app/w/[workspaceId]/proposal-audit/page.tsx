import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { EmptyStateArt } from '@/components/brand';
import { IconChecklist, IconUpload } from '@/components/icons';
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
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="proposal-audit"
      />
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Does the draft answer the RFP?</p>
          <h1 aria-label="Proposal draft audit" className="page-title mt-1.5">
            Proposal Review
          </h1>
          <p className="page-lede mt-2.5">
            Open the latest review to see conflicts, gaps, and claims that still need company proof
            — beside the original RFP evidence.
          </p>
        </div>
        <div className="page-actions">
          <Link href={`/w/${workspaceId}/documents`} className="secondary-action btn-sm">
            <IconUpload size={15} />
            Upload a new proposal revision
          </Link>
          <Link href={`/w/${workspaceId}/checklist`} className="secondary-action btn-sm">
            <IconChecklist size={15} />
            Open the submission plan
          </Link>
        </div>
      </div>
      <details className="disclosure" open={!auditRuns?.length}>
        <summary className="list-none">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold text-ink">
              Start a review for a new proposal revision
            </span>
            <span className="text-metadata">Only needed when the proposal changes</span>
          </span>
        </summary>
        <div className="disclosure-body">
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
      <section className="mt-10" data-tour-target="proposal-audit">
        <div className="mb-4">
          <h2 className="section-title">Completed draft reviews</h2>
          <p className="section-lede">
            Open an existing result; run a new review only after uploading a new revision.
          </p>
        </div>
        {auditRuns?.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {auditRuns.map((run) => (
              <li key={run.id} className="surface-card surface-card-interactive p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/w/${workspaceId}/proposal-audit/${run.id}`}
                    className="action-link text-[0.9375rem] leading-snug"
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
                <p className="metric-value mt-4">{run.finding_count}</p>
                <p className="metric-note">
                  issue{run.finding_count === 1 ? '' : 's'} found · {run.claim_count} proposal
                  claims checked
                </p>
                <p className="text-metadata mt-4 border-t border-line-subtle pt-3">
                  Completed {formatDate(run.created_at)} · Human decisions remain separate
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <EmptyStateArt />
            <p className="empty-state-body">
              No draft reviews yet. Upload a parsed proposal PDF, then start the first review above.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
