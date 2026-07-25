import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PHASE9_LEDGER_CEILING_USD,
  assessPhase9DeterministicCandidate,
  buildPhase9CallPlan,
  buildPhase9PageBlocks,
  classifyPhase9Coverage,
  extractPhase9AmendmentRelationships,
  finalizePhase9Finding,
  minePhase9DeterministicCandidates,
  phase9CompactExtractionOutputSchema,
  phase9CompactVerificationOutputSchema,
  phase9CoverageOutputSchema,
  phase9IncrementalInvalidation,
  phase9PrecedenceForEvidence,
  phase9ProviderInputCharacters,
  phase9ProviderCacheKey,
  phase9StableHash,
  reducePhase9Candidates,
  type Phase9CandidateSeed,
  type Phase9SourceBlock,
} from '../../packages/ai/src';

const HASH = 'a'.repeat(64);

function blocks(texts: string[], state: Phase9SourceBlock['parserState'] = 'native') {
  return buildPhase9PageBlocks({
    workspaceId: 'workspace-a',
    documentId: 'document-a',
    documentName: 'holdout.pdf',
    sourceHash: HASH,
    pages: texts.map((text, index) => ({
      pageNumber: index + 1,
      text,
      parserConfidence: state === 'uncertain' ? 0.4 : 1,
      parserState: state,
    })),
    windowCharacters: 500,
    overlapCharacters: 100,
  });
}

describe('Phase 9 coverage-led recovery', () => {
  it('supports exact attendance strongly-suggested meeting language deterministically', () => {
    const source = blocks(['1.2.3 Bidders Conference. Attendance is strongly suggested.']);
    const coverage = classifyPhase9Coverage(source);
    const mined = minePhase9DeterministicCandidates(source, coverage);
    const candidate = mined.find((item) =>
      item.evidenceText.includes('Attendance is strongly suggested'),
    );
    expect(candidate?.requirementType).toBe('meeting');
    expect(candidate?.deterministicSignals).toContain('strongly_suggested');
    const finding = finalizePhase9Finding({
      candidate: candidate!,
      blocks: source,
    });
    expect(finding?.sourceSupportStatus).toBe('supported');
    expect(finding?.proofRequirement).toBe('none_identified');
  });

  it('gives every source block one explicit coverage state', () => {
    const source = blocks([
      'Bidder must submit Form A by April 7, 2027.',
      'This paragraph is descriptive background only.',
      'Attendance is strongly suggested.',
    ]);
    const coverage = classifyPhase9Coverage(source);
    expect(coverage).toHaveLength(source.length);
    expect(new Set(coverage.map((item) => item.blockId))).toEqual(
      new Set(source.map((item) => item.id)),
    );
    expect(coverage.map((item) => item.route)).toEqual([
      'selected_for_deterministic_candidate',
      'reviewed_and_rejected_as_non_requirement',
      'selected_for_deterministic_candidate',
    ]);
  });

  it('mines atomic dates, forms, and exact native spreadsheet cells', () => {
    const source = blocks([
      'Bidders must submit Form A. Questions are due April 7, 2027 at 2:00 PM EST.',
    ]);
    const cell = {
      ...source[0]!,
      id: 'b'.repeat(64),
      blockType: 'spreadsheet_cell' as const,
      pageNumber: null,
      sheetName: 'Guard Services',
      cellRange: 'I11',
      text: 'Cell I11: Union Rate Markup % (must list, even if 0%)',
    };
    const all = [...source, cell];
    const candidates = minePhase9DeterministicCandidates(all, classifyPhase9Coverage(all));
    expect(candidates.some((candidate) => candidate.formReference?.startsWith('Form A'))).toBe(
      true,
    );
    expect(candidates.some((candidate) => candidate.dateValue === 'April 7, 2027')).toBe(true);
    expect(
      candidates.some(
        (candidate) =>
          candidate.discoveryRoute === 'spreadsheet' && candidate.sourceBlockIds.includes(cell.id),
      ),
    ).toBe(true);
  });

  it('removes only proven duplicate candidate instances and preserves evidence', () => {
    const source = blocks(['Bidder must submit Form A.']);
    const mined = minePhase9DeterministicCandidates(source, classifyPhase9Coverage(source));
    const reduced = reducePhase9Candidates([
      mined[0]!,
      {
        ...mined[0]!,
        id: 'c'.repeat(64),
        documentId: 'document-b',
        sourceBlockIds: ['c'.repeat(64)],
      },
    ]);
    expect(reduced.candidates).toHaveLength(1);
    expect(reduced.candidates[0]!.sourceBlockIds).toHaveLength(2);
  });

  it('fails parser-uncertain evidence closed and never claims human approval', () => {
    const source = blocks(['Bidder must submit Form A.'], 'uncertain');
    const candidate: Phase9CandidateSeed = {
      id: 'd'.repeat(64),
      sourceBlockIds: [source[0]!.id],
      documentId: source[0]!.documentId,
      requirementType: 'required_form',
      obligationText: 'Bidder must submit Form A.',
      evidenceText: 'Bidder must submit Form A.',
      subject: null,
      action: 'submit',
      condition: null,
      dateValue: null,
      numberValue: null,
      unit: null,
      formReference: 'Form A',
      deterministicSignals: ['must', 'submit', 'form_identifier'],
      discoveryRoute: 'deterministic',
      needsVerification: true,
      minerVersion: 'phase9-deterministic-miner-v1',
    };
    expect(assessPhase9DeterministicCandidate({ candidate, blocks: source })).toMatchObject({
      sourceSupportStatus: 'parser_uncertain',
      precedenceStatus: 'undetermined',
      machineOnly: true,
      humanReviewStatus: 'pending',
    });
  });

  it('separates high-recall discovery from conservative deterministic support', () => {
    const source = blocks(['Insurance information may be relevant to evaluation.']);
    const candidate: Phase9CandidateSeed = {
      id: '9'.repeat(64),
      sourceBlockIds: [source[0]!.id],
      documentId: source[0]!.documentId,
      requirementType: 'insurance',
      obligationText: source[0]!.text,
      evidenceText: source[0]!.text,
      subject: null,
      action: null,
      condition: null,
      dateValue: null,
      numberValue: null,
      unit: null,
      formReference: null,
      deterministicSignals: ['insurance', 'evaluation'],
      discoveryRoute: 'deterministic',
      needsVerification: true,
      minerVersion: 'phase9-deterministic-miner-v1',
    };
    expect(assessPhase9DeterministicCandidate({ candidate, blocks: source })).toMatchObject({
      sourceSupportStatus: 'requires_semantic_verification',
    });
    expect(finalizePhase9Finding({ candidate, blocks: source })).toBeNull();
  });

  it('plans the complete serialized provider envelope rather than source text alone', () => {
    const source = blocks(['Bidder must submit Form A by April 7, 2027.']);
    const characters = phase9ProviderInputCharacters({
      taskType: 'targeted_extraction',
      blocks: source,
      candidates: [],
    });
    expect(characters).toBeGreaterThan(source[0]!.text.length + 1_000);
  });

  it('keeps duplicate evidence locations ambiguous instead of inventing one page', () => {
    const source = blocks([
      'DO NOT SUBMIT THESE FORMS UNTIL INSTRUCTED TO DO SO.',
      'DO NOT SUBMIT THESE FORMS UNTIL INSTRUCTED TO DO SO.',
    ]);
    const candidate: Phase9CandidateSeed = {
      id: 'e'.repeat(64),
      sourceBlockIds: source.map((block) => block.id),
      documentId: source[0]!.documentId,
      requirementType: 'required_form',
      obligationText: source[0]!.text,
      evidenceText: source[0]!.text,
      subject: null,
      action: 'submit',
      condition: null,
      dateValue: null,
      numberValue: null,
      unit: null,
      formReference: null,
      deterministicSignals: ['submit', 'form'],
      discoveryRoute: 'deterministic',
      needsVerification: true,
      minerVersion: 'phase9-deterministic-miner-v1',
    };
    const assessment = assessPhase9DeterministicCandidate({
      candidate,
      blocks: source,
    });
    expect(assessment.ambiguityCode).toBe('evidence_location_ambiguous');
    expect(assessment.evidenceLocations).toHaveLength(2);
  });

  it('resolves explicit amendment chains conservatively', () => {
    const text = [
      'Pre-Bid Conference changed from "TBA" to "Thursday, March 31, 2022; 1:00 PM".',
      'Pre-Bid Conference changed from "Thursday, March 31, 2022; 1:00 PM" to "Tuesday, April 5, 2022; 1:00 PM".',
      'Pre-Bid Conference changed from "Tuesday, April 5, 2022; 1:00 PM" to "Took place Tuesday, April 5, 2022".',
    ].join(' ');
    const relationships = extractPhase9AmendmentRelationships(text);
    expect(relationships).toHaveLength(3);
    expect(
      phase9PrecedenceForEvidence(
        'Pre-Bid Conference changed from "Thursday, March 31, 2022; 1:00 PM',
        relationships,
      ),
    ).toBe('superseded');
    expect(
      phase9PrecedenceForEvidence('to "Tuesday, April 5, 2022; 1:00 PM".', relationships),
    ).toBe('active');
    expect(phase9PrecedenceForEvidence('Unrelated Form A', relationships)).toBe('active');
  });

  it('uses compact strict task schemas', () => {
    expect(phase9CoverageOutputSchema.safeParse({ decisions: [] }).success).toBe(true);
    expect(
      phase9CompactExtractionOutputSchema.safeParse({
        candidates: [
          {
            sourceBlockIds: [HASH],
            requirementType: 'deadline',
            obligationText: 'Submit by April 7.',
            evidenceText: 'Submit by April 7.',
            subject: null,
            action: 'Submit',
            condition: null,
            dateValue: 'April 7',
            numberValue: null,
            unit: null,
            formReference: null,
            needsVerification: true,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      phase9CompactVerificationOutputSchema.safeParse({
        results: [
          {
            candidateId: HASH,
            support: 'supported',
            precedence: 'active',
            proofRequirement: 'none_identified',
            evidenceBlockIds: [HASH],
            ambiguityCode: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('binds cache keys to workspace, source, parser, prompt, schema, and model', () => {
    const base = {
      workspaceId: 'workspace-a',
      sourcePackageHash: HASH,
      sourceBlockHashes: ['b'.repeat(64)],
      parserVersion: 'parser-v1',
      normalizationVersion: 'normalize-v1',
      tableVersion: 'table-v1',
      promptVersion: 'prompt-v1',
      schemaVersion: 'schema-v1',
      taskType: 'targeted_extraction' as const,
      modelId: 'model-v1',
      reasoning: 'low' as const,
      evaluatorVersion: 'evaluator-v1',
    };
    const key = phase9ProviderCacheKey(base);
    for (const changed of [
      { parserVersion: 'parser-v2' },
      { promptVersion: 'prompt-v2' },
      { modelId: 'model-v2' },
      { workspaceId: 'workspace-b' },
      { sourcePackageHash: 'c'.repeat(64) },
    ]) {
      expect(phase9ProviderCacheKey({ ...base, ...changed })).not.toBe(key);
    }
  });

  it('limits addendum-only invalidation to dependent blocks and candidates', () => {
    const primary = blocks(['Bidder must submit Form A.'])[0]!;
    const addendum = {
      ...blocks(['Addendum: bidder must submit Form B.'])[0]!,
      id: '8'.repeat(64),
      documentId: 'addendum-document',
    };
    const all = [primary, addendum];
    const candidates = minePhase9DeterministicCandidates(all, classifyPhase9Coverage(all));
    const scope = phase9IncrementalInvalidation({
      changedDocumentIds: ['addendum-document'],
      blocks: all,
      candidates,
    });
    expect(scope.changedBlockIds).toEqual([addendum.id]);
    expect(scope.affectedCandidateIds.length).toBeGreaterThan(0);
    expect(scope.unchangedBlockCount).toBe(1);
    expect(
      candidates
        .filter((candidate) => scope.affectedCandidateIds.includes(candidate.id))
        .every((candidate) => candidate.documentId === 'addendum-document'),
    ).toBe(true);
  });

  it('builds an exact bounded call plan and rejects the obsolete cost shape', () => {
    const source = blocks([
      'Bidder must submit Form A by April 7, 2027.',
      'Insurance information may be relevant.',
    ]);
    const coverage = classifyPhase9Coverage(source);
    const candidates = reducePhase9Candidates(
      minePhase9DeterministicCandidates(source, coverage),
    ).candidates;
    const plan = buildPhase9CallPlan({
      workspaceId: 'workspace-a',
      sourcePackageHash: HASH,
      parserVersion: 'parser-v1',
      normalizationVersion: 'normalization-v1',
      tableVersion: 'table-v1',
      evaluatorVersion: 'evaluator-v1',
      blocks: source,
      coverage,
      candidates,
    });
    expect(plan.hardMaximumUsd).toBeLessThan(PHASE9_LEDGER_CEILING_USD);
    expect(plan.hardMaximumUsd).toBeLessThan(88.81428);
    expect(plan.planHash).toBe(phase9StableHash({ ...plan, planHash: undefined }));
    const cachedKeys = new Set(plan.tasks.map((task) => task.cacheKey));
    for (let replay = 0; replay < 3; replay++) {
      const cachedPlan = buildPhase9CallPlan({
        workspaceId: 'workspace-a',
        sourcePackageHash: HASH,
        parserVersion: 'parser-v1',
        normalizationVersion: 'normalization-v1',
        tableVersion: 'table-v1',
        evaluatorVersion: 'evaluator-v1',
        blocks: source,
        coverage,
        candidates,
        cachedKeys,
      });
      expect(cachedPlan.hardMaximumUsd).toBe(0);
    }
  });

  it('keeps expected-answer artifacts out of production recovery and provider code', () => {
    for (const relative of [
      'packages/ai/src/phase9-recovery.ts',
      'packages/ai/src/phase9-provider.ts',
      'scripts/lib/phase9-fac115-production.mts',
    ]) {
      const source = readFileSync(resolve(relative), 'utf8');
      expect(source).not.toMatch(/phase9-expected-answers|known-answers-draft|expectedAnswer/i);
    }
  });

  it('covers native, large, table, spreadsheet, addendum, and scanned holdout shapes', () => {
    const native = blocks(['The bidder shall submit Form X.']);
    const large = buildPhase9PageBlocks({
      workspaceId: 'workspace-a',
      documentId: 'large',
      documentName: 'large.pdf',
      sourceHash: HASH,
      pages: Array.from({ length: 120 }, (_, index) => ({
        pageNumber: index + 1,
        text: index === 119 ? 'The bidder must include Attachment Z.' : `Background ${index + 1}.`,
      })),
    });
    const table = {
      ...native[0]!,
      id: 'f'.repeat(64),
      blockType: 'table' as const,
      text: 'Table row: bidder shall submit Form Y.',
    };
    const sheet = {
      ...native[0]!,
      id: '1'.repeat(64),
      blockType: 'spreadsheet_cell' as const,
      pageNumber: null,
      sheetName: 'Rates',
      cellRange: 'B4',
      text: 'Cell B4: bidder must list 2.5%.',
    };
    const scanned = blocks(['Unreadable mandatory form'], 'uncertain');
    const all = [...native, ...large, table, sheet, ...scanned];
    const coverage = classifyPhase9Coverage(all);
    expect(coverage).toHaveLength(all.length);
    expect(coverage.some((item) => item.route === 'selected_for_table_extraction')).toBe(true);
    expect(coverage.some((item) => item.route === 'selected_for_spreadsheet_extraction')).toBe(
      true,
    );
    expect(coverage.some((item) => item.route === 'parser_uncertain')).toBe(true);
  });
});
