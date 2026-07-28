'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import { IconDownload } from '@/components/icons';
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
      className="grid gap-5"
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
                ? 'This briefing already exists for that source chain.'
                : 'Leadership briefing created.'
              : result.error,
          );
          if (result.ok) router.push(`/w/${workspaceId}/reports/${result.snapshotId}`);
        });
      }}
    >
      <div>
        <h2 className="section-title">Create a leadership briefing</h2>
        <p className="section-lede">
          Snapshots blockers, open judgments, and missing proof from completed review work. It does
          not authorize submission.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">Completed draft review</span>
          <select required name="source">
            <option value="">Select a completed proposal review</option>
            {sourceOptions.map((option) => (
              <option key={option.proposalAuditRunId} value={option.proposalAuditRunId}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Briefing view</span>
          <select name="reportType">
            <option value="executive">Executive readiness</option>
            <option value="detailed_audit">Detailed audit</option>
            <option value="findings">Findings</option>
            <option value="checklist">Checklist</option>
            <option value="missing_artifacts">Missing artifacts</option>
            <option value="source_coverage">Source coverage</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button disabled={pending || !sourceOptions.length} className="primary-action">
          {pending ? 'Creating…' : 'Create briefing'}
        </button>
        {message ? (
          <p aria-live="polite" className="text-sm text-ink-soft">
            {message}
          </p>
        ) : null}
      </div>
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
      className="surface-panel grid gap-5 p-5"
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
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="field">
          <span className="field-label">Format</span>
          <select name="format">
            <option value="html">Structured HTML</option>
            <option value="csv">CSV dataset</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">CSV dataset</span>
          <select name="dataset">
            <option value="checklist_items">Checklist items</option>
            <option value="blockers">Blockers</option>
            <option value="missing_artifacts">Missing artifacts</option>
            <option value="proposal_findings">Proposal findings</option>
            <option value="proposal_claims">Proposal claims</option>
            <option value="review_status">Review status</option>
            <option value="source_coverage">Source coverage</option>
          </select>
        </label>
        <label className="flex min-h-[2.375rem] items-center gap-2.5 text-sm text-ink-soft">
          <input type="checkbox" name="regenerate" /> Create an explicit new generation
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button disabled={pending} className="secondary-action">
          {pending ? 'Working…' : 'Create export'}
        </button>
        {message ? (
          <p aria-live="polite" className="text-sm text-ink-soft">
            {message}
          </p>
        ) : null}
      </div>
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
  if (status !== 'active') return <StatusBadge value={status} label="Revoked" tone="warning" />;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={pending}
        className="secondary-action btn-sm"
        onClick={() =>
          start(async () => {
            const result = await createReportDownloadAction({ workspaceId, artifactId });
            if (result.ok) window.location.assign(result.signedUrl);
            else setMessage(result.error);
          })
        }
      >
        <IconDownload size={15} />
        Download (5-minute link)
      </button>
      <span aria-hidden="true" className="hidden h-5 w-px bg-line-default sm:block" />
      <button
        disabled={pending}
        className="danger-action btn-sm"
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
        <span aria-live="polite" className="text-sm text-ink-soft">
          {message}
        </span>
      ) : null}
    </div>
  );
}
