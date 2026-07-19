'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateChecklistAction } from './actions';

export function GenerateChecklistButton({
  workspaceId,
  verificationRunId,
}: {
  workspaceId: string;
  verificationRunId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const result = await generateChecklistAction({ workspaceId, verificationRunId });
            setMessage(
              result.ok
                ? `Checklist ${result.reused ? 'reused' : 'generated'} deterministically.`
                : result.error,
            );
            if (result.ok) router.refresh();
          })
        }
      >
        {pending ? 'Generating…' : 'Generate deterministic checklist'}
      </button>
      {message ? (
        <p role="status" className="mt-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
