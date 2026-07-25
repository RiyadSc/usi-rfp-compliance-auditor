'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordHumanReview } from './actions';

const DECISIONS = [
  ['accepted', 'Accept machine assessment'],
  ['rejected', 'Reject machine assessment'],
  ['needs_follow_up', 'Needs follow-up'],
  ['waived', 'Waive review'],
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
          setMessage(result.ok ? 'Review decision recorded.' : result.error);
          if (result.ok) router.refresh();
        });
      }}
    >
      <label className="field-label block">
        {relationshipId ? 'Assessment outcome' : 'Decision'}
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
      <label className="field-label block">
        {relationshipId ? 'Structured relationship correction' : 'Proposed corrected values'}
        {' (optional JSON object)'}
        <textarea
          value={correctedValues}
          onChange={(event) => setCorrectedValues(event.target.value)}
          placeholder={'{"deadline":"2027-04-22"}'}
          maxLength={4000}
          className="mono mt-1.5 min-h-20 w-full text-xs"
        />
      </label>
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
