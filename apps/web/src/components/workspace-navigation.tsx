import Link from 'next/link';
import { AppHeader } from './app-header';

export type WorkspaceStage =
  'overview' | 'documents' | 'phase9' | 'requirements' | 'checklist' | 'proposal-audit' | 'reports';

export const opportunityNavigation = [
  { id: 'overview', label: 'Overview', short: 'Overview', href: '' },
  { id: 'requirements', label: 'Requirements', short: 'Requirements', href: '/requirements' },
  { id: 'checklist', label: 'Submission Checklist', short: 'Checklist', href: '/checklist' },
  { id: 'proposal-audit', label: 'Proposal Review', short: 'Proposal', href: '/proposal-audit' },
  { id: 'documents', label: 'Documents', short: 'Documents', href: '/documents' },
  { id: 'phase9', label: 'Live Analysis', short: 'Analysis', href: '/phase9' },
  { id: 'reports', label: 'Reports', short: 'Reports', href: '/reports' },
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
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link href="/" className="font-medium text-blue-700 hover:underline">
            {current === 'overview' ? '← Opportunities' : 'Opportunities'}
          </Link>
          {current !== 'overview' ? (
            <>
              <span className="mx-2 text-slate-400" aria-hidden="true">
                /
              </span>
              <Link href={`/w/${workspaceId}`} className="text-slate-700 hover:underline">
                {workspaceName}
              </Link>
            </>
          ) : null}
        </nav>
        <Link
          href={`/w/${workspaceId}#activity`}
          className="text-sm text-slate-600 hover:text-blue-800 hover:underline"
        >
          Activity
        </Link>
      </div>
      <nav
        aria-label="Opportunity stages"
        className={`mb-7 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm ${compact ? 'text-sm' : ''}`}
      >
        <ol className="flex min-w-max items-center gap-1">
          {opportunityNavigation.map((stage) => {
            const active = stage.id === current;
            return (
              <li key={stage.id} className="flex items-center">
                <Link
                  href={`/w/${workspaceId}${stage.href}`}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 font-medium ${
                    active
                      ? 'bg-blue-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
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
