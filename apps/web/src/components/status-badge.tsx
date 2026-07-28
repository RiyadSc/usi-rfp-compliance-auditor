import { businessLabel, statusTone, type Tone } from '@/lib/presentation';
import { IconAlert, IconCheck, IconClock } from '@/components/icons';

const toneClasses: Record<Tone, string> = {
  neutral: 'badge-neutral',
  positive: 'badge-positive',
  info: 'badge-info',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

/**
 * Each tone carries a shape as well as a colour so status is never signalled by
 * colour alone.
 */
function ToneGlyph({ tone }: { tone: Tone }) {
  if (tone === 'danger') return <IconAlert size={12} />;
  if (tone === 'warning') return <IconClock size={12} />;
  if (tone === 'positive') return <IconCheck size={12} />;
  return <span className="badge-dot" aria-hidden="true" />;
}

export function StatusBadge({
  value,
  label,
  tone,
  title,
  ariaDescribedBy,
}: {
  value: string;
  label?: string;
  tone?: Tone;
  title?: string;
  ariaDescribedBy?: string;
}) {
  const resolved = tone ?? statusTone(value);
  return (
    <span
      title={title}
      aria-describedby={ariaDescribedBy}
      className={`badge ${toneClasses[resolved]}`}
    >
      <ToneGlyph tone={resolved} />
      {label ?? businessLabel(value)}
    </span>
  );
}

export function StatusAxis({ label, value, help }: { label: string; value: string; help: string }) {
  const helpId = `${label.replaceAll(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-help`;
  return (
    <div className="surface-panel p-4">
      <p className="metric-label">{label}</p>
      <div className="mt-2.5">
        <StatusBadge value={value} title={help} ariaDescribedBy={helpId} />
      </div>
      <p id={helpId} className="mt-2 text-xs leading-relaxed text-ink-muted">
        {help}
      </p>
    </div>
  );
}
