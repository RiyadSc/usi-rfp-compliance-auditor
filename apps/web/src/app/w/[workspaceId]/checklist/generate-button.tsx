'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { IconSpark } from '@/components/icons';
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
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        className="primary-action"
        onClick={() =>
          start(async () => {
            const result = await generateChecklistAction({ workspaceId, verificationRunId });
            setMessage(
              result.ok
                ? `Submission list ${result.reused ? 'already up to date' : 'built'} from the verified requirements.`
                : result.error,
            );
            if (result.ok) router.refresh();
          })
        }
      >
        <IconSpark size={16} className="shrink-0" />
        {pending ? 'Building…' : 'Build submission list'}
      </button>
      {message ? (
        <p role="status" className="text-metadata max-w-64">
          {message}
        </p>
      ) : null}
    </div>
  );
}
