import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_STAKEHOLDER_DEMO_STEP_IDS,
  evaluateGuidedTourStaticReadiness,
} from '../../scripts/lib/guided-tour-readiness';

describe('guided product-tour static readiness', () => {
  it('validates the complete 14-step stakeholder sequence without a provider', () => {
    const result = evaluateGuidedTourStaticReadiness();
    expect(EXPECTED_STAKEHOLDER_DEMO_STEP_IDS).toHaveLength(14);
    expect(result.providerRequired).toBe(false);
    expect(result.checks.definitionsValid).toBe(true);
    expect(result.checks.stakeholderStepSequenceValid).toBe(true);
    expect(result.checks.requiredRoutesAvailable).toBe(true);
    expect(result.checks.sourcePageViewerTargetAvailable).toBe(true);
    expect(result.checks.protectedActionAutomationAbsent).toBe(true);
  });

  it('fails closed when a required semantic target is absent', () => {
    const real = (path: string) => {
      const source = readFileSync(path, 'utf8');
      return source.replaceAll('evidence-backed-finding', 'removed-required-target');
    };
    const result = evaluateGuidedTourStaticReadiness({ readSource: real });
    expect(result.passed).toBe(false);
    expect(
      result.missingTargets.some((value) =>
        value.endsWith(':evidence-backed-finding:evidence-backed-finding'),
      ),
    ).toBe(true);
  });

  it('reports a missing route instead of pointing to empty space', () => {
    const result = evaluateGuidedTourStaticReadiness({
      definitions: [
        {
          id: 'missing-route-test',
          version: 'guided-product-tour-v1',
          audience: 'stakeholder_demo',
          demoOnly: true,
          eligibility: {
            workspaceMode: 'prepared_demo_only',
            requiredWorkspaceMarker: 'phase8-synthetic-demo-only',
          },
          steps: [
            {
              id: 'missing',
              order: 1,
              route: '/w/:workspaceId/does-not-exist',
              targetKey: 'missing-target',
              title: 'Missing target',
              text: 'The tour must explain the missing target and let the presenter exit.',
              preferredPlacement: 'bottom',
              interactionRequirement: 'informational',
              fallbackBehavior: 'required',
            },
          ],
        },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.missingRoutes).toEqual(['/w/:workspaceId/does-not-exist']);
  });

  it('reports an optional missing target without failing release readiness', () => {
    const result = evaluateGuidedTourStaticReadiness({
      definitions: [
        {
          id: 'optional-target-test',
          version: 'guided-product-tour-v1',
          audience: 'stakeholder_demo',
          demoOnly: true,
          eligibility: {
            workspaceMode: 'prepared_demo_only',
            requiredWorkspaceMarker: 'phase8-synthetic-demo-only',
          },
          steps: [
            {
              id: 'optional',
              order: 1,
              route: '/w/:workspaceId',
              targetKey: 'optional-target-that-is-not-present',
              title: 'Optional context',
              text: 'This optional context may be unavailable without breaking the prepared tour.',
              preferredPlacement: 'bottom',
              interactionRequirement: 'informational',
              fallbackBehavior: 'optional',
            },
          ],
        },
      ],
    });
    expect(result.missingTargets).toEqual([]);
    expect(result.optionalMissingTargets).toEqual([
      'optional-target-test:optional:optional-target-that-is-not-present',
    ]);
    expect(result.checks.requiredTargetsAvailable).toBe(true);
  });
});
