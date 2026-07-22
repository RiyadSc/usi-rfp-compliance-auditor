import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('./processing-actions', () => ({
  cancelLargeDocumentJob: vi.fn(),
  retryProcessingUnit: vi.fn(),
}));
import { ProcessingPanel } from './processing-panel';

describe('large document processing UI', () => {
  it('shows exact persisted counts, warnings, cost and recovery without fake percentages', () => {
    const html = renderToStaticMarkup(
      <ProcessingPanel
        workspaceId="10000000-0000-4000-8000-000000000001"
        documentId="10000000-0000-4000-8000-000000000002"
        inspection={{
          sourceFormat: 'pdf',
          pages: 420,
          nativePages: 410,
          ocrPages: 10,
          uncertainPages: 1,
          tables: 8,
          blocks: 420,
          warnings: ['Page 275 requires review'],
        }}
        job={{
          id: '10000000-0000-4000-8000-000000000003',
          status: 'failed_retryable',
          currentStage: 'ocr_processing',
          progressNumerator: 41,
          progressDenominator: 55,
        }}
        stages={[
          {
            id: 's',
            stage: 'ocr_processing',
            status: 'failed_retryable',
            progressNumerator: 41,
            progressDenominator: 55,
          },
        ]}
        failedUnits={[
          {
            id: '10000000-0000-4000-8000-000000000004',
            unitType: 'ocr',
            unitKey: 'page:275',
            status: 'failed_retryable',
            error: 'low_confidence',
          },
        ]}
        cost={{
          low: 1.9,
          high: 2.54,
          maximum: 5.07,
          callsLow: 45,
          callsHigh: 120,
          largestStage: 'verification',
          allowed: true,
          blockReason: null,
        }}
        cacheDecision="miss_invalidated_dependency"
      />,
    );
    expect(html).toContain('410 / 10 / 1');
    expect(html).toContain('41 of 55');
    expect(html).toContain('page:275');
    expect(html).toContain('$1.90–$2.54');
    expect(html).not.toContain('%');
  });
});
