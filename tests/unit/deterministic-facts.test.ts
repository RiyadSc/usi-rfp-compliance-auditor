import { describe, expect, it } from 'vitest';
import {
  compareTypedDateFact,
  compareTypedNumberFact,
  extractTypedDateFacts,
  extractTypedNumberFacts,
} from '../../packages/ai/src/deterministic-verification';

function compareDate(candidate: string, source: string) {
  const candidateFact = extractTypedDateFacts(candidate)[0];
  expect(candidateFact).toBeDefined();
  return compareTypedDateFact(candidateFact!, extractTypedDateFacts(source));
}

function compareNumber(candidate: string, source: string) {
  const candidateFact = extractTypedNumberFacts(candidate)[0];
  expect(candidateFact).toBeDefined();
  return compareTypedNumberFact(candidateFact!, extractTypedNumberFacts(source));
}

describe('typed deterministic date facts', () => {
  it('matches the same unambiguous date in different formats', () => {
    expect(
      compareDate('Proposals are due March 4, 2027.', 'The submission deadline is 2027-03-04.'),
    ).toMatchObject({ comparison: 'match' });
  });

  it('does not compare submission and question deadlines', () => {
    expect(
      compareDate(
        'Proposals are due March 4, 2027.',
        'Questions must be received by March 4, 2027.',
      ),
    ).toMatchObject({ comparison: 'uncertain', reason: 'semantic_role_mismatch' });
  });

  it('reports explicit party scope separately from date equality', () => {
    expect(
      compareDate(
        'Offerors must attend the meeting on March 4, 2027.',
        'City staff must attend the meeting on March 4, 2027.',
      ),
    ).toMatchObject({
      comparison: 'match',
      reason: 'value_match_scope_mismatch',
      scopeComparison: 'mismatch',
      materialScopeDifferences: ['party'],
    });
  });

  it('rejects a superseded deadline as a match for its active replacement', () => {
    expect(
      compareDate(
        'Proposals are due April 15, 2026.',
        'The submission deadline is changed to April 22, 2026.',
      ),
    ).toMatchObject({ comparison: 'mismatch', reason: 'normalized_value_mismatch' });
  });

  it('preserves conflicting deadline values rather than selecting one', () => {
    const candidate = extractTypedDateFacts('Proposals are due April 15, 2026.')[0]!;
    const sources = extractTypedDateFacts(
      'The submission deadline is April 15, 2026. The submission deadline is April 22, 2026.',
    );
    expect(compareTypedDateFact(candidate, sources)).toMatchObject({ comparison: 'match' });
    expect(new Set(sources.map((fact) => fact.normalized)).size).toBe(2);
  });

  it('marks ambiguous numeric dates uncertain', () => {
    expect(
      compareDate('Proposals are due 03/04/2027.', 'The submission deadline is 03/04/2027.'),
    ).toMatchObject({ comparison: 'uncertain', reason: 'ambiguous_candidate' });
  });

  it('compares explicit time/timezone independently and preserves an absent qualifier as unknown', () => {
    expect(
      compareDate(
        'Proposals are due March 4, 2027 at 2:00 PM ET.',
        'The submission deadline is March 4, 2027 at 2:00 PM ET.',
      ),
    ).toMatchObject({ comparison: 'match' });
    expect(
      compareDate(
        'Proposals are due March 4, 2027.',
        'The submission deadline is March 4, 2027 at 2:00 PM ET.',
      ),
    ).toMatchObject({ comparison: 'match', reason: 'all_material_fields_match' });
    expect(
      compareDate(
        'Proposals are due March 4, 2027 at 5:00 PM ET.',
        'The submission deadline is March 4, 2027 at 2:00 PM ET.',
      ),
    ).toMatchObject({ comparison: 'mismatch', reason: 'time_mismatch' });
  });

  it('marks an unanchored relative deadline uncertain', () => {
    const fact = extractTypedDateFacts('The response is due within ten days.')[0]!;
    expect(compareTypedDateFact(fact, [fact])).toMatchObject({
      comparison: 'uncertain',
      reason: 'relative_date_without_anchor',
    });
  });

  it('types a descriptive date separately from an obligation', () => {
    expect(
      extractTypedDateFacts('Illustrative example only: March 4, 2027 is not a deadline.')[0],
    ).toMatchObject({ role: 'descriptive_example' });
  });
});

describe('typed deterministic numerical facts', () => {
  it('normalizes monetary scales', () => {
    expect(
      compareNumber(
        'Insurance must be at least $2M per occurrence.',
        'Insurance must be at least $2,000,000 per occurrence.',
      ),
    ).toMatchObject({ comparison: 'match' });
  });

  it('separates per-occurrence and aggregate insurance', () => {
    expect(
      compareNumber(
        'Insurance must be at least $2,000,000 per occurrence.',
        'Insurance must be at least $2,000,000 aggregate.',
      ),
    ).toMatchObject({ comparison: 'uncertain', reason: 'semantic_role_mismatch' });
  });

  it('requires the comparison operator to match', () => {
    expect(
      compareNumber('The exact price is $2,000,000.', 'The minimum price is $2,000,000.'),
    ).toMatchObject({ comparison: 'mismatch', reason: 'operator_mismatch' });
  });

  it('does not transfer staffing counts between roles', () => {
    expect(
      compareNumber(
        'At least 4 project managers are required.',
        'At least 4 site supervisors are required.',
      ),
    ).toMatchObject({ comparison: 'mismatch', reason: 'material_scope_mismatch' });
  });

  it('does not treat a percentage and a decimal as the same typed value', () => {
    expect(
      compareNumber(
        'The bid bond is 10%.',
        'The bid bond percentage expressed as a decimal is 0.10.',
      ),
    ).toMatchObject({ comparison: 'mismatch', reason: 'unit_mismatch' });
  });

  it('compares range endpoints', () => {
    expect(
      compareNumber(
        'Staffing must range from 2 to 4 FTEs.',
        'Staffing must range from 2 to 4 FTEs.',
      ),
    ).toMatchObject({ comparison: 'match' });
  });

  it('rejects a superseded numerical threshold as the active value', () => {
    expect(
      compareNumber(
        'Insurance must be at least $2,000,000 per occurrence.',
        'Insurance is revised to at least $3,000,000 per occurrence.',
      ),
    ).toMatchObject({ comparison: 'mismatch', reason: 'normalized_value_mismatch' });
  });

  it('preserves conflicting active thresholds', () => {
    const facts = extractTypedNumberFacts(
      'Insurance must be at least $3,000,000 per occurrence. Insurance must be at least $4,000,000 per occurrence.',
    );
    expect(new Set(facts.map((fact) => fact.normalizedValue)).size).toBe(2);
  });

  it('does not classify form identifiers as quantities', () => {
    expect(extractTypedNumberFacts('Offerors must complete Form B-2.')).toHaveLength(0);
  });

  it('requires identical values to have compatible site scope', () => {
    expect(
      compareNumber(
        'North Campus requires at least 4 security officers.',
        'South Campus requires at least 4 security officers.',
      ),
    ).toMatchObject({ comparison: 'mismatch', reason: 'material_scope_mismatch' });
  });
});
