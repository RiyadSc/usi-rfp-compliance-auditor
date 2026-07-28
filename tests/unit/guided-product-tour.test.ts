import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_TOUR_ID,
  GUIDED_PRODUCT_TOUR_VERSION,
  STAKEHOLDER_DEMO_TOUR_ID,
  firstRunTour,
  resolveGuidedTourRoute,
  stakeholderDemoTour,
  validateGuidedTourDefinition,
  type GuidedTourDefinition,
} from '../../apps/web/src/lib/guided-tour/definitions';
import {
  guidedTourReducer,
  initialGuidedTourState,
} from '../../apps/web/src/lib/guided-tour/state';
import {
  placeTourPanel,
  tourConnectorPoints,
  tourScrollBehavior,
} from '../../apps/web/src/lib/guided-tour/geometry';

const mutate = (
  change: (definition: {
    id: string;
    version: string;
    audience: string;
    demoOnly: boolean;
    steps: Array<Record<string, unknown>>;
  }) => void,
) => {
  const definition = structuredClone(firstRunTour) as unknown as {
    id: string;
    version: string;
    audience: string;
    demoOnly: boolean;
    steps: Array<Record<string, unknown>>;
  };
  change(definition);
  return definition as unknown as GuidedTourDefinition;
};

describe('guided product tour definitions', () => {
  it('keeps first-run and stakeholder tours versioned and separate', () => {
    expect(firstRunTour.id).toBe(FIRST_RUN_TOUR_ID);
    expect(stakeholderDemoTour.id).toBe(STAKEHOLDER_DEMO_TOUR_ID);
    expect(firstRunTour.version).toBe(GUIDED_PRODUCT_TOUR_VERSION);
    expect(stakeholderDemoTour.version).toBe(GUIDED_PRODUCT_TOUR_VERSION);
    expect(firstRunTour.audience).toBe('first_run');
    expect(stakeholderDemoTour.audience).toBe('stakeholder_demo');
    expect(firstRunTour.steps).toHaveLength(6);
    expect(stakeholderDemoTour.steps).toHaveLength(14);
    expect(validateGuidedTourDefinition(firstRunTour)).toEqual([]);
    expect(validateGuidedTourDefinition(stakeholderDemoTour)).toEqual([]);
  });

  it('uses stable semantic targets and a distinct closing target', () => {
    const targets = stakeholderDemoTour.steps.map((step) => step.targetKey);
    expect(new Set(targets).size).toBe(targets.length);
    expect(targets.at(-1)).toBe('closing-value');
    expect(targets.at(-1)).not.toBe(targets[0]);
    expect(targets.every((target) => /^[a-z0-9-]+$/.test(target))).toBe(true);
  });

  it('rejects duplicate targets, invalid routes, missing text, and invalid ordering', () => {
    expect(
      validateGuidedTourDefinition(
        mutate((definition) => {
          definition.steps[1]!.targetKey = definition.steps[0]!.targetKey;
        }),
      ),
    ).toContain('invalid_or_duplicate_target:opportunity-overview');
    expect(
      validateGuidedTourDefinition(
        mutate((definition) => {
          definition.steps[0]!.route = '/unscoped';
        }),
      ),
    ).toContain('invalid_route:welcome');
    expect(
      validateGuidedTourDefinition(
        mutate((definition) => {
          definition.steps[0]!.text = '';
        }),
      ),
    ).toContain('missing_text:welcome');
    expect(
      validateGuidedTourDefinition(
        mutate((definition) => {
          definition.steps[0]!.order = 9;
        }),
      ),
    ).toContain('invalid_step_order:welcome');
  });

  it('marks every step with explicit required fallback behavior', () => {
    for (const step of [...firstRunTour.steps, ...stakeholderDemoTour.steps])
      expect(['required', 'optional']).toContain(step.fallbackBehavior);
  });

  it('keeps presenter notes out of ordinary onboarding', () => {
    expect(firstRunTour.steps.every((step) => step.presenterNote == null)).toBe(true);
    expect(stakeholderDemoTour.steps.every((step) => Boolean(step.presenterNote))).toBe(true);
  });

  it('resolves only the workspace placeholder in route definitions', () => {
    expect(resolveGuidedTourRoute('/w/:workspaceId/phase9?lane=routine', 'workspace-1')).toBe(
      '/w/workspace-1/phase9?lane=routine',
    );
  });
});

describe('guided product tour state', () => {
  it('supports start, back, next, restart-at-step, and exit', () => {
    let state = guidedTourReducer(initialGuidedTourState, {
      type: 'start',
      definition: stakeholderDemoTour,
      mode: 'demo',
      stepIndex: 4,
    });
    expect(state.status).toBe('active');
    if (state.status === 'idle') throw new Error('tour did not start');
    expect(state.stepIndex).toBe(4);
    state = guidedTourReducer(state, { type: 'next' });
    if (state.status === 'idle') throw new Error('tour exited unexpectedly');
    expect(state.stepIndex).toBe(5);
    state = guidedTourReducer(state, { type: 'back' });
    if (state.status === 'idle') throw new Error('tour exited unexpectedly');
    expect(state.stepIndex).toBe(4);
    state = guidedTourReducer(state, { type: 'exit' });
    expect(state).toEqual({ status: 'idle' });
  });

  it('requires explicit exit confirmation state and allows cancellation', () => {
    let state = guidedTourReducer(initialGuidedTourState, {
      type: 'start',
      definition: firstRunTour,
      mode: 'onboarding',
    });
    state = guidedTourReducer(state, { type: 'request_exit' });
    expect(state.status).toBe('confirming_exit');
    state = guidedTourReducer(state, { type: 'cancel_exit' });
    expect(state.status).toBe('active');
  });

  it('keeps presenter notes demo-only and preserves source-detour state', () => {
    let onboarding = guidedTourReducer(initialGuidedTourState, {
      type: 'start',
      definition: firstRunTour,
      mode: 'onboarding',
    });
    onboarding = guidedTourReducer(onboarding, { type: 'toggle_presenter_notes' });
    if (onboarding.status === 'idle') throw new Error('tour exited unexpectedly');
    expect(onboarding.presenterNotesVisible).toBe(false);

    let demo = guidedTourReducer(initialGuidedTourState, {
      type: 'start',
      definition: stakeholderDemoTour,
      mode: 'demo',
    });
    demo = guidedTourReducer(demo, { type: 'toggle_presenter_notes' });
    demo = guidedTourReducer(demo, { type: 'source_detour', active: true });
    if (demo.status === 'idle') throw new Error('tour exited unexpectedly');
    expect(demo.presenterNotesVisible).toBe(true);
    expect(demo.sourceDetour).toBe(true);
  });

  it('records missing-target fallback state without silently advancing', () => {
    let state = guidedTourReducer(initialGuidedTourState, {
      type: 'start',
      definition: stakeholderDemoTour,
      mode: 'demo',
    });
    state = guidedTourReducer(state, { type: 'missing_target', missing: true });
    if (state.status === 'idle') throw new Error('tour exited unexpectedly');
    expect(state.stepIndex).toBe(0);
    expect(state.missingTarget).toBe(true);
  });
});

describe('guided product tour geometry', () => {
  it('honors a fitting placement and keeps the panel inside the viewport', () => {
    const position = placeTourPanel({
      target: { top: 200, left: 350, width: 200, height: 100 },
      panel: { width: 320, height: 180 },
      viewport: { width: 1_200, height: 800 },
      preferred: 'right',
    });
    expect(position.placement).toBe('right');
    expect(position.left).toBeGreaterThan(550);
    expect(position.top).toBeGreaterThanOrEqual(12);
  });

  it('falls back responsively and produces an arrow endpoint on the target', () => {
    const position = placeTourPanel({
      target: { top: 600, left: 900, width: 200, height: 100 },
      panel: { width: 360, height: 220 },
      viewport: { width: 1_200, height: 800 },
      preferred: 'bottom',
    });
    expect(position.placement).not.toBe('bottom');
    const connector = tourConnectorPoints({
      target: { top: 600, left: 900, width: 200, height: 100 },
      panel: { ...position, width: 360, height: 220 },
      placement: position.placement,
    });
    expect(connector.end).toEqual({ x: 1_000, y: 650 });
  });

  it('turns off smooth scrolling for reduced-motion users', () => {
    expect(tourScrollBehavior(true)).toBe('auto');
    expect(tourScrollBehavior(false)).toBe('smooth');
  });
});
