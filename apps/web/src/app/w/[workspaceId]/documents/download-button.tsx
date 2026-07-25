'use client';

import { useState, useTransition } from 'react';
import { IconDownload } from '@/components/icons';
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
        className="secondary-action btn-sm"
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
        <IconDownload size={15} />
        {pending ? 'Preparing…' : 'Download'}
      </button>
      {error ? <span className="text-[11px] text-critical-400">{error}</span> : null}
    </span>
  );
}
