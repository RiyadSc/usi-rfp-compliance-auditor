'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordHumanReview } from './actions';

const DECISIONS = [
  ['accepted', 'Accept source assessment'],
  ['rejected', 'Dispute source assessment'],
  ['needs_follow_up', 'Needs follow-up'],
  ['waived', 'Record waiver'],
] as const;

export function ReviewControls({
  workspaceId,
  findingId,
  relationshipId,
}: {
  workspaceId: string;
  findingId: string;
  relationshipId?: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<(typeof DECISIONS)[number][0]>('accepted');
  const [note, setNote] = useState('');
  const [correctedValues, setCorrectedValues] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, begin] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        begin(async () => {
          const result = await recordHumanReview({
            workspaceId,
            findingId,
            decision,
            note,
            correctedValues,
            ...(relationshipId ? { relationshipId } : {}),
          });
          setMessage(
            result.ok
              ? 'Team decision recorded. This does not authorize submission.'
              : result.error,
          );
          if (result.ok) router.refresh();
        });
      }}
    >
      <p className="text-sm text-ink-soft">
        Records whether your team accepts the machine’s source assessment. It does{' '}
        <strong className="font-semibold text-ink">not</strong> authorize submission or replace
        final human review.
      </p>
      <label className="field-label block">
        {relationshipId ? 'Assessment outcome' : 'Team decision'}
        <select
          value={decision}
          onChange={(event) => setDecision(event.target.value as typeof decision)}
          className="mt-1.5 block w-full"
        >
          {DECISIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label block">
        {relationshipId ? 'Relationship note' : 'Reviewer note'}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={4000}
          className="mt-1.5 min-h-24 w-full"
        />
      </label>
      <details className="disclosure">
        <summary className="text-sm font-medium text-ink-soft">
          Advanced: structured correction (optional)
        </summary>
        <label className="field-label mt-3 block">
          {relationshipId ? 'Structured relationship correction' : 'Proposed corrected values'}
          {' (JSON object for technical reviewers)'}
          <textarea
            value={correctedValues}
            onChange={(event) => setCorrectedValues(event.target.value)}
            placeholder={'{"deadline":"2027-04-22"}'}
            maxLength={4000}
            className="mono mt-1.5 min-h-20 w-full text-xs"
          />
        </label>
      </details>
      <button disabled={pending} className="primary-action">
        {pending ? 'Recording…' : relationshipId ? 'Record relationship review' : 'Record review'}
      </button>
      {message ? (
        <p role="status" className="text-sm text-ink-soft">
          {message}
        </p>
      ) : null}
    </form>
  );
}
