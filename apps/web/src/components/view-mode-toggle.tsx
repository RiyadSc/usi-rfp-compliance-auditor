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
      className="inline-flex rounded-lg border border-slate-300 bg-white p-1"
      aria-label="Page detail level"
    >
      {(['executive', 'analyst'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => choose(option)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
            mode === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
