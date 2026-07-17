import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, createTestWorkspace, signInUser } from './helpers.js';

/**
 * Two-workspace tenant isolation, enforced by RLS (not application code).
 * User A and user B are seeded demo users with no shared workspaces.
 */
let a: SupabaseClient;
let b: SupabaseClient;
let workspaceA: string;
let workspaceB: string;

beforeAll(async () => {
  a = await signInUser('A');
  b = await signInUser('B');
  workspaceA = await createTestWorkspace(a, `iso-A ${Date.now()}`);
  workspaceB = await createTestWorkspace(b, `iso-B ${Date.now()}`);
});

afterAll(async () => {
  await a.auth.signOut();
  await b.auth.signOut();
});

describe('workspaces table isolation', () => {
  it('members can read their own workspace', async () => {
    const { data } = await a.from('workspaces').select('id').eq('id', workspaceA);
    expect(data).toHaveLength(1);
  });

  it('non-members get zero rows for direct table reads (negative)', async () => {
    const { data, error } = await b.from('workspaces').select('id').eq('id', workspaceA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('users cannot create workspaces owned by someone else (negative)', async () => {
    const {
      data: { user: userA },
    } = await a.auth.getUser();
    const { error } = await b
      .from('workspaces')
      .insert({ name: 'spoofed-owner', owner_id: userA!.id });
    expect(error).not.toBeNull();
  });

  it('non-members cannot update another workspace (negative)', async () => {
    const { data, error } = await b
      .from('workspaces')
      .update({ name: 'hijacked name' })
      .eq('id', workspaceA)
      .select('id');
    // RLS filters the row out: zero rows updated, no error.
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    const { data: fresh } = await a.from('workspaces').select('name').eq('id', workspaceA);
    expect(fresh?.[0]?.name).not.toBe('hijacked name');
  });

  it('unauthenticated clients read nothing (negative)', async () => {
    const anon = anonClient();
    const { data } = await anon.from('workspaces').select('id');
    expect(data ?? []).toHaveLength(0);
  });
});

describe('workspace_members isolation', () => {
  it('members see their own roster', async () => {
    const { data } = await a
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceA);
    expect(data).toHaveLength(1);
  });

  it('non-members cannot enumerate another roster (negative)', async () => {
    const { data } = await b
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceA);
    expect(data).toHaveLength(0);
  });

  it('users cannot insert themselves into another workspace (negative)', async () => {
    const {
      data: { user: userB },
    } = await b.auth.getUser();
    const { error } = await b
      .from('workspace_members')
      .insert({ workspace_id: workspaceA, user_id: userB!.id, role: 'reviewer' });
    expect(error).not.toBeNull();
  });
});

describe('audit_events integrity and isolation', () => {
  it('records events via the controlled RPC in own workspace', async () => {
    const { data, error } = await a.rpc('record_audit_event', {
      p_workspace_id: workspaceA,
      p_event_type: 'workspace_updated',
      p_entity_type: 'workspace',
      p_entity_id: workspaceA,
      p_payload: { note: 'integration test' },
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it('rejects RPC events for workspaces the caller does not belong to (negative)', async () => {
    const { error } = await b.rpc('record_audit_event', {
      p_workspace_id: workspaceA,
      p_event_type: 'workspace_updated',
    });
    expect(error).not.toBeNull();
  });

  it('rejects non-allowlisted event types (negative)', async () => {
    const { error } = await a.rpc('record_audit_event', {
      p_workspace_id: workspaceA,
      p_event_type: 'fabricated_event_type',
    });
    expect(error).not.toBeNull();
  });

  it('denies direct INSERT into audit_events (negative)', async () => {
    const {
      data: { user: userA },
    } = await a.auth.getUser();
    const { error } = await a.from('audit_events').insert({
      workspace_id: workspaceA,
      actor_type: 'user',
      actor_id: userA!.id,
      event_type: 'workspace_updated',
    });
    expect(error).not.toBeNull();
  });

  it('denies UPDATE and DELETE of audit events (immutability, negative)', async () => {
    const { data: events } = await a
      .from('audit_events')
      .select('id')
      .eq('workspace_id', workspaceA)
      .limit(1);
    expect(events?.length).toBeGreaterThan(0);
    const eventId = events![0]!.id;

    const { data: updated } = await a
      .from('audit_events')
      .update({ event_type: 'workspace_archived' })
      .eq('id', eventId)
      .select('id');
    expect(updated ?? []).toHaveLength(0);

    const { data: deleted } = await a.from('audit_events').delete().eq('id', eventId).select('id');
    expect(deleted ?? []).toHaveLength(0);

    const { data: still } = await a.from('audit_events').select('id').eq('id', eventId);
    expect(still).toHaveLength(1);
  });

  it('hides audit events from non-members (negative)', async () => {
    const { data } = await b.from('audit_events').select('id').eq('workspace_id', workspaceA);
    expect(data).toHaveLength(0);
  });
});

describe('storage isolation (workspace-documents bucket)', () => {
  const content = new Blob(['synthetic fixture placeholder'], { type: 'text/plain' });

  it('members upload into their own workspace prefix', async () => {
    const { error } = await a.storage
      .from('workspace-documents')
      .upload(`${workspaceA}/smoke-test.txt`, content, { upsert: false });
    expect(error).toBeNull();
  });

  it('non-members cannot upload into another workspace prefix (negative)', async () => {
    const { error } = await b.storage
      .from('workspace-documents')
      .upload(`${workspaceA}/intruder.txt`, content, { upsert: false });
    expect(error).not.toBeNull();
  });

  it('non-members cannot download another workspace object (negative)', async () => {
    const { data, error } = await b.storage
      .from('workspace-documents')
      .download(`${workspaceA}/smoke-test.txt`);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('non-members cannot list another workspace prefix (negative)', async () => {
    const { data } = await b.storage.from('workspace-documents').list(workspaceA);
    expect(data ?? []).toHaveLength(0);
  });

  it('non-members cannot mint signed URLs for another workspace object (negative)', async () => {
    const { data, error } = await b.storage
      .from('workspace-documents')
      .createSignedUrl(`${workspaceA}/smoke-test.txt`, 60);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('unauthenticated clients cannot download (negative)', async () => {
    const anon = anonClient();
    const { data, error } = await anon.storage
      .from('workspace-documents')
      .download(`${workspaceA}/smoke-test.txt`);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('members download their own objects', async () => {
    const { data, error } = await a.storage
      .from('workspace-documents')
      .download(`${workspaceA}/smoke-test.txt`);
    expect(error).toBeNull();
    expect(await data!.text()).toContain('synthetic fixture placeholder');
  });

  it('cleans up test object (member delete allowed)', async () => {
    const { error } = await a.storage
      .from('workspace-documents')
      .remove([`${workspaceA}/smoke-test.txt`]);
    expect(error).toBeNull();
  });
});

describe('cross-user workspace B sanity', () => {
  it('B sees only workspace B', async () => {
    const { data } = await b.from('workspaces').select('id');
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(workspaceB);
    expect(ids).not.toContain(workspaceA);
  });
});
