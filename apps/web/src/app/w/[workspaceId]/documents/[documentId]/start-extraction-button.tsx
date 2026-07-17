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

  if (!canStart) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startExtraction({ workspaceId, documentId });
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
        Results are always labeled candidate / unverified. Verification is out of scope for this
        phase.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
