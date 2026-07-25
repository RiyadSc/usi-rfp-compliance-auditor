'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteDocument } from '../actions';

export function DeleteDocumentButton({
  workspaceId,
  documentId,
}: {
  workspaceId: string;
  documentId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-2 text-sm text-critical-400">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        className="danger-action btn-sm"
        onClick={() => {
          if (!window.confirm('Delete this document and its derived pages?')) return;
          startTransition(async () => {
            const result = await deleteDocument({ workspaceId, documentId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/w/${workspaceId}/documents`);
            router.refresh();
          });
        }}
      >
        {pending ? 'Deleting…' : 'Delete document'}
      </button>
    </div>
  );
}
