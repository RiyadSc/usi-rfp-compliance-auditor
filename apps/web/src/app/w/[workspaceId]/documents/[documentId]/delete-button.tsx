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
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50 disabled:opacity-50"
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
