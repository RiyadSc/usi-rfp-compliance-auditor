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
        className="primary-action"
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
      <p className="text-metadata">
        Creates a separate machine assessment. Human review remains pending.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-critical-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
