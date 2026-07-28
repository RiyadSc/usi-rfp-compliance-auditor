import { readFileSync } from 'node:fs';
import {
  firstRunTour,
  stakeholderDemoTour,
  validateGuidedTourDefinition,
  type GuidedTourDefinition,
} from '../../apps/web/src/lib/guided-tour/definitions';

export const GUIDED_TOUR_READINESS_VERSION = 'guided-tour-readiness-v1' as const;

const routeSources: Record<string, string[]> = {
  '/w/:workspaceId': [
    'apps/web/src/app/w/[workspaceId]/page.tsx',
    'apps/web/src/components/workspace-navigation.tsx',
  ],
  '/w/:workspaceId/phase9': [
    'apps/web/src/app/w/[workspaceId]/phase9/page.tsx',
    'apps/web/src/app/w/[workspaceId]/phase9/review-queue.tsx',
    'apps/web/src/app/w/[workspaceId]/phase9/finding-review-controls.tsx',
  ],
  '/w/:workspaceId/phase9?lane=routine': [
    'apps/web/src/app/w/[workspaceId]/phase9/review-queue.tsx',
  ],
  '/w/:workspaceId/checklist': ['apps/web/src/app/w/[workspaceId]/checklist/page.tsx'],
  '/w/:workspaceId/proposal-audit': ['apps/web/src/app/w/[workspaceId]/proposal-audit/page.tsx'],
  '/w/:workspaceId/reports': ['apps/web/src/app/w/[workspaceId]/reports/page.tsx'],
};

export const EXPECTED_STAKEHOLDER_DEMO_STEP_IDS = [
  'opportunity-overview',
  'immediate-bid-risks',
  'review-progress',
  'critical-queue',
  'evidence-backed-finding',
  'original-source-evidence',
  'human-decision',
  'accelerated-routine-review',
  'coverage-exceptions',
  'controlled-publication',
  'submission-checklist',
  'proposal-review',
  'readiness-report',
  'closing-value',
] as const;

export type GuidedTourStaticReadiness = {
  version: typeof GUIDED_TOUR_READINESS_VERSION;
  providerRequired: false;
  checks: {
    definitionsValid: boolean;
    stakeholderStepSequenceValid: boolean;
    requiredRoutesAvailable: boolean;
    requiredTargetsAvailable: boolean;
    sourcePageViewerTargetAvailable: boolean;
    protectedActionAutomationAbsent: boolean;
  };
  missingRoutes: string[];
  missingTargets: string[];
  prohibitedAutomationMatches: string[];
  passed: boolean;
};

function routeKey(route: string): string {
  return route.replace(/([?&])[^/]*/, '');
}

function sourceContainsTarget(source: string, targetKey: string): boolean {
  const escaped = targetKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`data-tour-target[\\s\\S]{0,600}['"\`]${escaped}['"\`]`, 'm').test(source);
}

function loadSources(paths: string[], read: (path: string) => string): string {
  return paths.map((path) => read(path)).join('\n');
}

function validateTourTargets(
  definitions: GuidedTourDefinition[],
  read: (path: string) => string,
): {
  missingRoutes: string[];
  missingTargets: string[];
} {
  const missingRoutes = new Set<string>();
  const missingTargets = new Set<string>();
  for (const definition of definitions)
    for (const step of definition.steps) {
      const exactSources = routeSources[step.route];
      const baseSources = routeSources[routeKey(step.route)];
      const paths = exactSources ?? baseSources;
      if (!paths) {
        missingRoutes.add(step.route);
        continue;
      }
      let source = '';
      try {
        source = loadSources(paths, read);
      } catch {
        missingRoutes.add(step.route);
        continue;
      }
      if (!sourceContainsTarget(source, step.targetKey))
        missingTargets.add(`${definition.id}:${step.id}:${step.targetKey}`);
    }
  return {
    missingRoutes: [...missingRoutes].sort(),
    missingTargets: [...missingTargets].sort(),
  };
}

export function evaluateGuidedTourStaticReadiness(input?: {
  readSource?: (path: string) => string;
  definitions?: GuidedTourDefinition[];
}): GuidedTourStaticReadiness {
  const read = input?.readSource ?? ((path: string) => readFileSync(path, 'utf8'));
  const definitions = input?.definitions ?? [firstRunTour, stakeholderDemoTour];
  const definitionErrors = definitions.flatMap((definition) =>
    validateGuidedTourDefinition(definition),
  );
  const targetResult = validateTourTargets(definitions, read);
  const stakeholderStepSequenceValid =
    stakeholderDemoTour.steps.length === EXPECTED_STAKEHOLDER_DEMO_STEP_IDS.length &&
    stakeholderDemoTour.steps.every(
      (step, index) => step.id === EXPECTED_STAKEHOLDER_DEMO_STEP_IDS[index],
    );
  let sourcePageViewerTargetAvailable = false;
  try {
    sourcePageViewerTargetAvailable = sourceContainsTarget(
      read('apps/web/src/app/w/[workspaceId]/documents/[documentId]/page-viewer.tsx'),
      'source-page-viewer',
    );
  } catch {
    sourcePageViewerTargetAvailable = false;
  }
  const tourSource = loadSources(
    [
      'apps/web/src/lib/guided-tour/definitions.ts',
      'apps/web/src/lib/guided-tour/state.ts',
      'apps/web/src/components/guided-tour/workspace-guided-tour.tsx',
    ],
    read,
  );
  const prohibitedAutomation = [
    /auto(?:matically)?[_ -]?(?:accept|reject|publish|approve|assign|upload)/gi,
    /recordPhase9FindingReviewAction\s*\(/g,
    /publishPhase9ReviewedFindingsAction\s*\(/g,
  ];
  const prohibitedAutomationMatches = prohibitedAutomation.flatMap(
    (pattern) => tourSource.match(pattern) ?? [],
  );
  const checks = {
    definitionsValid: definitionErrors.length === 0,
    stakeholderStepSequenceValid,
    requiredRoutesAvailable: targetResult.missingRoutes.length === 0,
    requiredTargetsAvailable: targetResult.missingTargets.length === 0,
    sourcePageViewerTargetAvailable,
    protectedActionAutomationAbsent: prohibitedAutomationMatches.length === 0,
  };
  return {
    version: GUIDED_TOUR_READINESS_VERSION,
    providerRequired: false,
    checks,
    missingRoutes: targetResult.missingRoutes,
    missingTargets: targetResult.missingTargets,
    prohibitedAutomationMatches,
    passed: Object.values(checks).every(Boolean),
  };
}
