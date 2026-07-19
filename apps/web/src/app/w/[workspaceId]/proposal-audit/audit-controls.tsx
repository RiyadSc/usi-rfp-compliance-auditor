'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startProposalAuditAction } from './actions';

export function ProposalAuditControls({
  workspaceId,
  documents,
  checklistRuns,
  priorDrafts,
}: {
  workspaceId: string;
  documents: { id: string; name: string }[];
  checklistRuns: { id: string; createdAt: string }[];
  priorDrafts: { id: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();
  return (
    <form
      className="space-y-3 rounded border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await startProposalAuditAction({
            workspaceId,
            documentId: String(data.get('document')),
            checklistGenerationRunId: String(data.get('checklistRun')),
            priorDraftId: String(data.get('priorDraft') || '') || null,
          });
          setMessage(result.ok ? 'Deterministic audit recorded.' : result.error);
          if (result.ok) {
            router.push(`/w/${workspaceId}/proposal-audit/${result.auditRunId}`);
            router.refresh();
          }
        });
      }}
    >
      <h2 className="font-medium">Start deterministic draft audit</h2>
      <p className="text-sm text-slate-600">
        Select a parsed proposal draft and a completed checklist generation. No model provider is
        called.
      </p>
      <label className="block text-sm font-medium">
        Proposal draft
        <select
          required
          name="document"
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="">Select parsed proposal</option>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Prior revision (optional)
        <select
          name="priorDraft"
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="">Start a new lineage</option>
          {priorDrafts.map((draft) => (
            <option key={draft.id} value={draft.id}>
              {draft.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Checklist generation
        <select
          required
          name="checklistRun"
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="">Select checklist</option>
          {checklistRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {new Date(run.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={pending || !documents.length || !checklistRuns.length}
        className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Auditing…' : 'Run proposal audit'}
      </button>
      {message ? (
        <p aria-live="polite" className="text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </form>
  );
}
