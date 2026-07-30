import 'server-only';

import type { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  requirementRegisterResponseSchema,
  type RequirementRegisterResponse,
} from './register-contract';

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadRequirementRegister(
  supabase: ServerSupabaseClient,
  input: {
    workspaceId: string;
    verificationRunId: string;
    sourceStatus: string;
    precedenceStatus: string;
    proofRequirement: string;
    category: string;
    mandatoryClass: string;
    reviewStatus: string;
    search: string;
    attentionOnly: boolean;
    page: number;
    pageSize?: number;
  },
): Promise<RequirementRegisterResponse> {
  const { data, error } = await supabase.rpc('get_requirement_register_v1', {
    p_workspace_id: input.workspaceId,
    p_verification_run_id: input.verificationRunId,
    p_source_status: input.sourceStatus,
    p_precedence_status: input.precedenceStatus,
    p_proof_requirement: input.proofRequirement,
    p_category: input.category,
    p_mandatory_class: input.mandatoryClass,
    p_review_status: input.reviewStatus,
    p_search: input.search,
    p_attention_only: input.attentionOnly,
    p_page: input.page,
    p_page_size: input.pageSize ?? 50,
  });
  if (error) throw new Error(`requirement_register_query_failed:${error.message}`);
  return requirementRegisterResponseSchema.parse(data);
}

export function emptyRequirementRegister(page = 1, pageSize = 50): RequirementRegisterResponse {
  return {
    version: 'requirement-register-query-v1',
    page,
    pageSize,
    total: 0,
    summary: {
      totalRequirements: 0,
      needsAttention: 0,
      companyEvidenceRequired: 0,
      pendingReviews: 0,
    },
    categories: [],
    rows: [],
  };
}
