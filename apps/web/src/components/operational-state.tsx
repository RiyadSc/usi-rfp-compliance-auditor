import React from 'react';
import type { ReactNode } from 'react';
import type { Phase8DemoMode } from '@usi/domain';

export type OperationalState =
  | 'loading'
  | 'empty'
  | 'partial'
  | 'parser_uncertain'
  | 'unauthorized'
  | 'failed'
  | 'stale'
  | 'expired'
  | 'revoked'
  | 'cached'
  | 'fallback';

const labels: Record<OperationalState, string> = {
  loading: 'Loading',
  empty: 'No records available',
  partial: 'Partial result — human review required',
  parser_uncertain: 'Parser uncertainty — human review required',
  unauthorized: 'This workspace resource is unavailable',
  failed: 'The operation failed safely',
  stale: 'Cached result is stale and was not used',
  expired: 'The private download grant has expired',
  revoked: 'This private export has been revoked',
  cached: 'Validated cached analysis',
  fallback: 'Prepared fallback snapshot — synthetic data',
};

export function OperationalStateNotice({
  state,
  children,
}: {
  state: OperationalState;
  children?: ReactNode;
}) {
  const urgent = ['unauthorized', 'failed', 'stale', 'expired', 'revoked'].includes(state);
  return (
    <section
      aria-live={urgent ? 'assertive' : 'polite'}
      aria-atomic="true"
      role={urgent ? 'alert' : 'status'}
      data-operational-state={state}
      className="rounded-md border border-slate-300 bg-white p-3 text-sm"
    >
      <strong>{labels[state]}</strong>
      {children ? <div className="mt-1">{children}</div> : null}
    </section>
  );
}

const modeLabels: Record<Phase8DemoMode, string> = {
  prepared: 'Prepared synthetic demo',
  cached: 'Validated cached analysis — synthetic data',
  fallback: 'Prepared fallback snapshot — synthetic data',
  offline_read_only: 'Offline read-only presentation — synthetic data',
};

export function DemoModeBanner({ mode }: { mode: Phase8DemoMode }) {
  return (
    <aside
      aria-label="Demo mode"
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"
      data-demo-mode={mode}
    >
      <strong>{modeLabels[mode]}</strong>. Results remain machine-generated unless a separate human
      review is shown.
    </aside>
  );
}
