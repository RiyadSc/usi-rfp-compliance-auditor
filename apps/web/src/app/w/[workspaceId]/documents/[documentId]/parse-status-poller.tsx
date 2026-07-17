'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Poll while parse_status is accepted/parsing. */
export function ParseStatusPoller() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [router]);
  return (
    <p aria-live="polite" className="mb-4 text-sm text-slate-700">
      Processing asynchronously… this page refreshes automatically.
    </p>
  );
}
