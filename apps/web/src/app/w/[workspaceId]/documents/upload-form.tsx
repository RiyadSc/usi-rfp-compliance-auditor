'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@supabase/supabase-js';
import { EvidenceProcessingMark } from '@/components/brand';
import { IconUpload } from '@/components/icons';
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
      setError('Choose a supported document');
      return;
    }
    if (!/\.(pdf|docx|xlsx|html?|txt|png|jpe?g|tiff?|webp|zip)$/i.test(file.name)) {
      setError('Choose PDF, DOCX, XLSX, HTML, TXT, an approved image, or ZIP package');
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
          mimeType: file.type || inferMime(file.name),
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
            contentType: file.type || inferMime(file.name),
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
    <form action={onSubmit} className="surface-panel grid gap-5 p-5">
      <div>
        <h2 className="section-title">Upload solicitation files</h2>
        <p className="section-lede">
          PDF, DOCX, XLSX, HTML, TXT, approved images, or a safe ZIP package. Contents are untrusted
          data. Maximum size is {maxUploadBytes} bytes (enforced server-side).
        </p>
      </div>
      {error ? (
        <p role="alert" className="notice notice-critical rail-critical">
          {error}
        </p>
      ) : null}
      {status ? (
        <p aria-live="polite" className="flex items-center gap-2.5 text-sm text-ink-soft">
          <EvidenceProcessingMark size={20} />
          {status}
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="documentType" className="field-label">
            Document type
          </label>
          <select id="documentType" name="documentType" defaultValue="primary_rfp">
            <option value="primary_rfp">Main RFP</option>
            <option value="addendum">Addendum</option>
            <option value="attachment">Attachment</option>
            <option value="proposal_draft">Proposal draft</option>
            <option value="reference">Reference</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="file" className="field-label">
            Document or package
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".pdf,.docx,.xlsx,.html,.htm,.txt,.png,.jpg,.jpeg,.tif,.tiff,.webp,.zip"
            required
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="primary-action">
          <IconUpload size={16} />
          {pending ? 'Working…' : 'Upload'}
        </button>
      </div>
    </form>
  );
}

function inferMime(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop();
  return (
    (
      {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        html: 'text/html',
        htm: 'text/html',
        txt: 'text/plain',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        tif: 'image/tiff',
        tiff: 'image/tiff',
        webp: 'image/webp',
        zip: 'application/zip',
      } as Record<string, string>
    )[extension ?? ''] ?? 'application/octet-stream'
  );
}
