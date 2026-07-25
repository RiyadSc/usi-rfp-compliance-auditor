/**
 * Evidence Intelligence brand motif.
 *
 * Four converging document corners enclose a single evidence node: the mark
 * reads as a verification seal, stays legible at favicon size, and is built
 * only from geometry so it inherits the surrounding text colour.
 */
import type { ReactNode } from 'react';

export function BrandMark({
  size = 20,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
    >
      <path d="M4 9V4.5h4.5" />
      <path d="M15.5 4.5H20V9" />
      <path d="M20 15v4.5h-4.5" />
      <path d="M8.5 19.5H4V15" />
      <path d="M12 9.6 14.4 12 12 14.4 9.6 12Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Header lockup: mark plus product name. */
export function BrandLockup({ label = 'RFP Response Hub' }: { label?: string }) {
  return (
    <span className="brand-lockup">
      <span className="grid h-8 w-8 place-items-center rounded-sm border border-line-default bg-surface-800 text-teal-300">
        <BrandMark size={18} />
      </span>
      <span>{label}</span>
    </span>
  );
}

/**
 * Oversized seal for editorial surfaces. The corners are drawn at a larger
 * optical weight and the node carries a soft halo.
 */
export function BrandSeal({ size = 168, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <radialGradient id="brand-seal-node" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9bbdba" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#9bbdba" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      >
        <path d="M12 40V12h28" />
        <path d="M80 12h28v28" />
        <path d="M108 80v28H80" />
        <path d="M40 108H12V80" />
      </g>
      <g stroke="currentColor" strokeWidth={1} opacity="0.22">
        <path d="M60 26v14M60 80v14M26 60h14M80 60h14" />
      </g>
      <circle cx="60" cy="60" r="26" fill="url(#brand-seal-node)" />
      <path d="M60 50.5 69.5 60 60 69.5 50.5 60Z" fill="#9bbdba" opacity="0.9" />
    </svg>
  );
}

/**
 * Processing indicator built from the mark: the four corners settle inward in
 * sequence. Deliberately not a spinner, and static under reduced motion.
 */
export function EvidenceProcessingMark({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-grid place-items-center" aria-hidden="true">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-teal-300"
      >
        <path d="M4 9V4.5h4.5" className="evidence-corner evidence-corner-1" />
        <path d="M15.5 4.5H20V9" className="evidence-corner evidence-corner-2" />
        <path d="M20 15v4.5h-4.5" className="evidence-corner evidence-corner-3" />
        <path d="M8.5 19.5H4V15" className="evidence-corner evidence-corner-4" />
        <path d="M12 9.6 14.4 12 12 14.4 9.6 12Z" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

/** Decorative evidence-node field for hero and empty-state surfaces. */
export function EvidenceField({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className ?? ''}`}>
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full text-teal-300"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="0.5" opacity="0.28">
          <path d="M60 150 L140 96 L232 128 L318 64" />
          <path d="M140 96 L152 40" />
          <path d="M232 128 L214 176" />
        </g>
        <g fill="currentColor">
          {[
            [60, 150],
            [140, 96],
            [232, 128],
            [318, 64],
            [152, 40],
            [214, 176],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="2.4" opacity="0.75" />
              <circle cx={x} cy={y} r="7" opacity="0.1" />
            </g>
          ))}
        </g>
      </svg>
    </span>
  );
}

/** Empty-state artwork: converging corners around an absent node. */
export function EmptyStateArt({ children }: { children?: ReactNode }) {
  return (
    <span className="relative grid h-20 w-20 place-items-center" aria-hidden="true">
      <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full text-teal-400" fill="none">
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.42">
          <path d="M8 26V8h18" />
          <path d="M54 8h18v18" />
          <path d="M72 54v18H54" />
          <path d="M26 72H8V54" />
        </g>
        <g stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.3">
          <circle cx="40" cy="40" r="16" />
        </g>
      </svg>
      <span className="relative text-ink-muted">{children}</span>
    </span>
  );
}
