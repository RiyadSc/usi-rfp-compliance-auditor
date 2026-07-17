'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createUploadIntent, finalizeUpload } from './actions';

type Props = {
  workspaceId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Server-enforced max; also used for early UX feedback (not authoritative). */
  maxUploadBytes: number;
};

export function UploadForm({ workspaceId, supabaseUrl, supabaseAnonKey, maxUploadBytes }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setStatus(null);
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a PDF file');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted');
      return;
    }
    if (file.size > maxUploadBytes) {
      setError(`File exceeds maximum size of ${maxUploadBytes} bytes`);
      return;
    }

    startTransition(async () => {
      try {
        setStatus('Authorizing upload…');
        const intent = await createUploadIntent({
          workspaceId,
          filename: file.name,
          mimeType: file.type || 'application/pdf',
          byteSize: file.size,
          documentType: String(formData.get('documentType') || 'primary_rfp'),
        });
        if (!intent.ok) {
          setError(intent.error);
          setStatus(null);
          return;
        }

        setStatus('Uploading privately…');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error: uploadError } = await supabase.storage
          .from('workspace-documents')
          .uploadToSignedUrl(intent.path, intent.token, file, {
            contentType: 'application/pdf',
          });
        if (uploadError) {
          setError('Upload failed. Try again.');
          setStatus(null);
          return;
        }

        setStatus('Validating and queuing parse…');
        const finalized = await finalizeUpload({
          workspaceId,
          intentId: intent.intentId,
          documentType: String(formData.get('documentType') || 'primary_rfp'),
        });
        if (!finalized.ok) {
          setError(finalized.error);
          setStatus(null);
          return;
        }

        setStatus('Queued for parsing. Refreshing…');
        window.location.href = `/w/${workspaceId}/documents/${finalized.documentId}`;
      } catch {
        setError('Unexpected upload failure');
        setStatus(null);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-base font-medium">Upload PDF</h2>
      <p className="text-sm text-slate-600">
        PDF only. Contents are untrusted data. Maximum size is {maxUploadBytes} bytes (enforced
        server-side).
      </p>
      {error ? (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {status ? (
        <p aria-live="polite" className="text-sm text-slate-700">
          {status}
        </p>
      ) : null}
      <div>
        <label htmlFor="documentType" className="block text-sm font-medium mb-1">
          Document type
        </label>
        <select
          id="documentType"
          name="documentType"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          defaultValue="primary_rfp"
        >
          <option value="primary_rfp">Primary RFP</option>
          <option value="addendum">Addendum</option>
          <option value="attachment">Attachment</option>
          <option value="proposal_draft">Proposal draft</option>
          <option value="reference">Reference</option>
        </select>
      </div>
      <div>
        <label htmlFor="file" className="block text-sm font-medium mb-1">
          PDF file
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="block w-full text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {pending ? 'Working…' : 'Upload'}
      </button>
    </form>
  );
}
