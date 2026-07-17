'use server';

import { redirect } from 'next/navigation';
import { workspaceCreateSchema } from '@usi/domain';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function createWorkspace(formData: FormData) {
  const parsed = workspaceCreateSchema.safeParse({
    name: formData.get('name') ?? '',
    customer: formData.get('customer') ?? '',
    deadline: formData.get('deadline') ?? '',
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) {
    redirect('/?error=invalid');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // RLS enforces owner_id = auth.uid(); the trigger enrolls the creator
  // as owner member. This insert runs as the signed-in user, never as a
  // privileged role.
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .insert({
      name: parsed.data.name,
      customer: parsed.data.customer ?? null,
      deadline: parsed.data.deadline ?? null,
      description: parsed.data.description ?? null,
      owner_id: user.id,
    })
    .select('id')
    .single();

  if (error || !workspace) {
    redirect('/?error=create_failed');
  }

  await supabase.rpc('record_audit_event', {
    p_workspace_id: workspace.id,
    p_event_type: 'workspace_created',
    p_entity_type: 'workspace',
    p_entity_id: workspace.id,
    p_payload: { name: parsed.data.name },
  });

  redirect(`/w/${workspace.id}`);
}
