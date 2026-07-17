import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold mb-2">Not found</h1>
      <p className="text-sm text-slate-600 mb-6">
        This page does not exist or you do not have access to it.
      </p>
      <Link href="/" className="text-blue-700 hover:underline text-sm">
        Back to opportunities
      </Link>
    </main>
  );
}
