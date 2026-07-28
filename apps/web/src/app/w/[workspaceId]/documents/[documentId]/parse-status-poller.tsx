'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EvidenceProcessingMark } from '@/components/brand';

/** Poll while parse_status is accepted/parsing. */
export function ParseStatusPoller() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [router]);
  return (
    <p aria-live="polite" className="notice notice-info mb-4 flex items-center gap-3">
      <EvidenceProcessingMark size={22} />
      <span>Reading the document… this page refreshes automatically.</span>
    </p>
  );
}
