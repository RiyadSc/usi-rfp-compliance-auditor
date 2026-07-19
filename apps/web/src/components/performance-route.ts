import type { Phase8PerformanceOperation } from '@usi/domain';

const workspacePath = /^\/w\/([0-9a-f-]{36})(?:\/|$)/i;

export function classifyPhase8PerformanceRoute(pathname: string): {
  workspaceId: string | null;
  operation: Phase8PerformanceOperation | null;
} {
  const workspaceId = pathname.match(workspacePath)?.[1] ?? null;
  if (!workspaceId) return { workspaceId: null, operation: null };
  const suffix = pathname.slice(`/w/${workspaceId}`.length);
  const operation: Phase8PerformanceOperation =
    suffix === ''
      ? 'workspace_load'
      : /^\/documents\/[0-9a-f-]{36}$/i.test(suffix)
        ? 'document_viewer'
        : suffix === '/requirements'
          ? 'requirement_register'
          : /^\/requirements\/[0-9a-f-]{36}$/i.test(suffix)
            ? 'evidence_viewer'
            : suffix.startsWith('/checklist')
              ? 'checklist_render'
              : suffix.startsWith('/proposal-audit')
                ? 'proposal_audit_render'
                : suffix.startsWith('/reports')
                  ? 'report_render'
                  : 'page_load';
  return { workspaceId, operation };
}

export function buildPhase8PerformanceEvents(input: {
  operation: Phase8PerformanceOperation;
  pageDurationMs: number;
  serverDurationMs: number;
}): Array<{ operation: Phase8PerformanceOperation; durationMs: number }> {
  const events: Array<{ operation: Phase8PerformanceOperation; durationMs: number }> = [
    { operation: 'page_load', durationMs: input.pageDurationMs },
    { operation: 'server_response', durationMs: input.serverDurationMs },
  ];
  if (!events.some((event) => event.operation === input.operation))
    events.push({ operation: input.operation, durationMs: input.pageDurationMs });
  return events;
}
