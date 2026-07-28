import React from 'react';
import type { ReactNode } from 'react';
import type { Phase8DemoMode } from '@usi/domain';
import { IconAlert, IconBlocker, IconInfo, IconShield } from '@/components/icons';

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
  empty: 'Nothing to show yet',
  partial: 'Partial result — a person should review before relying on it',
  parser_uncertain: 'Document needs manual review — the system could not read this reliably',
  unauthorized: 'This workspace resource is unavailable',
  failed: 'Something failed safely — work that already finished was kept',
  stale: 'This cached result is out of date and was not used',
  expired: 'The private download link has expired',
  revoked: 'This private export has been revoked',
  cached: 'Using a validated cached analysis',
  fallback: 'Prepared fallback snapshot — synthetic data',
};

/** Critical states stay calm: a coral accent and an icon, never a red panel. */
const variants: Record<OperationalState, { className: string; glyph: ReactNode }> = {
  loading: { className: '', glyph: <IconInfo size={15} /> },
  empty: { className: '', glyph: <IconInfo size={15} /> },
  partial: { className: 'notice-warning', glyph: <IconAlert size={15} /> },
  parser_uncertain: { className: 'notice-warning', glyph: <IconAlert size={15} /> },
  unauthorized: { className: '', glyph: <IconShield size={15} /> },
  failed: { className: 'notice-critical', glyph: <IconBlocker size={15} /> },
  stale: { className: 'notice-warning', glyph: <IconAlert size={15} /> },
  expired: { className: 'notice-warning', glyph: <IconAlert size={15} /> },
  revoked: { className: 'notice-critical', glyph: <IconBlocker size={15} /> },
  cached: { className: 'notice-info', glyph: <IconInfo size={15} /> },
  fallback: { className: 'notice-info', glyph: <IconInfo size={15} /> },
};

export function OperationalStateNotice({
  state,
  children,
}: {
  state: OperationalState;
  children?: ReactNode;
}) {
  const urgent = ['unauthorized', 'failed', 'stale', 'expired', 'revoked'].includes(state);
  const variant = variants[state];
  return (
    <section
      aria-live={urgent ? 'assertive' : 'polite'}
      aria-atomic="true"
      role={urgent ? 'alert' : 'status'}
      data-operational-state={state}
      className={`notice ${variant.className}`}
    >
      <strong className="notice-title">
        <span className="shrink-0">{variant.glyph}</span>
        {labels[state]}
      </strong>
      {children ? <div className="mt-2 text-sm text-ink-soft">{children}</div> : null}
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
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-line-subtle bg-canvas-900/70 px-6 py-2 text-center text-xs text-ink-muted"
      data-demo-mode={mode}
    >
      <strong className="font-semibold text-warning-400">{modeLabels[mode]}</strong>
      <span>Results remain machine-generated unless a separate human review is shown.</span>
    </aside>
  );
}
