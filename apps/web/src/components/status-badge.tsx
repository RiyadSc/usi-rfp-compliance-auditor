import { businessLabel, statusTone, type Tone } from '@/lib/presentation';

const toneClasses: Record<Tone, string> = {
  neutral: 'border-slate-300 bg-slate-50 text-slate-700',
  positive: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  info: 'border-blue-300 bg-blue-50 text-blue-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  danger: 'border-red-300 bg-red-50 text-red-800',
};

export function StatusBadge({
  value,
  label,
  tone,
  title,
}: {
  value: string;
  label?: string;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone ?? statusTone(value)]}`}
    >
      {label ?? businessLabel(value)}
    </span>
  );
}

export function StatusAxis({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500" title={help}>
        {label}
      </p>
      <div className="mt-2">
        <StatusBadge value={value} title={help} />
      </div>
    </div>
  );
}
