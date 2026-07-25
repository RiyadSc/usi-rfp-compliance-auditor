'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveProposalFindingAction } from './actions';

export function ProposalFindingControls({
  workspaceId,
  auditRunId,
  findingId,
}: {
  workspaceId: string;
  auditRunId: string;
  findingId: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();
  return (
    <form
      className="surface-panel rail-teal mt-5 grid gap-4 p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await resolveProposalFindingAction({
            workspaceId,
            auditRunId,
            findingId,
            humanStatus: String(data.get('humanStatus')),
            workflowStatus: String(data.get('workflowStatus')),
            reason: String(data.get('reason')),
          });
          setMessage(result.ok ? 'Human decision appended.' : result.error);
          if (result.ok) router.refresh();
        });
      }}
    >
      <label className="field">
        <span className="field-label">Human decision</span>
        <select name="humanStatus">
          <option value="accepted">Accept assessment</option>
          <option value="rejected">Reject assessment</option>
          <option value="needs_follow_up">Needs follow-up</option>
          <option value="waived">Record waiver</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Finding workflow</span>
        <select name="workflowStatus">
          <option value="in_review">In review</option>
          <option value="resolved">Resolved</option>
          <option value="accepted_risk">Accepted risk</option>
          <option value="obsolete">Obsolete</option>
        </select>
      </label>
      <label className="field sm:col-span-2">
        <span className="field-label">Reason</span>
        <textarea required minLength={5} maxLength={4000} name="reason" className="min-h-20" />
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
        <button disabled={pending} className="secondary-action btn-sm">
          Record decision
        </button>
        {message ? (
          <p aria-live="polite" className="text-metadata">
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
