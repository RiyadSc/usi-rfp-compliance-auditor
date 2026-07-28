import Link from 'next/link';
import { AppHeader } from './app-header';
import { IconActivity, IconArrowLeft } from './icons';

export type WorkspaceStage =
  'overview' | 'documents' | 'phase9' | 'requirements' | 'checklist' | 'proposal-audit' | 'reports';

export const opportunityNavigation = [
  { id: 'overview', label: 'Overview', short: 'Overview', href: '' },
  { id: 'requirements', label: 'Requirements', short: 'Requirements', href: '/requirements' },
  { id: 'checklist', label: 'Submission Checklist', short: 'Checklist', href: '/checklist' },
  { id: 'proposal-audit', label: 'Proposal Review', short: 'Proposal', href: '/proposal-audit' },
  { id: 'reports', label: 'Final Review', short: 'Review', href: '/reports' },
  { id: 'documents', label: 'Documents', short: 'Files', href: '/documents' },
  { id: 'phase9', label: 'Live Analysis', short: 'Analysis', href: '/phase9' },
] satisfies Array<{ id: WorkspaceStage; label: string; short: string; href: string }>;

export function WorkspaceNavigation({
  workspaceId,
  workspaceName,
  current,
  compact = false,
}: {
  workspaceId: string;
  workspaceName: string;
  current: WorkspaceStage;
  compact?: boolean;
}) {
  return (
    <>
      <AppHeader />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/" className="quiet-link inline-flex items-center gap-1.5 font-medium">
            {current === 'overview' ? (
              <>
                <IconArrowLeft size={14} />
                Opportunities
              </>
            ) : (
              'Opportunities'
            )}
          </Link>
          {current !== 'overview' ? (
            <>
              <span className="text-ink-faint" aria-hidden="true">
                /
              </span>
              <Link href={`/w/${workspaceId}`} className="breadcrumb-current hover:text-ink">
                {workspaceName}
              </Link>
            </>
          ) : null}
        </nav>
        <Link
          href={`/w/${workspaceId}#activity`}
          className="quiet-link inline-flex items-center gap-1.5 text-[0.8125rem]"
        >
          <IconActivity size={15} />
          Activity
        </Link>
      </div>
      <nav
        aria-label="Opportunity stages"
        data-tour-target="opportunity-navigation"
        className={`stage-nav mb-8 ${compact ? 'text-sm' : ''}`}
      >
        <ol className="flex min-w-max items-center gap-1">
          {opportunityNavigation.map((stage) => {
            const active = stage.id === current;
            return (
              <li key={stage.id} className="flex items-center">
                <Link
                  href={`/w/${workspaceId}${stage.href}`}
                  aria-current={active ? 'page' : undefined}
                  className={`stage-nav-item ${active ? 'stage-nav-item-active' : ''}`}
                >
                  <span className="hidden sm:inline">{stage.label}</span>
                  <span className="sm:hidden">{stage.short}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
