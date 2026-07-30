'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  publishReviewedPhase9FindingsAction,
  recordPhase9CoverageReviewAction,
  recordPhase9FindingReviewAction,
  recordPhase9ReviewActivityAction,
} from './actions';

const CATEGORIES = [
  'mandatory_form',
  'submission_deadline',
  'question_deadline',
  'signature',
  'initials',
  'acknowledgment',
  'addendum_acknowledgment',
  'insurance',
  'bond',
  'certification',
  'license',
  'attestation',
  'attachment',
  'staffing_plan',
  'resume',
  'meeting',
  'pre_bid_conference',
  'site_visit',
  'pricing_form',
  'technical_response',
  'reference',
  'subcontractor_disclosure',
  'packaging_requirement',
  'delivery_method',
  'electronic_submission',
  'physical_submission',
  'copy_count',
  'file_format',
  'naming_requirement',
  'other_material_requirement',
] as const;

export function Phase9FindingReviewControls({
  workspaceId,
  evaluationRunId,
  candidateHash,
  currentDecision,
  reviewSessionId,
  nextHref,
}: {
  workspaceId: string;
  evaluationRunId: string;
  candidateHash: string;
  currentDecision: string | null;
  reviewSessionId?: string;
  nextHref?: string | null;
}) {
  const router = useRouter();
  const [fallbackReviewSessionId] = useState(() => crypto.randomUUID());
  const activeReviewSessionId = reviewSessionId ?? fallbackReviewSessionId;
  const [decision, setDecision] = useState<'accepted' | 'rejected' | 'needs_follow_up'>(
    currentDecision === 'rejected' || currentDecision === 'needs_follow_up'
      ? currentDecision
      : 'accepted',
  );
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [mandatoryClass, setMandatoryClass] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();

  return (
    <form
      className="surface-inset mt-4 space-y-3 p-4"
      data-tour-interaction="review-decision"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const corrections = {
            ...(title.trim() ? { title: title.trim() } : {}),
            ...(category ? { category } : {}),
            ...(mandatoryClass ? { mandatoryClass } : {}),
          };
          const result = await recordPhase9FindingReviewAction({
            workspaceId,
            evaluationRunId,
            candidateHash,
            decision,
            note,
            corrections,
            reviewSessionId: activeReviewSessionId,
            idempotencyKey: crypto.randomUUID(),
          });
          if (result.ok) {
            document.dispatchEvent(
              new CustomEvent('phase9-review-action-completed', {
                detail: {
                  kind: 'individual_review',
                  targetKey: 'review-decision',
                  workspaceId,
                  evaluationRunId,
                  candidateHash,
                },
              }),
            );
            const tourActive = Boolean(
              document.querySelector('[data-testid="guided-tour"][data-tour-step]'),
            );
            if (tourActive) {
              // The tour observes the custom event; avoid remounting the review
              // dashboard mid-walkthrough.
              setMessage(
                'Team source decision recorded. The requirement register has not been changed yet.',
              );
              return;
            }
            if (nextHref) {
              // Navigate before local state updates so the one-shot focus query is not dropped.
              router.push(nextHref);
              return;
            }
            setMessage(
              'Team source decision recorded. The requirement register has not been changed yet.',
            );
            router.refresh();
            return;
          }
          setMessage(result.error);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">
          Team source decision
          <select
            className="mt-1.5 block w-full"
            value={decision}
            onChange={(event) => setDecision(event.target.value as typeof decision)}
          >
            <option value="accepted">Accept this source assessment</option>
            <option value="rejected">Dispute this assessment</option>
            <option value="needs_follow_up">Needs follow-up</option>
          </select>
        </label>
        <label className="field-label">
          Reviewer note
          <input
            className="mt-1.5 block w-full"
            value={note}
            maxLength={4000}
            onChange={(event) => setNote(event.target.value)}
            placeholder={decision === 'accepted' ? 'Optional' : 'Required reason'}
          />
        </label>
      </div>
      {decision === 'accepted' ? (
        <details className="disclosure">
          <summary>Optional non-material corrections</summary>
          <div className="disclosure-body grid gap-3 sm:grid-cols-3">
            <label className="field-label">
              Display title
              <input
                className="mt-1.5 block w-full"
                value={title}
                maxLength={500}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Keep the machine title"
              />
            </label>
            <label className="field-label">
              Checklist category
              <select
                className="mt-1.5 block w-full"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Use deterministic category</option>
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Mandatory classification
              <select
                className="mt-1.5 block w-full"
                value={mandatoryClass}
                onChange={(event) => setMandatoryClass(event.target.value)}
              >
                <option value="">Use source wording</option>
                <option value="mandatory">Mandatory</option>
                <option value="optional">Optional</option>
                <option value="uncertain">Uncertain</option>
              </select>
            </label>
          </div>
          <p className="text-metadata mt-2">
            Material changes to the obligation require follow-up and a new source assessment.
          </p>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button className="secondary-action btn-sm" disabled={pending}>
          {pending ? 'Recording…' : 'Record team decision'}
        </button>
        {currentDecision ? (
          <span className="text-metadata">
            Current decision: {currentDecision.replaceAll('_', ' ')}
          </span>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="text-sm text-ink-soft">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function Phase9CoverageReviewControls({
  workspaceId,
  evaluationRunId,
  documentId,
  pageNumber,
  currentDecision,
  reviewSessionId,
  sourceHref,
}: {
  workspaceId: string;
  evaluationRunId: string;
  documentId: string;
  pageNumber: number;
  currentDecision: string | null;
  reviewSessionId?: string;
  sourceHref?: string;
}) {
  const router = useRouter();
  const [fallbackReviewSessionId] = useState(() => crypto.randomUUID());
  const activeReviewSessionId = reviewSessionId ?? fallbackReviewSessionId;
  const [decision, setDecision] = useState<'accepted' | 'needs_follow_up'>(
    currentDecision === 'needs_follow_up' ? 'needs_follow_up' : 'accepted',
  );
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await recordPhase9CoverageReviewAction({
            workspaceId,
            evaluationRunId,
            documentId,
            pageNumber,
            decision,
            note,
            reviewSessionId: activeReviewSessionId,
            idempotencyKey: crypto.randomUUID(),
          });
          setMessage(result.ok ? 'Page exception decision recorded.' : result.error);
          if (result.ok) router.refresh();
        });
      }}
    >
      {sourceHref ? (
        <Link
          className="action-link inline-flex"
          href={sourceHref}
          data-tour-interaction="source-evidence"
          onClick={() => {
            void recordPhase9ReviewActivityAction({
              workspaceId,
              evaluationRunId,
              eventType: 'source_page_opened',
              reviewSessionId: activeReviewSessionId,
              idempotencyKey: crypto.randomUUID(),
              sourceDocumentId: documentId,
              pageNumber,
              metadata: { source: 'coverage_exception' },
            });
          }}
        >
          Open source page {pageNumber}
        </Link>
      ) : null}
      <label className="field-label">
        Exception decision
        <select
          className="mt-1 block w-full"
          value={decision}
          onChange={(event) => setDecision(event.target.value as typeof decision)}
        >
          <option value="accepted">Checked — no unresolved omission</option>
          <option value="needs_follow_up">Needs follow-up</option>
        </select>
      </label>
      <label className="field-label">
        Review note
        <input
          className="mt-1 block w-full"
          value={note}
          maxLength={4000}
          onChange={(event) => setNote(event.target.value)}
          placeholder={decision === 'needs_follow_up' ? 'Required reason' : 'Optional'}
        />
      </label>
      <button className="secondary-action btn-sm" disabled={pending}>
        {pending ? 'Recording…' : 'Record page decision'}
      </button>
      {currentDecision ? (
        <p className="text-metadata">Current decision: {currentDecision.replaceAll('_', ' ')}</p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-ink-soft">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function PublishReviewedFindings({
  workspaceId,
  evaluationRunId,
  eligibleCount,
  reviewedCount,
  totalCount,
  followUpCount,
  coverageExceptionCount,
  coverageReviewedCount,
  coverageFollowUpCount,
  publicationEligible,
  invalidAcceptedCount,
  unrepresentedFindingCount,
}: {
  workspaceId: string;
  evaluationRunId: string;
  eligibleCount: number;
  reviewedCount: number;
  totalCount: number;
  followUpCount: number;
  coverageExceptionCount: number;
  coverageReviewedCount: number;
  coverageFollowUpCount: number;
  publicationEligible: boolean;
  invalidAcceptedCount: number;
  unrepresentedFindingCount: number;
}) {
  const router = useRouter();
  const [reviewSessionId] = useState(() => crypto.randomUUID());
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="surface-card rail-teal p-5">
      <p className="section-kicker">Controlled handoff</p>
      <h2 className="section-title mt-1.5">Publish reviewed requirements</h2>
      <p className="section-lede mt-2">
        {eligibleCount} accepted, source-supported, active finding
        {eligibleCount === 1 ? '' : 's'} can enter the requirement register. Other machine findings
        remain in this review queue.
      </p>
      <p className="text-metadata mt-2">
        {reviewedCount} of {totalCount} findings have a team decision
        {followUpCount ? ` · ${followUpCount} still need follow-up` : ''}.
      </p>
      <p className="text-metadata mt-1">
        {coverageReviewedCount} of {coverageExceptionCount} page exceptions have a team decision
        {coverageFollowUpCount ? ` · ${coverageFollowUpCount} still need follow-up` : ''}.
      </p>
      {!publicationEligible ? (
        <p className="notice notice-warning mt-3">
          Publication stays locked until every finding and page-level exception has a team decision
          and no follow-up remains unresolved. Rejected or non-active findings remain in the audit
          history and do not become checklist obligations.
          {invalidAcceptedCount
            ? ` ${invalidAcceptedCount} accepted decision${invalidAcceptedCount === 1 ? '' : 's'} no longer pass the source-publication rules.`
            : ''}
          {unrepresentedFindingCount
            ? ` ${unrepresentedFindingCount} machine finding${unrepresentedFindingCount === 1 ? ' is' : 's are'} not represented in the review queue.`
            : ''}
        </p>
      ) : null}
      <label className="mt-4 flex max-w-3xl items-start gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          I understand this publishes accepted source assessments as machine-only requirements with
          human review recorded. It does not claim bidder compliance or authorize submission.
        </span>
      </label>
      <button
        type="button"
        className="primary-action mt-4"
        disabled={!confirmed || eligibleCount === 0 || !publicationEligible || pending}
        onClick={() =>
          start(async () => {
            const result = await publishReviewedPhase9FindingsAction({
              workspaceId,
              evaluationRunId,
              reviewSessionId,
              attemptIdempotencyKey: crypto.randomUUID(),
              completionIdempotencyKey: crypto.randomUUID(),
            });
            setMessage(
              result.ok
                ? `${result.publishedCount} reviewed requirement${result.publishedCount === 1 ? '' : 's'} ${result.reused ? 'were already published' : 'published'}. You can now open the requirement register and build the submission checklist.${result.instrumentationWarning ? ` ${result.instrumentationWarning}` : ''}`
                : result.error,
            );
            if (result.ok) router.refresh();
          })
        }
      >
        {pending ? 'Publishing…' : 'Publish accepted requirements'}
      </button>
      {message ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {message}
        </p>
      ) : null}
    </div>
  );
}
