'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startVerification } from './actions';

export function StartVerificationButton({
  workspaceId,
  analysisRunId,
}: {
  workspaceId: string;
  analysisRunId: string;
}) {
  const router = useRouter();
  const [pending, begin] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className="rounded bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50"
        onClick={() =>
          begin(async () => {
            setError(null);
            const result = await startVerification({ workspaceId, analysisRunId });
            if (!result.ok) return setError(result.error);
            router.push(`/w/${workspaceId}/requirements?run=${result.verificationRunId}`);
          })
        }
      >
        {pending ? 'Starting independent verification…' : 'Start independent verification'}
      </button>
      <p className="text-xs text-slate-600">
        Creates a separate machine assessment. Human review remains pending.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
