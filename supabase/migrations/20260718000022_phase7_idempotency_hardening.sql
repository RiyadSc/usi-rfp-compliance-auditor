-- Phase 7 idempotency hardening. Failed deterministic runs may be retried,
-- while active/completed identical inputs and concurrent export generations remain unique.

alter table public.report_generation_runs
  drop constraint if exists report_generation_runs_workspace_id_input_hash_report_type_report_version_key;

create unique index report_generation_runs_live_input_unique
  on public.report_generation_runs (workspace_id, input_hash, report_type, report_version)
  where status in ('generating', 'completed');

alter table public.export_manifests
  drop constraint if exists export_manifests_report_snapshot_id_export_format_csv_dataset_regeneration_number_key;

create unique index export_manifests_generation_unique
  on public.export_manifests (
    report_snapshot_id,
    export_format,
    coalesce(csv_dataset, '__structured_report__'),
    regeneration_number
  );
