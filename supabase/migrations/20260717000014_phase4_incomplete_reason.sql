-- Preserve only the normalized provider reason for an incomplete response.
-- Prompt payloads, document context, and hidden reasoning remain excluded.
alter table public.model_calls
  add column if not exists incomplete_reason text;

alter table public.model_calls
  drop constraint if exists model_calls_incomplete_reason_check;
alter table public.model_calls
  add constraint model_calls_incomplete_reason_check
  check (incomplete_reason is null or incomplete_reason in ('max_output_tokens', 'content_filter'));
