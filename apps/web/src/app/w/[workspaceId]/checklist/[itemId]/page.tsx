import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { StatusBadge, StatusAxis } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { businessLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ChecklistItemControls } from '../item-controls';

const uuid = z.string().uuid();
const label = businessLabel;

function Field({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{name}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

export default async function ChecklistItemPage({
  params,
}: {
  params: Promise<{ workspaceId: string; itemId: string }>;
}) {
  const { workspaceId, itemId } = await params;
  if (!uuid.safeParse(workspaceId).success || !uuid.safeParse(itemId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const { data: item } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', itemId)
    .maybeSingle();
  if (!item) notFound();
  const [
    { data: sources },
    { data: blockers },
    { data: artifacts },
    { data: artifactLinks },
    { data: relationships },
    { data: waivers },
    { data: exceptions },
    { data: audit },
    { data: members },
    { data: documents },
  ] = await Promise.all([
    supabase
      .from('checklist_item_sources')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('checklist_item_id', itemId)
      .order('page_number'),
    supabase
      .from('checklist_blockers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('checklist_item_id', itemId)
      .order('created_at'),
    supabase
      .from('checklist_required_artifacts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('checklist_item_id', itemId),
    supabase
      .from('checklist_artifact_links')
      .select('id,document_id,state')
      .eq('workspace_id', workspaceId)
      .eq('checklist_item_id', itemId)
      .eq('state', 'linked'),
    supabase
      .from('checklist_relationships')
      .select('*')
      .eq('workspace_id', workspaceId)
      .or(`source_item_id.eq.${itemId},target_item_id.eq.${itemId}`),
    supabase
      .from('checklist_waivers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('checklist_item_id', itemId)
      .order('created_at', { ascending: false }),
    supabase
      .from('checklist_exception_notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('checklist_item_id', itemId)
      .order('created_at', { ascending: false }),
    supabase
      .from('audit_events')
      .select('id,event_type,actor_type,actor_id,payload,created_at')
      .eq('workspace_id', workspaceId)
      .eq('entity_id', itemId)
      .order('created_at', { ascending: false }),
    supabase.from('workspace_members').select('user_id,role').eq('workspace_id', workspaceId),
    supabase
      .from('documents')
      .select('id,normalized_filename')
      .eq('workspace_id', workspaceId)
      .eq('status', 'parsed')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);
  const documentNames = new Map(
    (documents ?? []).map((document) => [document.id, document.normalized_filename]),
  );
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="checklist"
        compact
      />
      <Link className="action-link text-sm" href={`/w/${workspaceId}/checklist`}>
        ← Submission plan
      </Link>
      <header className="mt-4">
        <p className="section-kicker">Submission task</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{item.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge value={item.workflow_status} />
          <StatusBadge
            value={item.artifact_state}
            label={`Artifact: ${label(item.artifact_state)}`}
          />
          <StatusBadge value={item.source_human_review_status} />
        </div>
      </header>
      <p className="my-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Completing this task records workflow progress only. It does not change the RFP evidence or
        indicate final approval.
      </p>

      <section className="surface-card mb-6 p-5" aria-labelledby="action-summary">
        <p className="section-kicker">What needs to happen</p>
        <h2 id="action-summary" className="mt-2 text-xl font-semibold">
          {item.obligation}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusAxis
            label="Task status"
            value={item.workflow_status}
            help="The team's progress on this action."
          />
          <StatusAxis
            label="RFP evidence"
            value={item.source_support_status}
            help="Whether the source documents support the requirement."
          />
          <StatusAxis
            label="Current version"
            value={item.precedence_status}
            help="Whether the requirement remains active after addenda."
          />
          <StatusAxis
            label="Company evidence"
            value={item.proof_requirement}
            help="What internal or external proof is still needed."
          />
        </div>
        <p className="mt-4 text-sm text-slate-600">
          <strong>Due:</strong>{' '}
          {item.due_at
            ? `${formatDate(item.due_at)} · ${item.due_timezone ?? 'timezone not stated'}`
            : 'No deterministic deadline identified'}
        </p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <section className="surface-card p-4">
            <h2 className="font-semibold">Why this task exists</h2>
            <p className="mt-2 text-sm text-slate-700">
              It was generated from an evidence-linked RFP requirement.
            </p>
            <dl className="analyst-only mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Field name="Category" value={label(item.category)} />
              <Field
                name="Eligibility"
                value={`${label(item.eligibility_class)} — ${label(item.eligibility_reason)}`}
              />
              <Field name="Source support" value={label(item.source_support_status)} />
              <Field name="Precedence" value={label(item.precedence_status)} />
              <Field name="Proof requirement" value={label(item.proof_requirement)} />
              <Field name="Workflow" value={label(item.workflow_status)} />
              <Field name="Artifact state" value={label(item.artifact_state)} />
              <Field name="Relationship role" value={label(item.relationship_role)} />
              <Field
                name="Due"
                value={
                  item.due_at
                    ? `${new Date(item.due_at).toLocaleString()} (${item.due_timezone ?? 'timezone not stated'})`
                    : 'Not deterministically identified'
                }
              />
              <Field name="Generation" value={item.generation_version} />
            </dl>
            <Link
              className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline"
              href={`/w/${workspaceId}/requirements/${item.candidate_id}`}
            >
              Open linked Phase 4 requirement →
            </Link>
          </section>
          <section className="surface-card p-4">
            <h2 className="font-semibold">Exact source evidence</h2>
            {sources?.length ? (
              <ul className="mt-3 space-y-3">
                {sources.map((source) => (
                  <li key={source.id} className="rounded border border-slate-200 p-3">
                    <blockquote className="border-l-2 border-blue-500 pl-3 text-sm">
                      {source.quote_exact}
                    </blockquote>
                    <p className="mt-2 text-xs text-slate-600">
                      {source.match_type} · page {source.page_number} · source{' '}
                      {source.source_version}
                    </p>
                    <Link
                      className="mt-2 inline-block text-sm text-blue-700 hover:underline"
                      href={`/w/${workspaceId}/documents/${source.document_id}?page=${source.page_number}`}
                    >
                      Open original page {source.page_number} →
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                No exact Phase 4 evidence was eligible for this record. It remains excluded or
                review-needed.
              </p>
            )}
          </section>
          <section className="surface-card p-4">
            <h2 className="font-semibold">Blockers</h2>
            {blockers?.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {blockers.map((blocker) => (
                  <li key={blocker.id} className="rounded border border-slate-200 p-3">
                    <strong>
                      {label(blocker.severity)} · {label(blocker.blocker_type)}
                    </strong>
                    <p>{blocker.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {label(blocker.status)} · {blocker.engine_version}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No blocker records.</p>
            )}
          </section>
          <section className="surface-card p-4">
            <h2 className="font-semibold">Relationships</h2>
            {relationships?.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {relationships.map((relationship) => (
                  <li key={relationship.id}>
                    {label(relationship.relationship_type)} ·{' '}
                    {label(relationship.human_review_status)} · records remain separate
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                No linked parent/child or duplicate proposal.
              </p>
            )}
          </section>
          <details className="surface-card analyst-only p-4">
            <summary className="cursor-pointer font-semibold">Decision and audit history</summary>
            <h3 className="mt-3 text-sm font-medium">Waivers</h3>
            {waivers?.length ? (
              <ol className="mt-2 space-y-2 text-sm">
                {waivers.map((waiver) => (
                  <li key={waiver.id}>
                    {label(waiver.status)} · {label(waiver.designation)} · {waiver.reason} ·{' '}
                    <time dateTime={waiver.created_at}>
                      {new Date(waiver.created_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-600">No waiver records.</p>
            )}
            <h3 className="mt-4 text-sm font-medium">Exception notes</h3>
            {exceptions?.length ? (
              <ol className="mt-2 space-y-2 text-sm">
                {exceptions.map((note) => (
                  <li key={note.id}>
                    {note.explanation} ·{' '}
                    <time dateTime={note.created_at}>
                      {new Date(note.created_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-600">No exception notes.</p>
            )}
            <h3 className="mt-4 text-sm font-medium">Audit events</h3>
            {audit?.length ? (
              <ol className="mt-2 space-y-1 text-sm">
                {audit.map((event) => (
                  <li key={event.id}>
                    {label(event.event_type)} ·{' '}
                    <time dateTime={event.created_at}>
                      {new Date(event.created_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-600">No item audit events.</p>
            )}
          </details>
        </div>
        <aside className="surface-card h-fit p-4 lg:sticky lg:top-4">
          <h2 className="mb-1 font-semibold">Update this task</h2>
          <p className="mb-4 text-sm text-slate-600">
            Assign ownership, update progress, or attach supporting documents.
          </p>
          <ChecklistItemControls
            workspaceId={workspaceId}
            itemId={itemId}
            ownerId={item.owner_id}
            reviewerId={item.reviewer_id}
            workflowStatus={item.workflow_status}
            members={members ?? []}
            requiredArtifactId={artifacts?.[0]?.id ?? null}
            documents={documents ?? []}
            blockers={(blockers ?? []).map((blocker) => ({
              id: blocker.id,
              blocker_type: blocker.blocker_type,
              status: blocker.status,
            }))}
            pendingWaivers={(waivers ?? [])
              .filter((waiver) => waiver.status === 'requested')
              .map((waiver) => ({ id: waiver.id, reason: waiver.reason }))}
            activeArtifactLinks={(artifactLinks ?? []).map((link) => ({
              id: link.id,
              documentName: documentNames.get(link.document_id) ?? link.document_id,
            }))}
          />
        </aside>
      </div>
    </main>
  );
}
