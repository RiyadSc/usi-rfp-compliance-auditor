export const BUSINESS_TERMINOLOGY_VERSION = 'business-terminology-v2';

export const businessLabels: Record<string, string> = {
  supported: 'Backed by the RFP',
  partially_supported: 'Partially backed by the RFP',
  unsupported: 'Not found in the RFP',
  contradicted: 'Conflicts with the RFP',
  parser_uncertain: 'Document needs manual review',
  active: 'Current requirement',
  superseded: 'Replaced by an addendum',
  conflicting: 'Conflicting source instructions',
  undetermined: 'Current version needs review',
  none_identified: 'No additional proof identified',
  requires_human_confirmation: 'Team confirmation needed',
  requires_company_artifact: 'Company document needed',
  requires_external_validation: 'External validation needed',
  pending: 'Team review pending',
  accepted: 'Source assessment accepted',
  rejected: 'Source assessment disputed',
  needs_follow_up: 'Follow-up needed',
  waived: 'Review waived',
  mandatory: 'Mandatory',
  optional: 'Optional',
  uncertain: 'Needs review',
  not_started: 'Not started',
  in_progress: 'In progress',
  ready_for_review: 'Ready for team review',
  completed: 'Task completed',
  blocked: 'Blocked',
  not_applicable: 'Not applicable',
  requires_human_proof: 'Company evidence needed',
  unresolved: 'Unresolved',
  missing: 'Missing',
  uploaded: 'Uploaded',
  linked: 'Linked',
  pending_review: 'Pending review',
  reviewed: 'Reviewed',
  accepted_by_waiver: 'Accepted by waiver',
  informational: 'Information',
  warning: 'Warning',
  blocking: 'Blocking',
  critical: 'Critical',
  machine_assessment_only: 'Machine-generated',
  primary_rfp: 'Main RFP',
  addendum: 'Addendum',
  attachment: 'RFP attachment',
  proposal_draft: 'Proposal draft',
  required_form: 'Mandatory form',
  mandatory_form: 'Mandatory form',
  source_document: 'RFP source document',
  ready: 'Ready',
  parsed: 'Ready',
  processing: 'Processing',
  failed: 'Needs attention',
};

export const businessDefinitions: Record<string, string> = {
  supported:
    'The cited active source backs the complete material requirement. Human review is still separate.',
  partially_supported:
    'The source backs the central obligation, but a material condition, scope, date, amount, or party differs.',
  active: 'The available source relationships establish that this instruction currently applies.',
  superseded:
    'An explicit amendment replaces this earlier instruction. It remains visible for history.',
  conflicting: 'Authoritative sources disagree and do not establish which instruction controls.',
  requires_company_artifact:
    'The RFP requires a company document such as a certificate, license, or insurance record.',
  pending: 'An authorized person has not yet accepted or disputed the machine assessment.',
  blocked: 'Work that must be resolved before final leadership review.',
};

export function businessLabel(value: string | null | undefined): string {
  if (!value) return 'Not available';
  return (
    businessLabels[value] ??
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replaceAll('_', ' ')
      .replace(/^./, (letter) => letter.toUpperCase())
  );
}

export function eventLabel(value: string): string {
  const overrides: Record<string, string> = {
    workspace_created: 'Opportunity created',
    document_uploaded: 'Document uploaded',
    document_parsed: 'Document ready for review',
    analysis_run_created: 'RFP analysis started',
    analysis_run_completed: 'RFP requirements extracted',
    verification_run_completed: 'Source verification completed',
    checklist_generation_completed: 'Submission plan generated',
    checklist_owner_assigned: 'Checklist owner assigned',
    checklist_status_changed: 'Checklist task updated',
    proposal_audit_completed: 'Proposal draft review completed',
    report_generated: 'Executive report generated',
  };
  return overrides[value] ?? businessLabel(value);
}

export function phaseLabel(value: string): string {
  return (
    {
      phase4: 'RFP requirement review',
      phase5: 'Submission planning',
      phase6: 'Proposal draft review',
    }[value] ?? businessLabel(value)
  );
}

export type Tone = 'neutral' | 'positive' | 'info' | 'warning' | 'danger';

export function statusTone(value: string | null | undefined): Tone {
  if (!value) return 'neutral';
  if (['critical', 'contradicted', 'rejected', 'failed', 'missing', 'blocked'].includes(value))
    return 'danger';
  if (
    [
      'partially_supported',
      'parser_uncertain',
      'conflicting',
      'undetermined',
      'needs_follow_up',
      'unresolved',
      'warning',
      'blocking',
      'pending',
    ].includes(value)
  )
    return 'warning';
  if (
    [
      'requires_company_artifact',
      'requires_external_validation',
      'requires_human_confirmation',
      'requires_human_proof',
      'in_progress',
      'ready_for_review',
      'uploaded',
      'linked',
      'pending_review',
    ].includes(value)
  )
    return 'info';
  if (
    ['supported', 'active', 'accepted', 'completed', 'reviewed', 'ready', 'parsed'].includes(value)
  )
    return 'positive';
  return 'neutral';
}

export function daysUntil(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const deadline = new Date(`${value}T23:59:59`);
  if (Number.isNaN(deadline.valueOf())) return null;
  return Math.ceil((deadline.valueOf() - now.valueOf()) / 86_400_000);
}

export function deadlineLabel(value: string | null | undefined): string {
  const days = daysUntil(value);
  if (days == null) return 'Deadline not set';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
