'use client';

import React from 'react';
import { useState, useTransition } from 'react';
import { EvidenceProcessingMark } from '@/components/brand';
import { IconAlert, IconBlocker, IconRefresh } from '@/components/icons';
import { cancelLargeDocumentJob, retryProcessingUnit } from './processing-actions';

type Props = {
  workspaceId: string;
  documentId: string;
  inspection: {
    sourceFormat: string;
    pages: number;
    nativePages: number;
    ocrPages: number;
    uncertainPages: number;
    tables: number;
    blocks: number;
    warnings: string[];
  } | null;
  job: {
    id: string;
    status: string;
    currentStage: string;
    progressNumerator: number;
    progressDenominator: number;
  } | null;
  stages: Array<{
    id: string;
    stage: string;
    status: string;
    progressNumerator: number;
    progressDenominator: number;
  }>;
  failedUnits: Array<{
    id: string;
    unitType: string;
    unitKey: string;
    status: string;
    error: string | null;
  }>;
  cost: {
    low: number;
    high: number;
    maximum: number;
    callsLow: number;
    callsHigh: number;
    largestStage: string;
    allowed: boolean;
    blockReason: string | null;
  } | null;
  cacheDecision: string | null;
};
export function ProcessingPanel({
  workspaceId,
  documentId,
  inspection,
  job,
  stages,
  failedUnits,
  cost,
  cacheDecision,
}: Props) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const running = job ? ['running', 'queued'].includes(job.status) : false;
  return (
    <section className="surface-card mb-6 p-5 sm:p-6" aria-labelledby="processing-title">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h2 id="processing-title" className="section-title">
          Document inspection and processing
        </h2>
        {running ? <EvidenceProcessingMark size={26} /> : null}
      </div>
      {inspection ? (
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Detected format" value={inspection.sourceFormat.toUpperCase()} />
          <Metric label="Pages or sheets" value={String(inspection.pages)} />
          <Metric
            label="Native / OCR / uncertain"
            value={`${inspection.nativePages} / ${inspection.ocrPages} / ${inspection.uncertainPages}`}
          />
          <Metric label="Blocks" value={String(inspection.blocks)} />
          <Metric label="Tables" value={String(inspection.tables)} />
          <Metric label="Cache" value={cacheDecision ?? 'Not evaluated'} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">Inspection has not completed yet.</p>
      )}
      {cost ? (
        <div className="surface-panel mt-5 p-4">
          <h3 className="text-micro">Estimated analysis cost</h3>
          <p className="tabular mt-2 text-sm text-ink-soft">
            Expected ${cost.low.toFixed(2)}–${cost.high.toFixed(2)} · hard maximum $
            {cost.maximum.toFixed(2)} · {cost.callsLow}–{cost.callsHigh} calls · largest stage:{' '}
            {cost.largestStage}
          </p>
          {!cost.allowed ? (
            <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-critical-400">
              <span aria-hidden="true" className="mt-0.5 shrink-0">
                <IconBlocker size={15} />
              </span>
              Execution blocked: {cost.blockReason}
            </p>
          ) : null}
        </div>
      ) : null}
      {job ? (
        <details className="disclosure mt-5" open>
          <summary>
            <h3 className="text-sm font-semibold text-ink">Persisted progress</h3>
          </summary>
          <div className="disclosure-body">
            <p className="tabular text-sm text-ink-soft">
              {job.currentStage.replaceAll('_', ' ')} · {job.progressNumerator} of{' '}
              {job.progressDenominator} work units · {job.status}
            </p>
            {stages.length ? (
              <div className="stage-track mt-3" aria-hidden="true">
                {stages.map((stage) => (
                  <span key={stage.id} className={`stage-segment ${segmentTone(stage.status)}`} />
                ))}
              </div>
            ) : null}
            <ol className="mt-4 space-y-2 text-sm">
              {stages.map((stage) => (
                <li
                  key={stage.id}
                  className="tabular border-t border-line-subtle pt-2 text-ink-soft first:border-0 first:pt-0"
                >
                  {stage.stage.replaceAll('_', ' ')}: {stage.progressNumerator} of{' '}
                  {stage.progressDenominator} · {stage.status}
                </li>
              ))}
            </ol>
            {['running', 'failed_retryable'].includes(job.status) ? (
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await cancelLargeDocumentJob({
                      workspaceId,
                      documentId,
                      jobId: job.id,
                    });
                    setMessage(result.ok ? 'Job cancelled' : result.error);
                  })
                }
                className="secondary-action btn-sm mt-4"
              >
                Cancel pending work
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
      {failedUnits.length ? (
        <div className="mt-5">
          <h3 className="text-micro">Recovery</h3>
          <ul className="mt-2 space-y-2">
            {failedUnits.map((unit) => (
              <li key={unit.id} className="notice notice-warning rail-warning">
                <p className="flex items-start gap-2 text-sm">
                  <span aria-hidden="true" className="mt-0.5 shrink-0 text-warning-400">
                    <IconAlert size={15} />
                  </span>
                  <span className="mono">
                    {unit.unitType.replaceAll('_', ' ')} · {unit.unitKey}
                    {unit.error ? ` · ${unit.error}` : ''}
                  </span>
                </p>
                {job && unit.status === 'failed_retryable' ? (
                  <button
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await retryProcessingUnit({
                          workspaceId,
                          documentId,
                          jobId: job.id,
                          workUnitId: unit.id,
                        });
                        setMessage(result.ok ? 'Retry queued' : result.error);
                      })
                    }
                    className="secondary-action btn-sm mt-3"
                  >
                    <IconRefresh size={14} />
                    Retry this unit
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {inspection?.warnings.length ? (
        <div className="notice notice-warning mt-5">
          <h3 className="notice-title">
            <IconAlert size={15} />
            Processing warnings
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {inspection.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? (
        <p aria-live="polite" className="text-metadata mt-4">
          {message}
        </p>
      ) : null}
    </section>
  );
}

/** Segment tone follows the persisted stage status; no progress is inferred. */
function segmentTone(status: string): string {
  if (status === 'completed' || status === 'succeeded') return 'stage-segment-done';
  if (status === 'running') return 'stage-segment-active';
  if (status.startsWith('failed')) return 'bg-critical-500';
  return '';
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-panel p-4">
      <dt className="metric-label">{label}</dt>
      <dd className="tabular mt-2 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
