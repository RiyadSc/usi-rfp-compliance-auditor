import { describe, expect, it } from 'vitest';
import { buildPhase8PerformanceEvents, classifyPhase8PerformanceRoute } from './performance-route';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const objectId = '20000000-0000-4000-8000-000000000001';

describe('privacy-safe Phase 8 route classification', () => {
  it.each([
    [`/w/${workspaceId}`, 'workspace_load'],
    [`/w/${workspaceId}/documents/${objectId}`, 'document_viewer'],
    [`/w/${workspaceId}/requirements`, 'requirement_register'],
    [`/w/${workspaceId}/requirements/${objectId}`, 'evidence_viewer'],
    [`/w/${workspaceId}/checklist`, 'checklist_render'],
    [`/w/${workspaceId}/proposal-audit/${objectId}`, 'proposal_audit_render'],
    [`/w/${workspaceId}/reports/${objectId}`, 'report_render'],
  ])('maps %s without retaining its path', (path, operation) => {
    expect(classifyPhase8PerformanceRoute(path)).toEqual({ workspaceId, operation });
  });

  it('does not create scoped telemetry for public or malformed routes', () => {
    expect(classifyPhase8PerformanceRoute('/login')).toEqual({
      workspaceId: null,
      operation: null,
    });
  });

  it('builds one bounded de-duplicated event batch per navigation', () => {
    expect(
      buildPhase8PerformanceEvents({
        operation: 'page_load',
        pageDurationMs: 250,
        serverDurationMs: 100,
      }),
    ).toEqual([
      { operation: 'page_load', durationMs: 250 },
      { operation: 'server_response', durationMs: 100 },
    ]);
    expect(
      buildPhase8PerformanceEvents({
        operation: 'report_render',
        pageDurationMs: 250,
        serverDurationMs: 100,
      }),
    ).toHaveLength(3);
  });
});
