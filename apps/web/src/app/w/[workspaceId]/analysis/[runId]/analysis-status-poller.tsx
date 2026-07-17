'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AnalysisStatusPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [active, router]);
  if (!active) return null;
  return (
    <p aria-live="polite" className="mb-4 text-sm text-slate-700">
      Extraction running… this page refreshes automatically.
    </p>
  );
}
