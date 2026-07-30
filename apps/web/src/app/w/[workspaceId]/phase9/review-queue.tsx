'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import type {
  Phase9ExecutiveSummary,
  Phase9ReviewQueueResponse,
  Phase9ReviewQueueRow,
} from '@/lib/phase9/review-service';
import {
  loadPhase9ReviewActivitySummaryAction,
  recordPhase9ReviewActivityAction,
  recordPhase9ReviewBatchAction,
} from './actions';
import { Phase9FindingReviewControls } from './finding-review-controls';

type Lane = 'critical' | 'exception' | 'duplicate' | 'routine' | 'reviewed' | 'all';
type BatchAction = 'accept_routine' | 'reject_duplicate' | 'mark_follow_up';
type ActivitySummary = {
  elapsedSeconds: number;
  individualDecisions: number;
  batchOperations: number;
  batchDecisions: number;
  sourceOpenings: number;
  decisionsPerMinute: number;
  remainingWork: number;
};

const LANE_LABELS: Record<Lane, string> = {
  critical: 'Critical',
  exception: 'Exceptions',
  duplicate: 'Duplicates',
  routine: 'Routine',
  reviewed: 'Reviewed',
  all: 'All',
};

const REASONS: Record<string, string> = {
  source_not_supported: 'Source support needs individual judgment',
  precedence_not_active: 'Source ordering or active status is unresolved',
  evidence_missing: 'No eligible source evidence is attached',
  page_reference_incomplete: 'The original page reference is incomplete',
  quotation_not_validated: 'The quotation could not be validated exactly',
  ambiguity_present: 'The machine analysis recorded an ambiguity',
  parser_uncertain: 'The source parser could not read this reliably',
  coverage_exception_unresolved: 'A related source-page issue still needs review',
  machine_status_ineligible: 'This machine record is not eligible for publication',
  submission_critical: 'Omission could affect the bid or submission',
  deterministic_noncanonical_duplicate: 'Matches a retained canonical finding exactly',
  clean_routine: 'Supported, active, evidence-valid, and non-critical',
};

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function conciseTitle(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalized;
  return firstSentence.length <= 180 ? firstSentence : `${firstSentence.slice(0, 177).trimEnd()}…`;
}

function reviewSessionFor(workspaceId: string, evaluationRunId: string) {
  const fallback = crypto.randomUUID();
  if (typeof window === 'undefined') return fallback;
  const key = `phase9-review-session:${workspaceId}:${evaluationRunId}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  window.sessionStorage.setItem(key, fallback);
  return fallback;
}

export function Phase9ReviewQueue({
  workspaceId,
  evaluationRunId,
  summary,
  queue,
  selectedLane,
  search,
  duplicateSignature,
  focusFirstUnresolved,
}: {
  workspaceId: string;
  evaluationRunId: string;
  summary: Phase9ExecutiveSummary;
  queue: Phase9ReviewQueueResponse;
  selectedLane: Lane;
  search: string;
  duplicateSignature: string | null;
  focusFirstUnresolved: boolean;
}) {
  const router = useRouter();
  const [reviewSessionId] = useState(() => reviewSessionFor(workspaceId, evaluationRunId));
  const [sessionEventId] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogAction, setDialogAction] = useState<BatchAction | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [pending, startTransition] = useTransition();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const batchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const initialSessionMetadata = useRef({
    lane: selectedLane,
    remainingWork: summary.totalFindings - summary.reviewed,
  });

  const refreshActivity = useCallback(async () => {
    const result = await loadPhase9ReviewActivitySummaryAction({
      workspaceId,
      evaluationRunId,
      reviewSessionId,
    });
    if (result.ok) setActivity(result.summary);
  }, [evaluationRunId, reviewSessionId, workspaceId]);

  useEffect(() => {
    void recordPhase9ReviewActivityAction({
      workspaceId,
      evaluationRunId,
      eventType: 'review_session_started',
      reviewSessionId,
      idempotencyKey: sessionEventId,
      metadata: initialSessionMetadata.current,
    }).then(refreshActivity);
  }, [evaluationRunId, refreshActivity, reviewSessionId, sessionEventId, workspaceId]);

  useEffect(() => {
    const onDecision = () => void refreshActivity();
    document.addEventListener('phase9-review-action-completed', onDecision);
    return () => document.removeEventListener('phase9-review-action-completed', onDecision);
  }, [refreshActivity]);

  useEffect(() => {
    if (!dialogAction || !dialogRef.current) return;
    document.body.dataset.phase9NestedDialog = 'open';
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDialogAction(null);
        requestAnimationFrame(() => batchTriggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const current = elements.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? current <= 0
          ? elements.length - 1
          : current - 1
        : current < 0 || current === elements.length - 1
          ? 0
          : current + 1;
      event.preventDefault();
      elements[next]?.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      delete document.body.dataset.phase9NestedDialog;
    };
  }, [dialogAction]);

  useEffect(() => setSelected([]), [selectedLane, search, duplicateSignature, queue.page]);

  useEffect(() => {
    if (!focusFirstUnresolved) return;
    let cancelled = false;
    let attempts = 0;

    const clearFocusParam = () => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('focus')) return;
      url.searchParams.delete('focus');
      const query = url.searchParams.toString();
      window.history.replaceState(
        window.history.state,
        '',
        query ? `${url.pathname}?${query}` : url.pathname,
      );
    };

    const tryFocus = () => {
      if (cancelled) return;
      const target = document.querySelector<HTMLElement>('[data-review-unresolved="true"]');
      if (target) {
        target.focus({ preventScroll: false });
        if (document.activeElement === target) {
          clearFocusParam();
          return;
        }
      }
      if (attempts++ < 60) window.setTimeout(tryFocus, 50);
    };

    const frame = window.requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [focusFirstUnresolved, queue.rows]);

  const selectedRows = useMemo(
    () => queue.rows.filter((row) => selected.includes(row.candidate_hash)),
    [queue.rows, selected],
  );

  const selectionMode =
    selectedLane === 'routine'
      ? 'accept_routine'
      : selectedLane === 'duplicate'
        ? 'reject_duplicate'
        : null;
  const eligibleOnPage = queue.rows
    .filter((row) => canSelect(row) && !row.latest_decision_id)
    .map((row) => row.candidate_hash);
  const allEligibleOnPageSelected =
    eligibleOnPage.length > 0 && eligibleOnPage.every((hash) => selected.includes(hash));

  function canSelect(row: Phase9ReviewQueueRow) {
    if (selectedLane === 'routine') return row.batch_accept_eligible;
    if (selectedLane === 'duplicate') return row.batch_duplicate_reject_eligible;
    return false;
  }

  function queueHref(lane: Lane, page = 1) {
    const params = new URLSearchParams();
    params.set('lane', lane);
    if (search) params.set('q', search);
    if (duplicateSignature && lane === 'all') params.set('group', duplicateSignature);
    if (page > 1) params.set('page', String(page));
    return `/w/${workspaceId}/phase9?${params.toString()}`;
  }

  function confirmBatch(action: BatchAction, trigger: HTMLButtonElement) {
    if (!selected.length) return;
    batchTriggerRef.current = trigger;
    setReason('');
    setDialogAction(action);
  }

  function closeDialog() {
    setDialogAction(null);
    requestAnimationFrame(() => batchTriggerRef.current?.focus());
  }

  function submitBatch() {
    if (!dialogAction) return;
    startTransition(async () => {
      const submittedReason =
        dialogAction === 'accept_routine'
          ? 'Selected findings were in the routine lane and passed the server-owned batch policy.'
          : reason;
      const result = await recordPhase9ReviewBatchAction({
        workspaceId,
        evaluationRunId,
        candidateHashes: selected,
        action: dialogAction,
        reason: submittedReason,
        idempotencyKey: crypto.randomUUID(),
        reviewSessionId,
      });
      if (result.ok) {
        document.dispatchEvent(
          new CustomEvent('phase9-review-action-completed', {
            detail: {
              kind: 'batch_review',
              targetKey: 'batch-review',
              workspaceId,
              evaluationRunId,
              count: result.selectionCount,
            },
          }),
        );
        setMessage(
          `${result.selectionCount} individual team decision${result.selectionCount === 1 ? '' : 's'} recorded in one audited batch.`,
        );
        setSelected([]);
        setDialogAction(null);
        const tourActive = Boolean(
          document.querySelector('[data-testid="guided-tour"][data-tour-step]'),
        );
        if (!tourActive) router.refresh();
        void refreshActivity();
      } else {
        setMessage(result.error);
        setDialogAction(null);
      }
      requestAnimationFrame(() => statusRef.current?.focus());
    });
  }

  return (
    <section
      className="surface-card mt-6 overflow-hidden"
      aria-labelledby="review-queue-title"
      data-tour-target={selectionMode ? 'batch-review' : undefined}
    >
      <div className="border-b border-line-subtle px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-kicker">Review queue</p>
            <h2 id="review-queue-title" className="section-title mt-1.5">
              Decide what becomes trusted submission work
            </h2>
            <p className="section-lede mt-2 max-w-3xl">
              Critical and uncertain items stay individual. Only clean routine findings and exact
              duplicate records can use accelerated review.
            </p>
          </div>
          <p className="text-metadata" aria-live="polite">
            {queue.total} item{queue.total === 1 ? '' : 's'} in this view
          </p>
        </div>

        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Review lanes">
          {(Object.keys(LANE_LABELS) as Lane[]).map((lane) => (
            <Link
              key={lane}
              href={queueHref(lane)}
              className={lane === selectedLane ? 'filter-tab filter-tab-active' : 'filter-tab'}
              aria-current={lane === selectedLane ? 'page' : undefined}
              data-tour-target={lane === 'critical' ? 'critical-review-lane' : undefined}
            >
              {LANE_LABELS[lane]}
              {lane === 'critical'
                ? ` ${summary.unresolvedCritical}`
                : lane === 'exception'
                  ? ` ${summary.unresolvedExceptions}`
                  : lane === 'duplicate'
                    ? ` ${summary.unresolvedDuplicates}`
                    : lane === 'routine'
                      ? ` ${summary.unresolvedRoutine}`
                      : ''}
            </Link>
          ))}
        </nav>

        <form className="mt-4 flex flex-col gap-2 sm:flex-row" role="search">
          <input type="hidden" name="lane" value={selectedLane} />
          <label className="sr-only" htmlFor="review-search">
            Search findings
          </label>
          <input
            id="review-search"
            name="q"
            defaultValue={search}
            placeholder="Search requirements, forms, or categories"
          />
          <button className="secondary-action shrink-0" type="submit">
            Search review queue
          </button>
          {search || duplicateSignature ? (
            <Link
              className="tertiary-action shrink-0"
              href={`/w/${workspaceId}/phase9?lane=${selectedLane}`}
            >
              Clear filters
            </Link>
          ) : null}
        </form>

        {selectionMode ? (
          <div
            className="surface-inset mt-4 flex flex-wrap items-center justify-between gap-3 p-3"
            data-tour-interaction="batch-review"
          >
            <div>
              <p className="font-medium text-ink">{selected.length} selected</p>
              <p className="text-metadata">
                The server checks every item again before recording any decision.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="secondary-action btn-sm"
                disabled={!eligibleOnPage.length || allEligibleOnPageSelected || pending}
                onClick={() =>
                  setSelected((current) => [...new Set([...current, ...eligibleOnPage])])
                }
              >
                {allEligibleOnPageSelected
                  ? 'All eligible on this page selected'
                  : `Select ${eligibleOnPage.length} eligible on this page`}
              </button>
              <button
                type="button"
                className="primary-action btn-sm"
                disabled={!selected.length || pending}
                onClick={(event) => confirmBatch(selectionMode, event.currentTarget)}
              >
                {selectionMode === 'accept_routine'
                  ? `Accept ${selected.length} selected`
                  : `Reject ${selected.length} duplicate${selected.length === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                className="secondary-action btn-sm"
                disabled={!selected.length || pending}
                onClick={(event) => confirmBatch('mark_follow_up', event.currentTarget)}
              >
                Mark selected for follow-up
              </button>
              <button
                type="button"
                className="tertiary-action btn-sm"
                disabled={!selected.length || pending}
                onClick={() => setSelected([])}
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="divide-y divide-line-subtle">
        {queue.rows.map((row, index) => {
          const selectable = canSelect(row);
          const nextHref = `${queueHref(selectedLane, queue.page)}&focus=first-unresolved`;
          return (
            <article
              id={`finding-${row.candidate_hash}`}
              key={row.candidate_hash}
              tabIndex={-1}
              data-review-unresolved={row.latest_decision_id ? 'false' : 'true'}
              className="review-queue-row p-5"
              data-lane={row.review_lane}
              data-tour-target={
                index === 0 && row.review_lane === 'critical' ? 'critical-obligations' : undefined
              }
            >
              <div className="flex items-start gap-3">
                {selectionMode ? (
                  <label className="mt-1 flex shrink-0 items-center gap-2">
                    <input
                      type="checkbox"
                      data-tour-interaction="batch-review"
                      checked={selected.includes(row.candidate_hash)}
                      disabled={!selectable || Boolean(row.latest_decision_id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, row.candidate_hash]
                            : current.filter((hash) => hash !== row.candidate_hash),
                        )
                      }
                    />
                    <span className="sr-only">
                      Select {row.obligation_text} for {LANE_LABELS[selectedLane]} batch review
                    </span>
                  </label>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-4xl">
                      <p className="text-micro text-ink-muted">
                        {label(row.category)} · {label(row.mandatory_class)}
                      </p>
                      <h3
                        className="mt-1 text-base font-semibold text-ink"
                        data-tour-target={
                          index === 0 && row.review_lane === 'critical'
                            ? 'evidence-backed-finding'
                            : undefined
                        }
                      >
                        {conciseTitle(row.obligation_text)}
                      </h3>
                      <p className="mt-2 text-sm text-ink-soft">
                        <strong className="font-medium text-ink">
                          {label(row.review_lane)} review:
                        </strong>{' '}
                        {REASONS[row.lane_reason] ?? label(row.lane_reason)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge value={row.review_lane} />
                      <StatusBadge value={row.human_decision ?? 'pending'} />
                    </div>
                  </div>

                  <div
                    data-tour-target={
                      index === 0 && row.review_lane === 'critical' ? 'source-evidence' : undefined
                    }
                  >
                    <blockquote className="evidence-quote mt-3 line-clamp-3">
                      {row.evidence_text || 'No validated quotation is available for this finding.'}
                    </blockquote>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {row.source_document_id && row.page_number ? (
                        <Link
                          href={`/w/${workspaceId}/documents/${row.source_document_id}?page=${row.page_number}&returnTo=${encodeURIComponent(queueHref(selectedLane, queue.page))}`}
                          className="locator"
                          data-tour-interaction="source-evidence"
                          onClick={() => {
                            void recordPhase9ReviewActivityAction({
                              workspaceId,
                              evaluationRunId,
                              eventType: 'source_page_opened',
                              reviewSessionId,
                              idempotencyKey: crypto.randomUUID(),
                              candidateHash: row.candidate_hash,
                              sourceDocumentId: row.source_document_id!,
                              pageNumber: row.page_number!,
                              metadata: { source: 'review_queue' },
                            })
                              .then(() => void refreshActivity())
                              .catch(() => undefined);
                          }}
                        >
                          {row.source_document_key ?? 'Source document'} · page {row.page_number}
                        </Link>
                      ) : (
                        <span className="notice notice-warning">Source page needs follow-up</span>
                      )}
                      {row.deadline_iso ? (
                        <span className="chip">Deadline {row.deadline_iso}</span>
                      ) : null}
                      {row.form_reference ? (
                        <span className="chip">Form {row.form_reference}</span>
                      ) : null}
                      <span className="text-metadata">
                        {selectable ? 'Eligible for accelerated review' : 'Individual review'}
                      </span>
                    </div>
                  </div>

                  {row.ambiguity_code || row.parser_uncertain ? (
                    <p className="notice notice-warning mt-3">
                      {row.ambiguity_code
                        ? `Unresolved source ambiguity: ${label(row.ambiguity_code)}`
                        : 'Parser uncertainty prevents ordinary review.'}
                    </p>
                  ) : null}

                  {row.duplicate_count > 1 && row.duplicate_signature ? (
                    <p className="notice notice-info mt-3">
                      This exact deterministic group contains {row.duplicate_count} source
                      occurrences because the normalized obligation, category, source document,
                      active precedence, material facts, and exact evidence match. Every occurrence
                      remains available.{' '}
                      <Link
                        className="action-link"
                        href={`/w/${workspaceId}/phase9?lane=all&group=${row.duplicate_signature}`}
                      >
                        Open every occurrence
                      </Link>
                      .
                    </p>
                  ) : null}

                  <details
                    className="disclosure mt-4"
                    onToggle={(event) => {
                      if (!event.currentTarget.open) return;
                      void recordPhase9ReviewActivityAction({
                        workspaceId,
                        evaluationRunId,
                        eventType: 'finding_opened',
                        reviewSessionId,
                        idempotencyKey: crypto.randomUUID(),
                        candidateHash: row.candidate_hash,
                        metadata: { lane: row.review_lane, source: 'review_queue' },
                      });
                    }}
                    data-tour-target={
                      index === 0 && row.review_lane === 'critical' ? 'review-decision' : undefined
                    }
                  >
                    <summary data-tour-interaction="review-decision">
                      {row.latest_decision_id ? 'Update team decision' : 'Review this finding'}
                    </summary>
                    <div className="disclosure-body">
                      <Phase9FindingReviewControls
                        workspaceId={workspaceId}
                        evaluationRunId={evaluationRunId}
                        candidateHash={row.candidate_hash}
                        currentDecision={row.human_decision}
                        reviewSessionId={reviewSessionId}
                        nextHref={nextHref}
                      />
                    </div>
                  </details>
                </div>
              </div>
            </article>
          );
        })}
        {!queue.rows.length ? (
          <div className="empty-state p-6">
            <h3 className="empty-state-title">No findings in this view</h3>
            <p className="empty-state-body mt-2">
              Try another review lane or clear the search filters.
            </p>
          </div>
        ) : null}
      </div>

      {queue.total > queue.pageSize ? (
        <nav
          className="flex items-center justify-between border-t border-line-subtle px-5 py-4"
          aria-label="Review queue pages"
        >
          {queue.page > 1 ? (
            <Link
              className="secondary-action btn-sm"
              href={queueHref(selectedLane, queue.page - 1)}
            >
              Previous page
            </Link>
          ) : (
            <span />
          )}
          <span className="text-metadata">
            Page {queue.page} of {Math.ceil(queue.total / queue.pageSize)}
          </span>
          {queue.page * queue.pageSize < queue.total ? (
            <Link
              className="secondary-action btn-sm"
              href={queueHref(selectedLane, queue.page + 1)}
            >
              Next page
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      {message ? <p className="notice notice-info m-5">{message}</p> : null}

      {activity ? (
        <section
          className="border-t border-line-subtle px-5 py-4"
          aria-label="Current review session"
        >
          <p className="section-kicker">Current review session</p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <SessionFact label="Elapsed" value={formatElapsed(activity.elapsedSeconds)} />
            <SessionFact label="Individual decisions" value={activity.individualDecisions} />
            <SessionFact label="Batch operations" value={activity.batchOperations} />
            <SessionFact label="Batch decisions" value={activity.batchDecisions} />
            <SessionFact label="Source openings" value={activity.sourceOpenings} />
            <SessionFact
              label="Decisions / minute"
              value={activity.decisionsPerMinute.toFixed(1)}
            />
          </dl>
          <p className="text-metadata mt-2">
            {activity.remainingWork} finding decisions remain. This session summary records workflow
            metadata only; it does not affect evidence or publication eligibility.
          </p>
        </section>
      ) : null}

      {dialogAction ? (
        <div
          className="review-dialog-backdrop"
          role="presentation"
          data-tour-interaction="batch-review"
        >
          <div
            ref={dialogRef}
            className="review-dialog"
            role="alertdialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="batch-confirm-title"
            aria-describedby="batch-confirm-description"
          >
            <p className="section-kicker">Human confirmation</p>
            <h2 id="batch-confirm-title" className="section-title mt-1.5">
              Record {selectedRows.length} individual decisions?
            </h2>
            <p id="batch-confirm-description" className="section-lede mt-2">
              This{' '}
              {dialogAction === 'accept_routine'
                ? 'accepts clean routine findings'
                : dialogAction === 'reject_duplicate'
                  ? 'rejects non-canonical exact duplicates'
                  : 'marks selected items for follow-up'}
              . Each finding receives its own append-only decision linked to one batch ID.
            </p>
            <p className="notice notice-info mt-3">
              {dialogAction === 'accept_routine'
                ? 'Lane: Routine · Eligible because every selected item is supported, active, evidence-valid, non-critical, and unresolved.'
                : dialogAction === 'reject_duplicate'
                  ? 'Lane: Duplicates · Eligible because every selected item is a deterministic non-canonical duplicate.'
                  : `Lane: ${label(selectedLane)} · You explicitly selected every affected item.`}
            </p>
            {dialogAction !== 'accept_routine' ? (
              <label className="field-label mt-4 block">
                Reason
                <textarea
                  autoFocus
                  className="mt-1.5"
                  value={reason}
                  maxLength={1000}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="tertiary-action" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                autoFocus={dialogAction === 'accept_routine'}
                className="primary-action"
                disabled={
                  pending || (dialogAction !== 'accept_routine' && reason.trim().length < 5)
                }
                onClick={submitBatch}
              >
                {pending ? 'Recording…' : `Confirm ${selectedRows.length} decisions`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SessionFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-micro text-ink-muted">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}

function formatElapsed(seconds: number) {
  const bounded = Math.max(0, Math.trunc(seconds));
  const minutes = Math.floor(bounded / 60);
  const remainder = bounded % 60;
  return `${minutes}m ${remainder}s`;
}
