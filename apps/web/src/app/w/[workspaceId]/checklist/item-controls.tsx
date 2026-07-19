'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="space-y-5">
      <form
        className="grid gap-3 sm:grid-cols-2"
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
        <label className="text-sm font-medium">
          Owner
          <select
            name="owner"
            defaultValue={ownerId ?? ''}
            className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Unassigned</option>
            {members.map((member, index) => (
              <option key={member.user_id} value={member.user_id}>
                {member.role.replaceAll('_', ' ')} · Team member {index + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Reviewer
          <select
            name="reviewer"
            defaultValue={reviewerId ?? ''}
            className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Unassigned</option>
            {members.map((member, index) => (
              <option key={member.user_id} value={member.user_id}>
                {member.role.replaceAll('_', ' ')} · Team member {index + 1}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={pending}
          className="w-fit rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Save assignments
        </button>
      </form>

      <form
        className="space-y-2"
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
        <label className="block text-sm font-medium">
          Workflow status
          <select
            name="status"
            defaultValue={workflowStatus}
            className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2"
          >
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
        <label className="block text-sm font-medium">
          Transition note
          <input
            name="note"
            maxLength={1000}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          disabled={pending}
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Update workflow
        </button>
      </form>

      {pendingWaivers.map((waiver) => (
        <form
          key={waiver.id}
          className="space-y-2 rounded border border-slate-200 p-3"
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
          <p className="text-sm">
            <strong>Pending waiver:</strong> {waiver.reason}
          </p>
          <label className="block text-sm font-medium">
            Review outcome
            <select
              name="status"
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2"
            >
              <option value="accepted">Accept waiver</option>
              <option value="rejected">Reject waiver</option>
              <option value="expired">Mark expired</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Review note
            <input
              required
              minLength={5}
              maxLength={4000}
              name="note"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button disabled={pending} className="rounded border border-slate-400 px-3 py-2 text-sm">
            Record waiver review
          </button>
        </form>
      ))}

      {requiredArtifactId ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const documentId = String(new FormData(event.currentTarget).get('document'));
            run(() =>
              linkChecklistArtifactAction({ workspaceId, itemId, requiredArtifactId, documentId }),
            );
          }}
        >
          <label className="block text-sm font-medium">
            Link an allowed workspace document
            <select
              required
              name="document"
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Select document</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.normalized_filename}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={pending}
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Link artifact
          </button>
        </form>
      ) : null}

      {requiredArtifactId ? (
        <form
          className="space-y-2"
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
          <label className="block text-sm font-medium">
            Artifact review state
            <select
              name="artifactState"
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2"
            >
              <option value="pending_review">Pending review</option>
              <option value="reviewed">Reviewed</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Artifact review note
            <input
              name="artifactNote"
              maxLength={1000}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button disabled={pending} className="rounded border border-slate-400 px-3 py-2 text-sm">
            Record artifact review
          </button>
        </form>
      ) : null}

      {activeArtifactLinks.map((link) => (
        <form
          key={link.id}
          className="rounded border border-slate-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get('removeReason'));
            run(() =>
              removeChecklistArtifactAction({ workspaceId, itemId, linkId: link.id, reason }),
            );
          }}
        >
          <p className="text-sm">Linked: {link.documentName}</p>
          <label className="mt-2 block text-sm font-medium">
            Removal reason
            <input
              required
              minLength={5}
              maxLength={4000}
              name="removeReason"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            disabled={pending}
            className="mt-2 rounded border border-slate-400 px-3 py-2 text-sm"
          >
            Remove artifact link
          </button>
        </form>
      ))}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const explanation = String(new FormData(event.currentTarget).get('explanation'));
          run(() => createChecklistExceptionAction({ workspaceId, itemId, explanation }));
        }}
      >
        <label className="block text-sm font-medium">
          Exception note
          <textarea
            required
            name="explanation"
            maxLength={4000}
            className="mt-1 min-h-20 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button disabled={pending} className="rounded border border-slate-400 px-3 py-2 text-sm">
          Record exception note
        </button>
      </form>

      <form
        className="space-y-2"
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
        <label className="block text-sm font-medium">
          Waiver reason
          <textarea
            required
            name="reason"
            minLength={5}
            maxLength={4000}
            className="mt-1 min-h-20 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-medium">
          Designation
          <select
            name="designation"
            className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2"
          >
            <option value="temporary">Temporary</option>
            <option value="final">Final</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Authority or supporting evidence
          <input
            name="authority"
            maxLength={2000}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button disabled={pending} className="rounded border border-slate-400 px-3 py-2 text-sm">
          Request waiver
        </button>
      </form>

      {blockers
        .filter((blocker) => blocker.status !== 'resolved')
        .map((blocker) => (
          <form
            key={blocker.id}
            className="rounded border border-slate-200 p-3"
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
            <p className="mb-2 text-sm font-medium">
              Resolve {blocker.blocker_type.replaceAll('_', ' ')}
            </p>
            <label className="text-sm">
              Resolution reason
              <input
                required
                name="reason"
                minLength={5}
                maxLength={4000}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              disabled={pending}
              className="mt-2 rounded border border-slate-400 px-3 py-2 text-sm"
            >
              Record resolution
            </button>
          </form>
        ))}
      {message ? (
        <p role="status" className="text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
