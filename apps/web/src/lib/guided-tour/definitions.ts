export const GUIDED_PRODUCT_TOUR_VERSION = 'guided-product-tour-v1' as const;

export type GuidedTourAudience = 'first_run' | 'stakeholder_demo';
export type GuidedTourPlacement = 'top' | 'right' | 'bottom' | 'left';
export type GuidedTourInteraction = 'informational' | 'open_source' | 'manual_business_action';
export type GuidedTourFallback = 'required' | 'optional';

export type GuidedTourStep = {
  id: string;
  order: number;
  route: string;
  targetKey: string;
  title: string;
  text: string;
  preferredPlacement: GuidedTourPlacement;
  interactionRequirement: GuidedTourInteraction;
  precondition?: 'target_available';
  completionCondition?: 'manual_next' | 'source_opened' | 'business_action_observed';
  fallbackBehavior: GuidedTourFallback;
  presenterNote?: string;
};

export type GuidedTourDefinition = {
  id: string;
  version: typeof GUIDED_PRODUCT_TOUR_VERSION;
  audience: GuidedTourAudience;
  demoOnly: boolean;
  steps: readonly GuidedTourStep[];
};

export const FIRST_RUN_TOUR_ID = 'first-run-rfp-review';
export const STAKEHOLDER_DEMO_TOUR_ID = 'stakeholder-demo';

export const firstRunTour: GuidedTourDefinition = {
  id: FIRST_RUN_TOUR_ID,
  version: GUIDED_PRODUCT_TOUR_VERSION,
  audience: 'first_run',
  demoOnly: true,
  steps: [
    {
      id: 'welcome',
      order: 1,
      route: '/w/:workspaceId',
      targetKey: 'opportunity-overview',
      title: 'Your bid command center',
      text: 'See what needs attention, how the review is progressing, and the next useful action for the team.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      precondition: 'target_available',
      completionCondition: 'manual_next',
      fallbackBehavior: 'required',
    },
    {
      id: 'navigation',
      order: 2,
      route: '/w/:workspaceId',
      targetKey: 'opportunity-navigation',
      title: 'Follow the response workflow',
      text: 'Move from source documents to reviewed requirements, submission work, proposal review, and leadership reporting.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      precondition: 'target_available',
      completionCondition: 'manual_next',
      fallbackBehavior: 'required',
    },
    {
      id: 'urgent-work',
      order: 3,
      route: '/w/:workspaceId/phase9',
      targetKey: 'critical-obligations',
      title: 'Start with bid risk',
      text: 'Deadlines, mandatory forms, signatures, insurance, licensing, and submission instructions appear before routine findings.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      precondition: 'target_available',
      completionCondition: 'manual_next',
      fallbackBehavior: 'required',
    },
    {
      id: 'evidence',
      order: 4,
      route: '/w/:workspaceId/phase9',
      targetKey: 'source-evidence',
      title: 'Verify the source',
      text: 'Every finding links to the exact quotation and original source location, so the team can check the wording directly.',
      preferredPlacement: 'left',
      interactionRequirement: 'informational',
      precondition: 'target_available',
      completionCondition: 'manual_next',
      fallbackBehavior: 'required',
    },
    {
      id: 'human-control',
      order: 5,
      route: '/w/:workspaceId/phase9',
      targetKey: 'review-decision',
      title: 'Your team decides',
      text: 'The system suggests a source reading. A person accepts it, disputes it, or marks it for follow-up.',
      preferredPlacement: 'left',
      interactionRequirement: 'informational',
      precondition: 'target_available',
      completionCondition: 'manual_next',
      fallbackBehavior: 'required',
    },
    {
      id: 'next-action',
      order: 6,
      route: '/w/:workspaceId',
      targetKey: 'next-recommended-action',
      title: 'Keep the team moving',
      text: 'This recommendation points to the most useful next step without claiming the bid is ready for submission.',
      preferredPlacement: 'right',
      interactionRequirement: 'informational',
      precondition: 'target_available',
      completionCondition: 'manual_next',
      fallbackBehavior: 'required',
    },
  ],
};

export const stakeholderDemoTour: GuidedTourDefinition = {
  id: STAKEHOLDER_DEMO_TOUR_ID,
  version: GUIDED_PRODUCT_TOUR_VERSION,
  audience: 'stakeholder_demo',
  demoOnly: true,
  steps: [
    {
      id: 'opportunity-overview',
      order: 1,
      route: '/w/:workspaceId',
      targetKey: 'opportunity-overview',
      title: 'The bid command center',
      text: 'This view shows what needs attention, where review stands, and the next action the team should take.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Ask whether this is the information leadership needs first.',
    },
    {
      id: 'immediate-bid-risks',
      order: 2,
      route: '/w/:workspaceId/phase9',
      targetKey: 'critical-obligations',
      title: 'Immediate bid risks',
      text: 'Deadlines, required forms, signatures, insurance, licensing, and other submission-critical items appear first.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Emphasize that the experience does not lead with a raw finding count.',
    },
    {
      id: 'review-progress',
      order: 3,
      route: '/w/:workspaceId/phase9',
      targetKey: 'review-progress',
      title: 'Know what remains',
      text: 'Machine findings, team decisions, published requirements, and remaining work stay separate and visible.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Point out the effort estimate and the remaining individual decisions.',
    },
    {
      id: 'critical-queue',
      order: 4,
      route: '/w/:workspaceId/phase9',
      targetKey: 'critical-review-lane',
      title: 'Critical items get individual review',
      text: 'High-impact requirements cannot be accepted through a bulk action. A person reviews each one.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Emphasize that critical findings can never be batch accepted.',
    },
    {
      id: 'evidence-backed-finding',
      order: 5,
      route: '/w/:workspaceId/phase9',
      targetKey: 'evidence-backed-finding',
      title: 'Understand the finding',
      text: 'The requirement, its business category, review reason, and source location are visible together.',
      preferredPlacement: 'left',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Use the prepared mandatory form or deadline example.',
    },
    {
      id: 'original-source-evidence',
      order: 6,
      route: '/w/:workspaceId/phase9',
      targetKey: 'source-evidence',
      title: 'Open the original source',
      text: 'Check the exact wording on the original page rather than relying on a machine summary.',
      preferredPlacement: 'left',
      interactionRequirement: 'open_source',
      completionCondition: 'source_opened',
      fallbackBehavior: 'required',
      presenterNote: 'Open the source page, then return to the same tour step.',
    },
    {
      id: 'human-decision',
      order: 7,
      route: '/w/:workspaceId/phase9',
      targetKey: 'review-decision',
      title: 'The system suggests; your team decides',
      text: 'Accept, dispute, or request follow-up. The tour never records a decision automatically.',
      preferredPlacement: 'left',
      interactionRequirement: 'manual_business_action',
      completionCondition: 'business_action_observed',
      fallbackBehavior: 'required',
      presenterNote: 'The presenter may record the prepared decision manually.',
    },
    {
      id: 'accelerated-routine-review',
      order: 8,
      route: '/w/:workspaceId/phase9?lane=routine',
      targetKey: 'batch-review',
      title: 'Review routine items together',
      text: 'Clean, evidence-valid routine findings can be selected together. Critical or uncertain items stay excluded.',
      preferredPlacement: 'top',
      interactionRequirement: 'manual_business_action',
      completionCondition: 'business_action_observed',
      fallbackBehavior: 'required',
      presenterNote: 'Show the exact selection count before confirming the batch.',
    },
    {
      id: 'coverage-exceptions',
      order: 9,
      route: '/w/:workspaceId/phase9',
      targetKey: 'coverage-exceptions',
      title: 'Possible omissions stay visible',
      text: 'Pages with parser issues, unassessed signals, or missing coverage remain open until someone checks them.',
      preferredPlacement: 'top',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Do not claim complete recall; explain the page-level exception queue.',
    },
    {
      id: 'controlled-publication',
      order: 10,
      route: '/w/:workspaceId/phase9',
      targetKey: 'publication-gate',
      title: 'Publication stays controlled',
      text: 'Requirements cannot enter operational work until every required finding and page exception has a team decision.',
      preferredPlacement: 'top',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Publication is owner-controlled and remains fail closed.',
    },
    {
      id: 'submission-checklist',
      order: 11,
      route: '/w/:workspaceId/checklist',
      targetKey: 'submission-checklist',
      title: 'Turn accepted requirements into work',
      text: 'Accepted requirements become assignable tasks with owners, due dates, required evidence, and blockers.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Ask how the team currently assigns ownership for required forms.',
    },
    {
      id: 'proposal-review',
      order: 12,
      route: '/w/:workspaceId/proposal-audit',
      targetKey: 'proposal-audit',
      title: 'Check the proposal draft',
      text: 'Compare the draft with the solicitation to surface missing answers, conflicting values, and unsupported claims.',
      preferredPlacement: 'bottom',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Open the prepared deadline or insurance issue if time allows.',
    },
    {
      id: 'readiness-report',
      order: 13,
      route: '/w/:workspaceId/reports',
      targetKey: 'readiness-report',
      title: 'Prepare leadership review',
      text: 'Leadership sees outstanding risks and supporting evidence. The report supports judgment; it does not authorize submission.',
      preferredPlacement: 'top',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Do not describe this as approval or proof of complete recall.',
    },
    {
      id: 'closing-value',
      order: 14,
      route: '/w/:workspaceId',
      targetKey: 'closing-value',
      title: 'Reach a trusted submission plan faster',
      text: 'Reduce review time while preserving source evidence, unresolved issues, and human control over every decision.',
      preferredPlacement: 'left',
      interactionRequirement: 'informational',
      fallbackBehavior: 'required',
      presenterNote: 'Close on time saved with evidence and human accountability intact.',
    },
  ],
};

export const guidedTours = [firstRunTour, stakeholderDemoTour] as const;

export function resolveGuidedTourRoute(route: string, workspaceId: string) {
  return route.replace(':workspaceId', workspaceId);
}

export function validateGuidedTourDefinition(definition: GuidedTourDefinition): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9-]+$/.test(definition.id)) errors.push('invalid_tour_id');
  if (definition.version !== GUIDED_PRODUCT_TOUR_VERSION) errors.push('invalid_tour_version');
  if (!definition.steps.length) errors.push('tour_requires_steps');
  const ids = new Set<string>();
  const targets = new Set<string>();
  definition.steps.forEach((step, index) => {
    if (step.order !== index + 1) errors.push(`invalid_step_order:${step.id}`);
    if (!/^[a-z0-9-]+$/.test(step.id) || ids.has(step.id))
      errors.push(`invalid_or_duplicate_step_id:${step.id}`);
    if (!/^[a-z0-9-]+$/.test(step.targetKey) || targets.has(step.targetKey))
      errors.push(`invalid_or_duplicate_target:${step.targetKey}`);
    if (!step.route.startsWith('/w/:workspaceId')) errors.push(`invalid_route:${step.id}`);
    if (!step.title.trim() || !step.text.trim()) errors.push(`missing_text:${step.id}`);
    if (step.text.trim().split(/\s+/).length > 50) errors.push(`text_too_long:${step.id}`);
    ids.add(step.id);
    targets.add(step.targetKey);
  });
  return errors;
}

for (const definition of guidedTours) {
  const errors = validateGuidedTourDefinition(definition);
  if (errors.length) throw new Error(`invalid_guided_tour:${definition.id}:${errors.join(',')}`);
}
