import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { requirementRegisterResponseSchema } from '../../apps/web/src/lib/requirements/register-contract';

const sql = readFileSync(
  'supabase/migrations/20260729000052_requirement_register_pagination.sql',
  'utf8',
).toLowerCase();
const phase4Schema = readFileSync(
  'supabase/migrations/20260717000011_phase4_verification.sql',
  'utf8',
).toLowerCase();
const page = readFileSync('apps/web/src/app/w/[workspaceId]/requirements/page.tsx', 'utf8');

describe('bounded requirement register', () => {
  it('starts from one authoritative workspace and verification scope', () => {
    expect(sql).toContain('create or replace function public.get_requirement_register_v1');
    expect(sql).toContain('verification.id=p_verification_run_id');
    expect(sql).toContain('verification.workspace_id=p_workspace_id');
    expect(sql).toContain("verification.status='completed'");
    expect(sql).toContain('candidate.workspace_id=p_workspace_id');
    expect(sql).toContain('candidate.analysis_run_id=v_analysis_run_id');
    expect(sql).toContain('finding.verification_run_id=p_verification_run_id');
    expect(sql).toContain('decision.workspace_id=p_workspace_id');
    expect(sql).toContain('document.workspace_id=p_workspace_id');
    expect(phase4Schema).toContain('unique (verification_run_id, candidate_id)');
  });

  it('validates filters and returns only a bounded stable page', () => {
    expect(sql).toContain('p_page_size not between 1 and 50');
    expect(sql).toContain('limit p_page_size');
    expect(sql).toContain('offset ((p_page-1)*p_page_size)');
    expect(sql).toContain('order by item.created_at desc,item.id');
    expect(sql).toContain("'total',(select count(*) from filtered)");
    expect(sql).toContain("'rows',coalesce");
    expect(sql).toContain('where finding_id is null');
    expect(sql).toContain("where human_review_status='pending'");
  });

  it('keeps the page off unbounded candidate-id lists', () => {
    expect(page).not.toContain(".in('candidate_id', candidateIds)");
    expect(page).not.toContain(".in('finding_id', findingIds)");
    expect(page).toContain('loadRequirementRegister');
    expect(page).toContain('Requirement pages');
  });

  it('rejects oversized response pages at the application boundary', () => {
    const row = {
      id: crypto.randomUUID(),
      analysisRunId: crypto.randomUUID(),
      category: 'mandatory_form',
      title: 'Form',
      obligation: 'Submit form.',
      mandatoryClass: 'mandatory',
      preliminaryPage: 1,
      documentId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      documentName: 'rfp.pdf',
      findingId: null,
      sourceSupportStatus: null,
      precedenceStatus: null,
      proofRequirement: null,
      findingCreatedAt: null,
      verificationRunId: null,
      humanReviewStatus: 'pending',
    };
    const payload = {
      version: 'requirement-register-query-v1',
      page: 1,
      pageSize: 50,
      total: 51,
      summary: {
        totalRequirements: 51,
        needsAttention: 0,
        companyEvidenceRequired: 0,
        pendingReviews: 0,
      },
      categories: ['mandatory_form'],
      rows: Array.from({ length: 51 }, () => row),
    };
    expect(requirementRegisterResponseSchema.safeParse(payload).success).toBe(false);
  });
});
