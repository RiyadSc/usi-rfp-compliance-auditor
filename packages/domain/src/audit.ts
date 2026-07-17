import { z } from 'zod';

/**
 * Allowlist of audit event types. The database function record_audit_event
 * enforces the same list (kept in sync by integration test).
 * Audit events are immutable: no update/delete path exists (DB trigger).
 */
export const AUDIT_EVENT_TYPES = [
  'workspace_created',
  'workspace_updated',
  'workspace_archived',
  'document_uploaded',
  'document_deleted',
  'analysis_started',
  'analysis_completed',
  'analysis_failed',
  'requirement_reviewed',
  'checklist_item_updated',
  'finding_resolved',
  'export_generated',
  'demo_reset',
] as const;

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;
