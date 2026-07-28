'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startExtraction } from './analysis-actions';

type Props = {
  workspaceId: string;
  documentId: string;
  canStart: boolean;
};

export function StartExtractionButton({ workspaceId, documentId, canStart }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'quick_scan' | 'standard_analysis' | 'deep_audit'>(
    'standard_analysis',
  );

  if (!canStart) return null;

  return (
    <div className="space-y-3">
      <div className="field">
        <label className="field-label" htmlFor="analysis-mode">
          Analysis mode
        </label>
        <select
          id="analysis-mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as typeof mode)}
        >
          <option value="quick_scan">Quick scan — rules-based discovery only</option>
          <option value="standard_analysis">
            Standard analysis — extraction plus independent verification
          </option>
          <option value="deep_audit">Deep audit — adds complex-table and ambiguity review</option>
        </select>
      </div>
      <button
        type="button"
        disabled={pending}
        className="primary-action"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startExtraction({ workspaceId, documentId, mode });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/w/${workspaceId}/analysis/${result.analysisRunId}`);
          });
        }}
      >
        {pending ? 'Starting…' : 'Start candidate extraction'}
      </button>
      <p className="field-hint">
        Results are always labeled candidate / unverified. Independent verification is started
        separately after extraction completes.
      </p>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
