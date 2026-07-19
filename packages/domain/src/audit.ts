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
  'checklist_generated',
  'checklist_regenerated',
  'checklist_item_created',
  'checklist_item_obsoleted',
  'checklist_owner_assigned',
  'checklist_owner_reassigned',
  'checklist_status_changed',
  'checklist_artifact_linked',
  'checklist_artifact_reviewed',
  'checklist_artifact_removed',
  'checklist_waiver_requested',
  'checklist_waiver_decided',
  'checklist_exception_created',
  'checklist_exception_revised',
  'checklist_blocker_created',
  'checklist_blocker_resolved',
  'checklist_blocker_reopened',
  'checklist_readiness_calculated',
  'proposal_draft_registered',
  'proposal_audit_started',
  'proposal_audit_completed',
  'proposal_audit_failed',
  'proposal_finding_created',
  'proposal_finding_resolved',
  'proposal_revision_linked',
  'report_generation_requested',
  'report_generation_completed',
  'report_generation_failed',
  'report_export_csv_created',
  'report_export_html_created',
  'report_export_regenerated',
  'report_export_obsoleted',
  'report_download_url_created',
  'report_export_accessed',
  'report_export_revoked',
  'report_export_permission_denied',
] as const;

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;
