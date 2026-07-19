import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DemoModeBanner, OperationalStateNotice, type OperationalState } from './operational-state';

describe('accessible operational states', () => {
  it('renders every required state with semantic live-region markup and text labels', () => {
    const states: OperationalState[] = [
      'loading',
      'empty',
      'partial',
      'parser_uncertain',
      'unauthorized',
      'failed',
      'stale',
      'expired',
      'revoked',
      'cached',
      'fallback',
    ];
    for (const state of states) {
      const html = renderToStaticMarkup(<OperationalStateNotice state={state} />);
      expect(html, state).toContain(`data-operational-state="${state}"`);
      expect(html, state).toMatch(/role="(?:status|alert)"/);
      expect(html, state).toMatch(/aria-live="(?:polite|assertive)"/);
    }
  });

  it('labels every resilient demo mode without implying human acceptance', () => {
    for (const mode of ['prepared', 'cached', 'fallback', 'offline_read_only'] as const) {
      const html = renderToStaticMarkup(<DemoModeBanner mode={mode} />);
      expect(html).toContain(`data-demo-mode="${mode}"`);
      expect(html).toContain('synthetic');
      expect(html).toContain('machine-generated');
    }
  });
});
