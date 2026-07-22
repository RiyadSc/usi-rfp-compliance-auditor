import { redirect } from 'next/navigation';

export default async function OpportunitiesPage(props: {
  searchParams: Promise<{ error?: string; q?: string }>;
}) {
  const params = await props.searchParams;
  const query = new URLSearchParams({ view: 'opportunities' });
  if (params.q) query.set('q', params.q);
  if (params.error) query.set('error', params.error);
  redirect(`/?${query.toString()}`);
}
