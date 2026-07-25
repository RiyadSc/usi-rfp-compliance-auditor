'use client';

import { useState, useTransition } from 'react';
import { recordDemoFindingReview, requestDemoFallbackGrant, setPhase8DemoMode } from './actions';

export function DemoFindingReviewButton({
  workspaceId,
  scopeId,
}: {
  workspaceId: string;
  scopeId: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="primary-action disabled:opacity-60"
        onClick={() =>
          start(async () => {
            const result = await recordDemoFindingReview({
              workspaceId,
              scopeId,
              findingKey: 'incorrect_insurance',
            });
            setMessage(result.ok ? 'Review recorded in append-only audit history.' : result.error);
          })
        }
      >
        {pending ? 'Recording…' : 'Record finding review'}
      </button>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-soft">
        {message}
      </p>
    </div>
  );
}

export function DemoModeControls({
  workspaceId,
  scopeId,
}: {
  workspaceId: string;
  scopeId: string;
}) {
  const [pending, start] = useTransition();
  const modes = [
    ['prepared', 'Prepared'],
    ['cached', 'Cached'],
    ['fallback', 'Fallback'],
    ['offline_read_only', 'Offline read-only'],
  ] as const;
  return (
    <fieldset className="flex flex-wrap gap-2" disabled={pending}>
      <legend className="mb-2 text-sm font-medium text-ink">Presentation resilience mode</legend>
      {modes.map(([mode, label]) => (
        <button
          type="button"
          key={mode}
          className="secondary-action btn-sm"
          onClick={() =>
            start(async () => {
              await setPhase8DemoMode({ workspaceId, scopeId, mode });
            })
          }
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}

export function DemoDownloadGrantButton({
  workspaceId,
  scopeId,
}: {
  workspaceId: string;
  scopeId: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="secondary-action disabled:opacity-60"
        onClick={() =>
          start(async () => {
            const result = await requestDemoFallbackGrant({ workspaceId, scopeId });
            setMessage(
              result.ok
                ? `${result.label}; authorized grant expires in ${result.expiresInSeconds} seconds.`
                : result.error,
            );
          })
        }
      >
        {pending ? 'Authorizing…' : 'Validate short-lived private download'}
      </button>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-soft">
        {message}
      </p>
    </div>
  );
}
