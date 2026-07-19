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
      className="mt-3 grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-2"
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
      <label className="text-sm font-medium">
        Human decision
        <select
          name="humanStatus"
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
        >
          <option value="accepted">Accept assessment</option>
          <option value="rejected">Reject assessment</option>
          <option value="needs_follow_up">Needs follow-up</option>
          <option value="waived">Record waiver</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Finding workflow
        <select
          name="workflowStatus"
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
        >
          <option value="in_review">In review</option>
          <option value="resolved">Resolved</option>
          <option value="accepted_risk">Accepted risk</option>
          <option value="obsolete">Obsolete</option>
        </select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Reason
        <textarea
          required
          minLength={5}
          maxLength={4000}
          name="reason"
          className="mt-1 block min-h-20 w-full rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <button
        disabled={pending}
        className="w-fit rounded border border-slate-500 px-3 py-2 text-sm disabled:opacity-50"
      >
        Record decision
      </button>
      {message ? (
        <p aria-live="polite" className="text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </form>
  );
}
