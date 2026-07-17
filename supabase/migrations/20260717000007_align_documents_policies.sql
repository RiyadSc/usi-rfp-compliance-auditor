-- Migration 0007: harden policies against the live documents_ingestion schema.
-- Context: migration 20260717000005 documents_ingestion already created
-- upload_intents/documents/document_pages/processing_jobs with its column names.
-- Our 0005 documents_upload_parse used IF NOT EXISTS and was a no-op for tables.
-- This migration only adjusts authorization: intents are server-written only.

drop policy if exists upload_intents_insert on public.upload_intents;
-- No insert/update/delete policies remain for authenticated on documents,
-- document_pages, or processing_jobs (SELECT-only). Writes use service role.
