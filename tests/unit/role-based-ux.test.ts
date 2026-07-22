import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TERMINOLOGY_VERSION,
  businessDefinitions,
  businessLabel,
} from '../../apps/web/src/lib/presentation';
import {
  GLOBAL_NAVIGATION,
  OPPORTUNITY_WORKFLOW,
  ROLE_BASED_UX_VERSION,
  ROLE_VIEWS,
} from '../../apps/web/src/lib/ux-contract';

describe('role-based UX contract', () => {
  it('limits global navigation to five business destinations', () => {
    expect(GLOBAL_NAVIGATION.map((item) => item.label)).toEqual([
      'Home',
      'Opportunities',
      'My Work',
      'Reports',
      'Search',
    ]);
    expect(GLOBAL_NAVIGATION).toHaveLength(5);
  });

  it('supports four presentation roles without granting authorization', () => {
    expect(ROLE_VIEWS).toEqual(['director', 'proposal-manager', 'contributor', 'technical']);
    expect(ROLE_BASED_UX_VERSION).toBe('role-based-ux-v1');
  });

  it('keeps the opportunity journey ordered and distinguishes step kinds', () => {
    expect(OPPORTUNITY_WORKFLOW).toHaveLength(9);
    expect(OPPORTUNITY_WORKFLOW.map((step) => step.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(OPPORTUNITY_WORKFLOW.map((step) => step.kind))).toEqual(
      new Set(['business', 'processing', 'review']),
    );
  });

  it('uses versioned plain-language status definitions', () => {
    expect(BUSINESS_TERMINOLOGY_VERSION).toBe('business-terminology-v2');
    expect(businessLabel('supported')).toBe('Backed by the RFP');
    expect(businessDefinitions.supported).toMatch(/Human review is still separate/);
    expect(businessDefinitions.conflicting).toMatch(/do not establish/);
  });
});
