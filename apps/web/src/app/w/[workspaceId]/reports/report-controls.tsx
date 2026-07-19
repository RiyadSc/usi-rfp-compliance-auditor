'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createReportDownloadAction,
  createReportExportAction,
  generateReportAction,
  revokeReportExportAction,
} from './actions';

export function ReportGenerationControls({
  workspaceId,
  sourceOptions,
}: {
  workspaceId: string;
  sourceOptions: Array<{
    proposalAuditRunId: string;
    analysisRunId: string;
    verificationRunId: string;
    checklistGenerationRunId: string;
    readinessSnapshotId: string;
    label: string;
  }>;
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
        const source = sourceOptions.find(
          (option) => option.proposalAuditRunId === data.get('source'),
        );
        if (!source) return setMessage('Select one completed source chain.');
        start(async () => {
          const result = await generateReportAction({
            workspaceId,
            ...source,
            reportType: String(data.get('reportType')),
          });
          setMessage(
            result.ok
              ? result.reused
                ? 'Existing deterministic report reused.'
                : 'Deterministic report generated.'
              : result.error,
          );
          if (result.ok) router.push(`/w/${workspaceId}/reports/${result.snapshotId}`);
        });
      }}
    >
      <h2 className="font-medium">Generate a versioned report</h2>
      <p className="text-sm text-slate-600">
        Uses persisted Phase 4–6 records only. No model provider is called.
      </p>
      <label className="block text-sm font-medium">
        Source run chain
        <select
          required
          name="source"
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="">Select completed proposal audit</option>
          {sourceOptions.map((option) => (
            <option key={option.proposalAuditRunId} value={option.proposalAuditRunId}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Report view
        <select
          name="reportType"
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="executive">Executive readiness</option>
          <option value="detailed_audit">Detailed audit</option>
          <option value="findings">Findings</option>
          <option value="checklist">Checklist</option>
          <option value="missing_artifacts">Missing artifacts</option>
          <option value="source_coverage">Source coverage</option>
        </select>
      </label>
      <button
        disabled={pending || !sourceOptions.length}
        className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Generating…' : 'Generate report'}
      </button>
      {message ? (
        <p aria-live="polite" className="text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function ReportExportControls({
  workspaceId,
  snapshotId,
}: {
  workspaceId: string;
  snapshotId: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const format = String(data.get('format'));
        start(async () => {
          const result = await createReportExportAction({
            workspaceId,
            reportSnapshotId: snapshotId,
            format,
            csvDataset: format === 'csv' ? String(data.get('dataset')) : null,
            regenerate: data.get('regenerate') === 'on',
          });
          setMessage(
            result.ok
              ? result.reused
                ? 'Existing export reused.'
                : 'Private export generated.'
              : result.error,
          );
          router.refresh();
        });
      }}
    >
      <label className="text-sm font-medium">
        Format
        <select name="format" className="mt-1 block rounded border border-slate-300 px-3 py-2">
          <option value="html">Structured HTML</option>
          <option value="csv">CSV dataset</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        CSV dataset
        <select name="dataset" className="mt-1 block rounded border border-slate-300 px-3 py-2">
          <option value="checklist_items">Checklist items</option>
          <option value="blockers">Blockers</option>
          <option value="missing_artifacts">Missing artifacts</option>
          <option value="proposal_findings">Proposal findings</option>
          <option value="proposal_claims">Proposal claims</option>
          <option value="review_status">Review status</option>
          <option value="source_coverage">Source coverage</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="regenerate" /> Create an explicit new generation
      </label>
      <button
        disabled={pending}
        className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Working…' : 'Create export'}
      </button>
      {message ? (
        <p aria-live="polite" className="w-full text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function ExportArtifactControls({
  workspaceId,
  artifactId,
  status,
}: {
  workspaceId: string;
  artifactId: string;
  status: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();
  if (status !== 'active') return <span className="text-sm text-slate-500">Revoked</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        className="rounded border border-blue-700 px-3 py-1 text-sm text-blue-700 disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const result = await createReportDownloadAction({ workspaceId, artifactId });
            if (result.ok) window.location.assign(result.signedUrl);
            else setMessage(result.error);
          })
        }
      >
        Download (5-minute link)
      </button>
      <button
        disabled={pending}
        className="rounded border border-red-700 px-3 py-1 text-sm text-red-700 disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const result = await revokeReportExportAction({
              workspaceId,
              artifactId,
              reason: 'Revoked by an authorized workspace member.',
            });
            setMessage(result.ok ? 'Export revoked.' : result.error);
            router.refresh();
          })
        }
      >
        Revoke
      </button>
      {message ? (
        <span aria-live="polite" className="text-sm text-slate-700">
          {message}
        </span>
      ) : null}
    </div>
  );
}
