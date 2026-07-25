'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { IconBlocker, IconDocument, IconShield, IconTrash } from '@/components/icons';
import {
  assignChecklistOwnerAction,
  createChecklistExceptionAction,
  linkChecklistArtifactAction,
  removeChecklistArtifactAction,
  reviewChecklistArtifactAction,
  requestChecklistWaiverAction,
  reviewChecklistWaiverAction,
  resolveChecklistBlockerAction,
  updateChecklistStatusAction,
} from './actions';

type Member = { user_id: string; role: string };
type Document = { id: string; normalized_filename: string };

export function ChecklistItemControls({
  workspaceId,
  itemId,
  ownerId,
  reviewerId,
  workflowStatus,
  members,
  requiredArtifactId,
  documents,
  blockers,
  pendingWaivers,
  activeArtifactLinks,
}: {
  workspaceId: string;
  itemId: string;
  ownerId: string | null;
  reviewerId: string | null;
  workflowStatus: string;
  members: Member[];
  requiredArtifactId: string | null;
  documents: Document[];
  blockers: { id: string; blocker_type: string; status: string }[];
  pendingWaivers: { id: string; reason: string }[];
  activeArtifactLinks: { id: string; documentName: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    successMessage = 'Change recorded.',
  ) =>
    start(async () => {
      const result = await action();
      setMessage(result.ok ? successMessage : (result.error ?? 'Change failed.'));
      if (result.ok) router.refresh();
    });
  return (
    <div className="space-y-4">
      <form
        className="surface-panel space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(() =>
            assignChecklistOwnerAction({
              workspaceId,
              itemId,
              ownerId: String(form.get('owner') || '') || null,
              reviewerId: String(form.get('reviewer') || '') || null,
            }),
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span className="field-label">Owner</span>
            <select name="owner" defaultValue={ownerId ?? ''}>
              <option value="">Unassigned</option>
              {members.map((member, index) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.role.replaceAll('_', ' ')} · Team member {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Reviewer</span>
            <select name="reviewer" defaultValue={reviewerId ?? ''}>
              <option value="">Unassigned</option>
              {members.map((member, index) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.role.replaceAll('_', ' ')} · Team member {index + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button disabled={pending} className="secondary-action w-full sm:w-auto">
          Save assignments
        </button>
      </form>

      <form
        className="surface-panel space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(() =>
            updateChecklistStatusAction({
              workspaceId,
              itemId,
              status: String(form.get('status')),
              note: String(form.get('note') ?? ''),
            }),
          );
        }}
      >
        <label className="field">
          <span className="field-label">Workflow status</span>
          <select name="status" defaultValue={workflowStatus}>
            {[
              'not_started',
              'in_progress',
              'ready_for_review',
              'completed',
              'waived',
              'blocked',
              'not_applicable',
              'requires_human_proof',
              'unresolved',
            ].map((status) => (
              <option key={status} value={status}>
                {status.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Transition note</span>
          <input name="note" maxLength={1000} />
        </label>
        <button disabled={pending} className="primary-action w-full sm:w-auto">
          Update workflow
        </button>
      </form>

      {pendingWaivers.map((waiver) => (
        <form
          key={waiver.id}
          className="surface-panel rail-warning space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(() =>
              reviewChecklistWaiverAction({
                workspaceId,
                itemId,
                waiverId: waiver.id,
                status: String(form.get('status')),
                note: String(form.get('note')),
              }),
            );
          }}
        >
          <p className="flex items-start gap-2 text-sm text-ink-soft">
            <IconShield size={16} className="mt-0.5 shrink-0 text-warning-400" />
            <span>
              <strong className="font-semibold text-ink">Pending waiver:</strong> {waiver.reason}
            </span>
          </p>
          <label className="field">
            <span className="field-label">Review outcome</span>
            <select name="status">
              <option value="accepted">Accept waiver</option>
              <option value="rejected">Reject waiver</option>
              <option value="expired">Mark expired</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Review note</span>
            <input required minLength={5} maxLength={4000} name="note" />
          </label>
          <button disabled={pending} className="secondary-action w-full sm:w-auto">
            Record waiver review
          </button>
        </form>
      ))}

      {requiredArtifactId ? (
        <form
          className="surface-panel space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const documentId = String(new FormData(event.currentTarget).get('document'));
            run(() =>
              linkChecklistArtifactAction({ workspaceId, itemId, requiredArtifactId, documentId }),
            );
          }}
        >
          <label className="field">
            <span className="field-label">Link an allowed workspace document</span>
            <select required name="document">
              <option value="">Select document</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.normalized_filename}
                </option>
              ))}
            </select>
          </label>
          <button disabled={pending} className="secondary-action w-full sm:w-auto">
            Link artifact
          </button>
        </form>
      ) : null}

      {requiredArtifactId ? (
        <form
          className="surface-panel space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(() =>
              reviewChecklistArtifactAction({
                workspaceId,
                itemId,
                requiredArtifactId,
                state: String(form.get('artifactState')),
                note: String(form.get('artifactNote') ?? ''),
              }),
            );
          }}
        >
          <label className="field">
            <span className="field-label">Artifact review state</span>
            <select name="artifactState">
              <option value="pending_review">Pending review</option>
              <option value="reviewed">Reviewed</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Artifact review note</span>
            <input name="artifactNote" maxLength={1000} />
          </label>
          <button disabled={pending} className="secondary-action w-full sm:w-auto">
            Record artifact review
          </button>
        </form>
      ) : null}

      {activeArtifactLinks.map((link) => (
        <form
          key={link.id}
          className="surface-panel space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get('removeReason'));
            run(() =>
              removeChecklistArtifactAction({ workspaceId, itemId, linkId: link.id, reason }),
            );
          }}
        >
          <p className="flex items-start gap-2 text-sm text-ink-soft">
            <IconDocument size={16} className="mt-0.5 shrink-0 text-ink-muted" />
            <span className="wrap-break-word">Linked: {link.documentName}</span>
          </p>
          <label className="field">
            <span className="field-label">Removal reason</span>
            <input required minLength={5} maxLength={4000} name="removeReason" />
          </label>
          <div className="border-t border-line-subtle pt-4">
            <button disabled={pending} className="danger-action w-full sm:w-auto">
              <IconTrash size={15} className="shrink-0" />
              Remove artifact link
            </button>
          </div>
        </form>
      ))}

      <form
        className="surface-panel space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const explanation = String(new FormData(event.currentTarget).get('explanation'));
          run(() => createChecklistExceptionAction({ workspaceId, itemId, explanation }));
        }}
      >
        <label className="field">
          <span className="field-label">Exception note</span>
          <textarea required name="explanation" maxLength={4000} className="min-h-20" />
        </label>
        <button disabled={pending} className="secondary-action w-full sm:w-auto">
          Record exception note
        </button>
      </form>

      <form
        className="surface-panel space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(
            () =>
              requestChecklistWaiverAction({
                workspaceId,
                itemId,
                reason: String(form.get('reason')),
                designation: String(form.get('designation')),
                authorityNote: String(form.get('authority') ?? ''),
              }),
            'Pending waiver: request recorded for team review.',
          );
        }}
      >
        <label className="field">
          <span className="field-label">Waiver reason</span>
          <textarea required name="reason" minLength={5} maxLength={4000} className="min-h-20" />
        </label>
        <label className="field">
          <span className="field-label">Designation</span>
          <select name="designation">
            <option value="temporary">Temporary</option>
            <option value="final">Final</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Authority or supporting evidence</span>
          <input name="authority" maxLength={2000} />
        </label>
        <button disabled={pending} className="secondary-action w-full sm:w-auto">
          Request waiver
        </button>
      </form>

      {blockers
        .filter((blocker) => blocker.status !== 'resolved')
        .map((blocker) => (
          <form
            key={blocker.id}
            className="surface-panel rail-critical space-y-4 bg-critical-500/5 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(new FormData(event.currentTarget).get('reason'));
              run(() =>
                resolveChecklistBlockerAction({
                  workspaceId,
                  itemId,
                  blockerId: blocker.id,
                  action: 'resolved',
                  reason,
                }),
              );
            }}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <IconBlocker size={16} className="shrink-0 text-critical-400" />
              Resolve {blocker.blocker_type.replaceAll('_', ' ')}
            </p>
            <label className="field">
              <span className="field-label">Resolution reason</span>
              <input required name="reason" minLength={5} maxLength={4000} />
            </label>
            <button disabled={pending} className="secondary-action w-full sm:w-auto">
              Record resolution
            </button>
          </form>
        ))}
      {message ? (
        <p role="status" className="surface-inset px-3.5 py-3 text-sm text-ink-soft">
          {message}
        </p>
      ) : null}
    </div>
  );
}
