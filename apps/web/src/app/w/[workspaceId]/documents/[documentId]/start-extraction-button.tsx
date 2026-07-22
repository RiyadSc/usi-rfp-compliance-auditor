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
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor="analysis-mode">
        Analysis mode
      </label>
      <select
        id="analysis-mode"
        value={mode}
        onChange={(event) => setMode(event.target.value as typeof mode)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="quick_scan">Quick scan — deterministic discovery, no provider</option>
        <option value="standard_analysis">
          Standard analysis — extraction plus independent verification
        </option>
        <option value="deep_audit">Deep audit — adds complex-table and ambiguity review</option>
      </select>
      <button
        type="button"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
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
      <p className="text-xs text-slate-600">
        Results are always labeled candidate / unverified. Independent verification is started
        separately after extraction completes.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
