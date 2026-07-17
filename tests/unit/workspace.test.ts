import { describe, expect, it } from 'vitest';
import { workspaceCreateSchema } from '../../packages/domain/src/workspace.js';
import { auditEventTypeSchema } from '../../packages/domain/src/audit.js';

describe('workspaceCreateSchema', () => {
  it('accepts a minimal valid workspace', () => {
    const parsed = workspaceCreateSchema.parse({ name: 'City Security RFP' });
    expect(parsed.name).toBe('City Security RFP');
    expect(parsed.customer).toBeUndefined();
  });

  it('trims and rejects too-short names', () => {
    expect(() => workspaceCreateSchema.parse({ name: '  a  ' })).toThrow();
  });

  it('rejects names over 120 characters', () => {
    expect(() => workspaceCreateSchema.parse({ name: 'x'.repeat(121) })).toThrow();
  });

  it('normalizes empty optional fields to undefined', () => {
    const parsed = workspaceCreateSchema.parse({
      name: 'Valid',
      customer: '',
      deadline: '',
      description: '',
    });
    expect(parsed.customer).toBeUndefined();
    expect(parsed.deadline).toBeUndefined();
    expect(parsed.description).toBeUndefined();
  });

  it('accepts ISO deadlines and rejects other formats', () => {
    expect(workspaceCreateSchema.parse({ name: 'Valid', deadline: '2026-08-01' }).deadline).toBe(
      '2026-08-01',
    );
    expect(() => workspaceCreateSchema.parse({ name: 'Valid', deadline: '08/01/2026' })).toThrow();
  });
});

describe('auditEventTypeSchema', () => {
  it('accepts allowlisted event types', () => {
    expect(auditEventTypeSchema.parse('workspace_created')).toBe('workspace_created');
  });

  it('rejects arbitrary event types (no free-form audit fabrication)', () => {
    expect(() => auditEventTypeSchema.parse('made_up_event')).toThrow();
  });
});
