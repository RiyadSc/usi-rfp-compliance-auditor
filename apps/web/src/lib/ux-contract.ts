export const ROLE_BASED_UX_VERSION = 'role-based-ux-v1';

export const GLOBAL_NAVIGATION = [
  { href: '/', label: 'Home' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/my-work', label: 'My Work' },
  { href: '/reports', label: 'Reports' },
  { href: '/search', label: 'Search' },
] as const;

export const ROLE_VIEWS = ['director', 'proposal-manager', 'contributor', 'technical'] as const;
export type RoleView = (typeof ROLE_VIEWS)[number];

export const ROLE_VIEW_LABELS: Record<RoleView, string> = {
  director: 'Director',
  'proposal-manager': 'Proposal manager',
  contributor: 'Contributor',
  technical: 'Technical reviewer',
};

export const OPPORTUNITY_WORKFLOW = [
  { number: 1, kind: 'business', label: 'Create opportunity' },
  { number: 2, kind: 'business', label: 'Collect RFP files' },
  { number: 3, kind: 'processing', label: 'Read and organize documents' },
  { number: 4, kind: 'review', label: 'Review RFP requirements' },
  { number: 5, kind: 'business', label: 'Build submission checklist' },
  { number: 6, kind: 'business', label: 'Assign and complete work' },
  { number: 7, kind: 'review', label: 'Review proposal draft' },
  { number: 8, kind: 'review', label: 'Resolve issues and decisions' },
  { number: 9, kind: 'business', label: 'Prepare final human review' },
] as const;
