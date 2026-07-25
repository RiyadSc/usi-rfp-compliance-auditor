'use client';

import { useState, useTransition } from 'react';
import { createDocumentDownloadUrl } from './actions';

export function DocumentDownloadButton({
  workspaceId,
  documentId,
}: {
  workspaceId: string;
  documentId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        disabled={pending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setError(null);
          startTransition(async () => {
            const result = await createDocumentDownloadUrl({ workspaceId, documentId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            window.open(result.signedUrl, '_blank', 'noopener,noreferrer');
          });
        }}
      >
        {pending ? 'Preparing…' : 'Download'}
      </button>
      {error ? <span className="text-[11px] text-red-700">{error}</span> : null}
    </span>
  );
}
