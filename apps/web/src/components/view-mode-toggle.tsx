'use client';

import { useEffect, useState } from 'react';

type ViewMode = 'executive' | 'analyst';

export function ViewModeToggle() {
  const [mode, setMode] = useState<ViewMode>('executive');

  useEffect(() => {
    const saved = window.localStorage.getItem('rfp-view-mode');
    const initial = saved === 'analyst' ? 'analyst' : 'executive';
    setMode(initial);
    document.documentElement.dataset.viewMode = initial;
  }, []);

  const choose = (next: ViewMode) => {
    setMode(next);
    window.localStorage.setItem('rfp-view-mode', next);
    document.documentElement.dataset.viewMode = next;
  };

  return (
    <div
      className="inline-flex rounded-sm border border-line-default bg-surface-900 p-1"
      aria-label="Page detail level"
    >
      {(['executive', 'analyst'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => choose(option)}
          className={`rounded-xs px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
            mode === option
              ? 'bg-mist-200 text-onlight'
              : 'text-ink-muted hover:bg-surface-800 hover:text-ink'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
