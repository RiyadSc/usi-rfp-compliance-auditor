'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { recordClientPerformanceAction } from '@/app/performance-actions';
import { buildPhase8PerformanceEvents, classifyPhase8PerformanceRoute } from './performance-route';

export function PerformanceBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const route = classifyPhase8PerformanceRoute(pathname);
    if (!route.workspaceId || !route.operation) return;
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const pageDuration = Math.max(0, Math.round(navigation?.duration ?? performance.now()));
    const serverDuration = Math.max(0, Math.round(navigation?.responseStart ?? 0));
    const events = buildPhase8PerformanceEvents({
      operation: route.operation,
      pageDurationMs: pageDuration,
      serverDurationMs: serverDuration,
    });
    // One authenticated action avoids concurrent SSR session-cookie refresh races.
    void recordClientPerformanceAction({ workspaceId: route.workspaceId, events });
  }, [pathname]);
  return null;
}
