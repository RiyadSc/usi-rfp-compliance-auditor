'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GLOBAL_NAVIGATION, ROLE_VIEWS, ROLE_VIEW_LABELS, type RoleView } from '@/lib/ux-contract';
import { BrandLockup } from '@/components/brand';
import { IconSearch } from '@/components/icons';

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [roleView, setRoleView] = useState<RoleView>('director');

  useEffect(() => {
    const stored = window.localStorage.getItem('rfp-role-view');
    const initial: RoleView =
      stored === 'proposal-manager' || stored === 'contributor' || stored === 'technical'
        ? stored
        : 'director';
    setRoleView(initial);
    document.documentElement.dataset.roleView = initial;
    document.documentElement.dataset.viewMode = initial === 'technical' ? 'analyst' : 'executive';
  }, []);

  function choose(next: RoleView) {
    setRoleView(next);
    window.localStorage.setItem('rfp-role-view', next);
    document.documentElement.dataset.roleView = next;
    document.documentElement.dataset.viewMode = next === 'technical' ? 'analyst' : 'executive';
  }

  function submitSearch(formData: FormData) {
    const query = String(formData.get('q') ?? '').trim();
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="app-header" data-testid="app-header">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3 lg:px-10">
        <Link href="/" className="mr-2 rounded-sm">
          <BrandLockup />
        </Link>
        <nav
          aria-label="Global navigation"
          className="order-3 w-full overflow-x-auto lg:order-none lg:w-auto lg:flex-1"
        >
          <ul className="flex min-w-max gap-1">
            {GLOBAL_NAVIGATION.map((item) => {
              const view = searchParams.get('view');
              const active =
                item.href === '/'
                  ? pathname === '/' && view !== 'opportunities'
                  : item.href === '/opportunities'
                    ? pathname.startsWith('/w/') ||
                      pathname === '/opportunities' ||
                      (pathname === '/' && view === 'opportunities')
                    : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`global-nav-link ${active ? 'global-nav-link-active' : ''}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <form action={submitSearch} role="search" className="hidden items-center gap-2 xl:flex">
          <label htmlFor="global-search" className="sr-only">
            Search this account
          </label>
          <div className="search-field w-64">
            <IconSearch size={16} />
            <input
              id="global-search"
              name="q"
              defaultValue={pathname === '/search' ? (searchParams.get('q') ?? '') : ''}
              placeholder="Search opportunities and work"
            />
          </div>
        </form>
        <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
          <span className="hidden sm:inline">View for</span>
          <select
            aria-label="Role view"
            value={roleView}
            onChange={(event) => choose(event.target.value as RoleView)}
            className="w-auto min-w-[9.5rem]"
          >
            {ROLE_VIEWS.map((role) => (
              <option key={role} value={role}>
                {ROLE_VIEW_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="sr-only" aria-live="polite">
        {ROLE_VIEW_LABELS[roleView]} presentation selected. Access permissions are unchanged.
      </p>
    </header>
  );
}
