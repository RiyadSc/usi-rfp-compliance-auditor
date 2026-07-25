'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EvidenceProcessingMark } from '@/components/brand';

export function AnalysisStatusPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [active, router]);
  if (!active) return null;
  return (
    <p aria-live="polite" className="notice notice-info mb-4 flex items-center gap-3">
      <EvidenceProcessingMark size={22} />
      <span>Extraction running… this page refreshes automatically.</span>
    </p>
  );
}
