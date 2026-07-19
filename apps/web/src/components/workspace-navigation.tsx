import Link from 'next/link';
import { ViewModeToggle } from './view-mode-toggle';

export type WorkspaceStage =
  'overview' | 'documents' | 'requirements' | 'checklist' | 'proposal-audit' | 'reports';

const stages: Array<{ id: WorkspaceStage; label: string; short: string; href: string }> = [
  { id: 'overview', label: 'Overview', short: 'Overview', href: '' },
  { id: 'documents', label: 'RFP files', short: 'Files', href: '/documents' },
  { id: 'requirements', label: 'RFP requirements', short: 'Requirements', href: '/requirements' },
  { id: 'checklist', label: 'Submission plan', short: 'Plan', href: '/checklist' },
  { id: 'proposal-audit', label: 'Draft review', short: 'Draft', href: '/proposal-audit' },
  { id: 'reports', label: 'Final review', short: 'Report', href: '/reports' },
];

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
        <ViewModeToggle />
      </div>
      <nav
        aria-label="Opportunity stages"
        className={`mb-7 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm ${compact ? 'text-sm' : ''}`}
      >
        <ol className="flex min-w-max items-center gap-1">
          {stages.map((stage, index) => {
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
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
                      active ? 'bg-white/20' : 'bg-slate-100'
                    }`}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
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
