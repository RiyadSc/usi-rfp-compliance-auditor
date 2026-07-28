import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  IconAlert,
  IconBlocker,
  IconCalendar,
  IconInfo,
  IconLink,
  IconQuote,
  IconShield,
} from '@/components/icons';
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
      <dt className="text-micro">{name}</dt>
      <dd className="mt-1 break-words text-sm text-ink-soft">{value}</dd>
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
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="checklist"
        compact
      />
      <Link className="quiet-link text-sm font-medium" href={`/w/${workspaceId}/checklist`}>
        ← Submission plan
      </Link>
      <header className="mt-5">
        <p className="page-eyebrow">Submission task</p>
        <h1 className="page-title mt-2 max-w-4xl">{item.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge value={item.workflow_status} />
          <StatusBadge
            value={item.artifact_state}
            label={`Artifact: ${label(item.artifact_state)}`}
          />
          <StatusBadge value={item.source_human_review_status} />
        </div>
      </header>
      <p className="notice notice-warning my-6 flex items-start gap-2.5">
        <IconAlert size={16} className="mt-0.5 shrink-0 text-warning-400" />
        Completing this task records workflow progress only. It does not change the RFP evidence or
        indicate final approval.
      </p>

      <section className="surface-card mb-6 p-6" aria-labelledby="action-summary">
        <p className="section-kicker">What needs to happen</p>
        <h2 id="action-summary" className="section-title mt-2 max-w-3xl">
          {item.obligation}
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <p className="mt-5 flex items-center gap-2 text-sm text-ink-soft">
          <IconCalendar size={15} className="shrink-0 text-ink-muted" />
          <span className="tabular">
            <strong className="font-semibold text-ink">Due:</strong>{' '}
            {item.due_at
              ? `${formatDate(item.due_at)} · ${item.due_timezone ?? 'timezone not stated'}`
              : 'No deadline identified from the RFP'}
          </span>
        </p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <section className="surface-card p-5">
            <h2 className="section-title">Why this task exists</h2>
            <p className="mt-2 text-sm text-ink-soft">
              It was generated from an evidence-linked RFP requirement.
            </p>
            <dl className="analyst-only surface-panel mt-4 grid gap-4 p-4 sm:grid-cols-2">
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
                    : 'Not identified from the RFP text'
                }
              />
              <Field name="Generation" value={item.generation_version} />
            </dl>
            <Link
              className="action-link mt-5 inline-flex items-center gap-1.5 text-sm"
              href={`/w/${workspaceId}/requirements/${item.candidate_id}`}
            >
              Open linked requirement →
            </Link>
          </section>
          <section className="surface-card p-5">
            <h2 className="section-title flex items-center gap-2">
              <IconQuote size={17} className="shrink-0 text-teal-400" />
              Exact source evidence
            </h2>
            {sources?.length ? (
              <ul className="mt-4 space-y-3">
                {sources.map((source) => (
                  <li key={source.id} className="surface-panel p-4">
                    <blockquote className="evidence-quote">{source.quote_exact}</blockquote>
                    <p className="text-metadata tabular mt-3">
                      {source.match_type} · page {source.page_number} · source{' '}
                      {source.source_version}
                    </p>
                    <Link
                      className="action-link mt-3 inline-flex items-center gap-1.5 text-sm"
                      href={`/w/${workspaceId}/documents/${source.document_id}?page=${source.page_number}`}
                    >
                      Open original page {source.page_number} →
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                No exact source quote was eligible for this record. It remains excluded or needs
                review.
              </p>
            )}
          </section>
          <section className="surface-card p-5">
            <h2 className="section-title flex items-center gap-2">
              <IconBlocker
                size={17}
                className={`shrink-0 ${blockers?.length ? 'text-critical-400' : 'text-ink-muted'}`}
              />
              Blockers
            </h2>
            {blockers?.length ? (
              <ul className="mt-4 space-y-2.5 text-sm">
                {blockers.map((blocker) => (
                  <li
                    key={blocker.id}
                    className="surface-panel rail-critical bg-critical-500/5 p-4"
                  >
                    <strong className="text-sm font-semibold text-ink">
                      {label(blocker.severity)} · {label(blocker.blocker_type)}
                    </strong>
                    <p className="mt-1 text-ink-soft">{blocker.reason}</p>
                    <p className="text-metadata mt-2">
                      {label(blocker.status)} · {blocker.engine_version}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">No blocker records.</p>
            )}
          </section>
          <section className="surface-card p-5">
            <h2 className="section-title flex items-center gap-2">
              <IconLink size={17} className="shrink-0 text-ink-muted" />
              Relationships
            </h2>
            {relationships?.length ? (
              <ul className="mt-4 space-y-2 text-sm">
                {relationships.map((relationship) => (
                  <li key={relationship.id} className="surface-panel px-3.5 py-2.5 text-ink-soft">
                    {label(relationship.relationship_type)} ·{' '}
                    {label(relationship.human_review_status)} · records remain separate
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                No linked parent/child or duplicate proposal.
              </p>
            )}
          </section>
          <details className="disclosure analyst-only">
            <summary>Decision and audit history</summary>
            <div className="disclosure-body">
              <h3 className="text-micro flex items-center gap-2">
                <IconShield size={14} className="shrink-0 text-warning-400" />
                Waivers
              </h3>
              {waivers?.length ? (
                <ol className="mt-2.5 space-y-2 text-sm">
                  {waivers.map((waiver) => (
                    <li
                      key={waiver.id}
                      className="surface-panel rail-warning px-3.5 py-2.5 text-ink-soft"
                    >
                      {label(waiver.status)} · {label(waiver.designation)} · {waiver.reason} ·{' '}
                      <time dateTime={waiver.created_at} className="tabular text-ink-muted">
                        {new Date(waiver.created_at).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">No waiver records.</p>
              )}
              <h3 className="text-micro mt-6 flex items-center gap-2">
                <IconInfo size={14} className="shrink-0 text-info-400" />
                Exception notes
              </h3>
              {exceptions?.length ? (
                <ol className="mt-2.5 space-y-2 text-sm">
                  {exceptions.map((note) => (
                    <li
                      key={note.id}
                      className="surface-panel rail-steel px-3.5 py-2.5 text-ink-soft"
                    >
                      {note.explanation} ·{' '}
                      <time dateTime={note.created_at} className="tabular text-ink-muted">
                        {new Date(note.created_at).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">No exception notes.</p>
              )}
              <h3 className="text-micro mt-6">Audit events</h3>
              {audit?.length ? (
                <ol className="mt-2.5 space-y-1.5 text-sm text-ink-soft">
                  {audit.map((event) => (
                    <li key={event.id} className="border-b border-line-subtle pb-1.5 last:border-0">
                      {label(event.event_type)} ·{' '}
                      <time dateTime={event.created_at} className="tabular text-metadata">
                        {new Date(event.created_at).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">No item audit events.</p>
              )}
            </div>
          </details>
        </div>
        <aside className="surface-card h-fit p-5 lg:sticky lg:top-6">
          <h2 className="section-title">Update this task</h2>
          <p className="mb-5 mt-1.5 text-sm text-ink-soft">
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
