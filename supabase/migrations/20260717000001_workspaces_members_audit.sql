-- Migration 0001: workspaces, workspace_members, audit_events
-- Target: RFP demo (uxmxkdjschbekkbnweby) ONLY. Additive; no destructive operations.
-- Tenant isolation: every tenant-owned table carries workspace_id and RLS
-- derived from workspace membership. RLS is enabled in this same migration.

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  customer text,
  deadline date,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  owner_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- workspace_members (tenant boundary source of truth)
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  role text not null default 'owner' check (role in ('owner', 'reviewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Membership check. SECURITY DEFINER avoids recursive RLS evaluation on
-- workspace_members itself (per Supabase RLS guidance). STABLE so the
-- planner can initplan-cache it when wrapped in (select ...).
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- Auto-enroll the creating user as owner member.
create or replace function public.handle_workspace_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_workspace_created on public.workspaces;
create trigger trg_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_workspace_created();

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_events (immutable, cannot be fabricated/edited/deleted by users)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'system')),
  actor_id uuid,
  event_type text not null check (event_type in (
    'workspace_created', 'workspace_updated', 'workspace_archived',
    'document_uploaded', 'document_deleted',
    'analysis_started', 'analysis_completed', 'analysis_failed',
    'requirement_reviewed', 'checklist_item_updated', 'finding_resolved',
    'export_generated', 'demo_reset'
  )),
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_workspace on public.audit_events (workspace_id, created_at desc);

-- Immutability: block UPDATE/DELETE for every role (triggers apply even to
-- service role, which bypasses RLS but not triggers).
create or replace function public.reject_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events are immutable';
end;
$$;

drop trigger if exists trg_audit_events_immutable on public.audit_events;
create trigger trg_audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function public.reject_audit_event_mutation();

-- Controlled write path: authenticated users may only record events
-- (a) as themselves, (b) in workspaces they belong to, (c) with allowlisted
-- event types (enforced by the table check constraint). Direct INSERT on the
-- table is denied by RLS (no insert policy for authenticated).
create or replace function public.record_audit_event(
  p_workspace_id uuid,
  p_event_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'record_audit_event requires an authenticated user';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of workspace %', p_workspace_id;
  end if;
  insert into public.audit_events
    (workspace_id, actor_type, actor_id, event_type, entity_type, entity_id, payload)
  values
    (p_workspace_id, 'user', v_actor, p_event_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_audit_event(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.record_audit_event(uuid, text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security (enabled in the same migration; deny-by-default)
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.audit_events enable row level security;

-- workspaces: members read; any authenticated user may create a workspace
-- they own; only members update. No delete policy (workspace deletion is a
-- protected reset-flow concern, added later via controlled path).
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated
  using ((select public.is_workspace_member(id)));

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
  for update to authenticated
  using ((select public.is_workspace_member(id)))
  with check ((select public.is_workspace_member(id)));

-- workspace_members: members can see the roster of their own workspaces.
-- No insert/update/delete policies: enrollment happens only via the
-- workspace-creation trigger (Phase 1); invitations would be a later,
-- controlled path.
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

-- audit_events: members read their workspace history. No insert policy
-- (writes only via record_audit_event); no update/delete (immutable trigger).
drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
