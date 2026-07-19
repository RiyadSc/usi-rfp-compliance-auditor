import { describe, expect, it } from 'vitest';
import { resolvePhase8Contingency } from '@usi/domain';

const scenarios = [
  'parser_unavailable',
  'verification_unavailable',
  'checklist_unavailable',
  'proposal_audit_unavailable',
  'report_generation_unavailable',
  'signed_download_unavailable',
  'expired_export',
  'revoked_export',
  'network_interruption',
  'browser_refresh',
  'stale_cache',
  'reset_failure',
  'unauthorized_workspace',
] as const;

describe('Phase 8 contingency simulation', () => {
  it('fails every required scenario safely without public storage or fabricated results', () => {
    for (const scenario of scenarios) {
      const result = resolvePhase8Contingency(scenario);
      expect(result.fabricatedResult, scenario).toBe(false);
      expect(result.publicStorage, scenario).toBe(false);
      expect(result.preservesAudit, scenario).toBe(true);
    }
  });

  it('uses fallback only for report generation and preserves explicit stale/denial states', () => {
    expect(resolvePhase8Contingency('report_generation_unavailable')).toMatchObject({
      state: 'fallback',
      mode: 'fallback',
    });
    expect(resolvePhase8Contingency('stale_cache').state).toBe('stale');
    expect(resolvePhase8Contingency('unauthorized_workspace').state).toBe('unauthorized');
    expect(resolvePhase8Contingency('parser_unavailable').state).toBe('parser_uncertain');
  });
});
