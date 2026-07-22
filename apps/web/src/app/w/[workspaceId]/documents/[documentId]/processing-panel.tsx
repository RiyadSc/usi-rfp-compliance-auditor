'use client';

import React from 'react';
import { useState, useTransition } from 'react';
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
  return (
    <section className="surface-card mb-6" aria-labelledby="processing-title">
      <h2 id="processing-title" className="text-lg font-semibold">
        Document inspection and processing
      </h2>
      {inspection ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Metric label="Detected format" value={inspection.sourceFormat.toUpperCase()} />
          <Metric label="Pages or sheets" value={String(inspection.pages)} />
          <Metric
            label="Native / OCR / uncertain"
            value={`${inspection.nativePages} / ${inspection.ocrPages} / ${inspection.uncertainPages}`}
          />
          <Metric label="Blocks" value={String(inspection.blocks)} />
          <Metric label="Tables" value={String(inspection.tables)} />
          <Metric label="Cache" value={cacheDecision ?? 'Not evaluated'} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Inspection has not completed yet.</p>
      )}
      {cost ? (
        <div className="mt-4 rounded border border-slate-200 p-3">
          <h3 className="font-medium">Estimated analysis cost</h3>
          <p className="text-sm text-slate-700">
            Expected ${cost.low.toFixed(2)}–${cost.high.toFixed(2)} · hard maximum $
            {cost.maximum.toFixed(2)} · {cost.callsLow}–{cost.callsHigh} calls · largest stage:{' '}
            {cost.largestStage}
          </p>
          {!cost.allowed ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              Execution blocked: {cost.blockReason}
            </p>
          ) : null}
        </div>
      ) : null}
      {job ? (
        <div className="mt-4">
          <h3 className="font-medium">Persisted progress</h3>
          <p className="text-sm text-slate-700">
            {job.currentStage.replaceAll('_', ' ')} · {job.progressNumerator} of{' '}
            {job.progressDenominator} work units · {job.status}
          </p>
          <ol className="mt-2 space-y-1 text-sm">
            {stages.map((stage) => (
              <li key={stage.id}>
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
              className="mt-3 rounded border border-slate-400 px-3 py-2 text-sm"
            >
              Cancel pending work
            </button>
          ) : null}
        </div>
      ) : null}
      {failedUnits.length ? (
        <div className="mt-4">
          <h3 className="font-medium">Recovery</h3>
          <ul className="space-y-2">
            {failedUnits.map((unit) => (
              <li key={unit.id} className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                <p>
                  {unit.unitType.replaceAll('_', ' ')} · {unit.unitKey}
                  {unit.error ? ` · ${unit.error}` : ''}
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
                    className="mt-2 rounded bg-blue-700 px-3 py-1 text-white"
                  >
                    Retry this unit
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {inspection?.warnings.length ? (
        <div className="mt-4">
          <h3 className="font-medium">Processing warnings</h3>
          <ul className="list-disc pl-5 text-sm">
            {inspection.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? (
        <p aria-live="polite" className="mt-3 text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
