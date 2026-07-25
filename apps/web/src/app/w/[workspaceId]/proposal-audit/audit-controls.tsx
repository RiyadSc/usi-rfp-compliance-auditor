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
      className="grid gap-5"
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
      <div>
        <h2 className="section-title">Start deterministic draft audit</h2>
        <p className="section-lede">
          Select a parsed proposal draft and a completed checklist generation. No model provider is
          called.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="field">
          <span className="field-label">Proposal draft</span>
          <select required name="document">
            <option value="">Select parsed proposal</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Prior revision (optional)</span>
          <select name="priorDraft">
            <option value="">Start a new lineage</option>
            {priorDrafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Checklist generation</span>
          <select required name="checklistRun">
            <option value="">Select checklist</option>
            {checklistRuns.map((run) => (
              <option key={run.id} value={run.id}>
                {new Date(run.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle pt-4">
        <button
          disabled={pending || !documents.length || !checklistRuns.length}
          className="primary-action"
        >
          {pending ? 'Auditing…' : 'Run proposal audit'}
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
