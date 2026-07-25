import { BrandMark, BrandSeal, EvidenceField } from '@/components/brand';
import { IconAlert } from '@/components/icons';
import { signIn } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-[calc(100vh-2rem)] items-stretch lg:grid-cols-[1.15fr_0.85fr]">
      <section
        aria-hidden="true"
        className="texture-nodes relative hidden flex-col justify-between overflow-hidden border-r border-line-subtle p-12 lg:flex"
        style={{
          background:
            'radial-gradient(circle at 14% 6%, rgba(120, 165, 164, 0.16), transparent 44%), radial-gradient(circle at 86% 100%, rgba(70, 100, 105, 0.14), transparent 42%), #0b0d0d',
        }}
      >
        <EvidenceField className="opacity-60" />

        <div className="relative flex items-center gap-2.5 text-sm font-semibold tracking-[-0.01em] text-ink">
          <BrandMark size={20} className="text-teal-300" />
          RFP Response Hub
        </div>

        <div className="relative max-w-xl">
          <p className="display-title">
            <span className="display-accent">Evidence</span>-first
            <br />
            RFP review
          </p>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-ink-soft">
            Decision support only; not legal, insurance, or contractual advice.
          </p>
        </div>

        <div className="relative flex items-end justify-between gap-8">
          <p className="text-micro text-ink-faint">Synthetic and public data only</p>
          <BrandSeal size={132} className="text-mist-300 opacity-45" />
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-16 lg:px-12">
        <div className="surface-card w-full max-w-sm p-8">
          <span className="mb-8 grid h-11 w-11 place-items-center rounded-md border border-line-default bg-surface-800 text-teal-300 lg:hidden">
            <BrandMark size={22} />
          </span>

          <h1 className="page-title">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Protected demo access. Accounts are provisioned by the demo operator; there is no
            signup.
          </p>

          {error ? (
            <p role="alert" className="notice notice-critical mt-6">
              <span className="notice-title">
                <IconAlert size={15} />
                Sign-in failed. Check the email and password and try again.
              </span>
            </p>
          ) : null}

          <form action={signIn} className="mt-8 space-y-5">
            <div className="field">
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" className="primary-action btn-lg w-full">
              Sign in
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
