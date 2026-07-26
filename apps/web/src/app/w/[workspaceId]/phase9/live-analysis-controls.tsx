'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { startPhase9WorkspaceAnalysisAction } from './actions';

type DocumentOption = {
  id: string;
  name: string;
  type: string;
  pages: number | null;
};

export function LiveAnalysisControls({
  workspaceId,
  documents,
  enabled,
  perRunMaximumUsd,
  monthlyMaximumUsd,
}: {
  workspaceId: string;
  documents: DocumentOption[];
  enabled: boolean;
  perRunMaximumUsd: number;
  monthlyMaximumUsd: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(documents.map((document) => document.id));
  const [maximumUsd, setMaximumUsd] = useState(perRunMaximumUsd.toFixed(2));
  const [budgetConfirmed, setBudgetConfirmed] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const disabledReason = !enabled
    ? 'administrator_disabled'
    : pending
      ? 'request_pending'
      : !documents.length
        ? 'no_parsed_documents'
        : !selected.length
          ? 'no_documents_selected'
          : !budgetConfirmed
            ? 'budget_not_confirmed'
            : !dataConfirmed
              ? 'data_not_confirmed'
              : !Number.isFinite(Number(maximumUsd)) || Number(maximumUsd) <= 0
                ? 'invalid_maximum'
                : Number(maximumUsd) > perRunMaximumUsd
                  ? 'maximum_exceeds_server_limit'
                  : null;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function start() {
    setMessage(null);
    startTransition(async () => {
      const result = await startPhase9WorkspaceAnalysisAction({
        workspaceId,
        documentIds: selected,
        maximumUsd: Number(maximumUsd),
        budgetConfirmed,
        publicOrAuthorizedDataConfirmed: dataConfirmed,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(
        `Queued ${result.taskCount} bounded tasks. The exact plan can cost up to $${result.plannedMaximumUsd.toFixed(2)}.`,
      );
      router.refresh();
    });
  }

  return (
    <section className="surface-panel mb-6 p-5" aria-labelledby="live-analysis-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="page-eyebrow">Optional provider analysis</p>
          <h2 id="live-analysis-title" className="section-title mt-2">
            Analyze selected RFP documents
          </h2>
          <p className="section-lede mt-2">
            This source-grounded path works the same way for every U.S. state. It analyzes only the
            documents you select, records an exact maximum cost first, and keeps every result
            machine-only with human review pending.
          </p>
        </div>
        <span className={`chip ${enabled ? '' : 'opacity-70'}`}>
          {enabled ? 'Live analysis available' : 'Disabled by administrator'}
        </span>
      </div>

      <fieldset className="mt-5" disabled={!enabled || pending}>
        <legend className="font-semibold text-ink">Documents included</legend>
        <p className="text-metadata mt-1">
          Proposal drafts and expected-answer files are never available here.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {documents.map((document) => (
            <label key={document.id} className="surface-card flex cursor-pointer gap-3 p-3">
              <input
                data-testid={`phase9-document-${document.id}`}
                type="checkbox"
                checked={selected.includes(document.id)}
                onChange={() => toggle(document.id)}
              />
              <span>
                <span className="block font-medium text-ink">{document.name}</span>
                <span className="text-metadata">
                  {document.type.replaceAll('_', ' ')}
                  {document.pages ? ` · ${document.pages} pages` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
        {!documents.length ? (
          <p className="notice notice-warning mt-3">
            Upload and parse an RFP before starting live analysis.
          </p>
        ) : null}

        <label className="mt-5 block max-w-xs">
          <span className="font-semibold text-ink">Maximum cost for this run</span>
          <span className="text-metadata mt-1 block">
            Server limit ${perRunMaximumUsd.toFixed(2)} · workspace monthly limit $
            {monthlyMaximumUsd.toFixed(2)}
          </span>
          <span className="mt-2 flex items-center gap-2">
            <span aria-hidden="true">$</span>
            <input
              data-testid="phase9-maximum-usd"
              className="field-input"
              type="number"
              min="0.01"
              max={perRunMaximumUsd}
              step="0.01"
              value={maximumUsd}
              onChange={(event) => setMaximumUsd(event.target.value)}
            />
          </span>
        </label>

        <label className="mt-4 flex max-w-3xl gap-3">
          <input
            data-testid="phase9-data-confirmation"
            type="checkbox"
            checked={dataConfirmed}
            onChange={(event) => setDataConfirmed(event.target.checked)}
          />
          <span>
            I confirm these documents are public or my organization is authorized to send them to
            the configured AI provider.
          </span>
        </label>
        <label className="mt-3 flex max-w-3xl gap-3">
          <input
            data-testid="phase9-budget-confirmation"
            type="checkbox"
            checked={budgetConfirmed}
            onChange={(event) => setBudgetConfirmed(event.target.checked)}
          />
          <span>
            I authorize this run up to the amount above. The worker will refuse any plan that could
            exceed it.
          </span>
        </label>

        <button
          type="button"
          data-testid="phase9-start-live-analysis"
          data-disabled-reason={disabledReason ?? 'ready'}
          className="button-primary mt-5"
          disabled={Boolean(disabledReason)}
          onClick={start}
        >
          {pending ? 'Preparing exact call plan…' : 'Start controlled live analysis'}
        </button>
      </fieldset>
      {message ? (
        <p className={`notice mt-4 ${message.startsWith('Queued') ? '' : 'notice-warning'}`}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
