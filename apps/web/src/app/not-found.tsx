import Link from 'next/link';
import { EmptyStateArt } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70svh] w-full max-w-xl place-items-center px-6 py-16">
      <div className="empty-state texture-nodes relative w-full overflow-hidden">
        <div className="relative flex flex-col items-center gap-4">
          <EmptyStateArt />
          <h1 className="empty-state-title text-lg">Not found</h1>
          <p className="empty-state-body">
            This page does not exist or you do not have access to it.
          </p>
          <Link href="/" className="action-link text-sm">
            Back to opportunities
          </Link>
        </div>
      </div>
    </main>
  );
}
