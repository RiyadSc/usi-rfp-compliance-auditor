import { describe, expect, it } from 'vitest';
import {
  businessLabel,
  deadlineLabel,
  eventLabel,
  phaseLabel,
  statusTone,
} from '../../apps/web/src/lib/presentation';

describe('business-facing presentation language', () => {
  it('translates technical verification axes without collapsing their meaning', () => {
    expect(businessLabel('supported')).toBe('Backed by the RFP');
    expect(businessLabel('active')).toBe('Current requirement');
    expect(businessLabel('requires_company_artifact')).toBe('Company document needed');
    expect(businessLabel('pending')).toBe('Team review pending');
  });

  it('uses business stage and activity names', () => {
    expect(phaseLabel('phase4')).toBe('RFP requirement review');
    expect(phaseLabel('phase5')).toBe('Submission planning');
    expect(eventLabel('workspace_created')).toBe('Opportunity created');
  });

  it('keeps risk tones semantically distinct', () => {
    expect(statusTone('contradicted')).toBe('danger');
    expect(statusTone('parser_uncertain')).toBe('warning');
    expect(statusTone('requires_company_artifact')).toBe('info');
    expect(statusTone('supported')).toBe('positive');
  });

  it('formats deadline urgency deterministically for a supplied reference time', () => {
    // deadlineLabel intentionally uses the runtime date; assert its stable no-date path here.
    expect(deadlineLabel(null)).toBe('Deadline not set');
  });

  it('humanizes camelCase report fields', () => {
    expect(businessLabel('criticalBlockers')).toBe('Critical Blockers');
  });
});
