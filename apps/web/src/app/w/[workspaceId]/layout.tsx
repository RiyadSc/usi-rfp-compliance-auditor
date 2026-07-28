import type { ReactNode } from 'react';
import { WorkspaceGuidedTour } from '@/components/guided-tour/workspace-guided-tour';
import { FIRST_RUN_TOUR_ID, GUIDED_PRODUCT_TOUR_VERSION } from '@/lib/guided-tour/definitions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type PersistedTourState = {
  status: 'started' | 'completed' | 'dismissed';
  last_completed_step: number;
} | null;

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let demoEligible = false;
  let onboardingState: PersistedTourState = null;
  if (user) {
    const [scopeResult, stateResult] = await Promise.all([
      supabase
        .from('phase8_demo_scopes')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('synthetic_marker', 'phase8-synthetic-demo-only')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('guided_tour_states')
        .select('status,last_completed_step')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .eq('tour_id', FIRST_RUN_TOUR_ID)
        .eq('tour_version', GUIDED_PRODUCT_TOUR_VERSION)
        .maybeSingle(),
    ]);
    demoEligible = Boolean(scopeResult.data);
    onboardingState = (stateResult.data as PersistedTourState) ?? null;
  }

  return (
    <WorkspaceGuidedTour
      workspaceId={workspaceId}
      demoEligible={demoEligible}
      initialOnboardingState={onboardingState}
    >
      {children}
    </WorkspaceGuidedTour>
  );
}
