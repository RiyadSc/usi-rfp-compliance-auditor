import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluatePhase9NewJerseyReviewAcceleration } from '../../scripts/lib/phase9-review-acceleration-evaluator';

const machineSnapshot = JSON.parse(
  readFileSync('fixtures/eval/phase9-review-acceleration-new-jersey-v1.json', 'utf8'),
) as unknown;
const sourcePackage = JSON.parse(
  readFileSync('benchmarks/new-jersey-08-x-39231/source-pages-v1.json', 'utf8'),
) as {
  source: { machineFindingsRead: boolean; databaseTablesRead: string[] };
  pages: unknown[];
};
const draft = JSON.parse(
  readFileSync('benchmarks/new-jersey-08-x-39231/critical-obligations-draft-v1.json', 'utf8'),
) as {
  runtimeEligible: boolean;
  status: string;
  cases: Array<{ quoteMatch: string; humanSubjectMatterReview: string }>;
};

function hashEvaluation(): string {
  return createHash('sha256')
    .update(JSON.stringify(evaluatePhase9NewJerseyReviewAcceleration(machineSnapshot)))
    .digest('hex');
}

function sourceFiles(root: string): string[] {
  const rows: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (
      entry.isDirectory() &&
      !['node_modules', '.next', 'dist', 'coverage', '.turbo'].includes(entry.name)
    )
      rows.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|js|mjs|mts)$/.test(entry.name)) rows.push(path);
  }
  return rows;
}

describe('independent New Jersey benchmark preparation', () => {
  it('authors from immutable source pages only and leaves every draft case pending review', () => {
    expect(sourcePackage.source).toMatchObject({
      machineFindingsRead: false,
      databaseTablesRead: ['documents', 'document_pages'],
    });
    expect(sourcePackage.pages).toHaveLength(48);
    expect(draft).toMatchObject({
      runtimeEligible: false,
      status: 'draft_pending_independent_human_review',
    });
    expect(draft.cases.length).toBeGreaterThanOrEqual(20);
    expect(
      draft.cases.every(
        (entry) => entry.quoteMatch === 'exact' && entry.humanSubjectMatterReview === 'pending',
      ),
    ).toBe(true);

    const exporter = readFileSync('scripts/export-phase9-new-jersey-benchmark-source.mts', 'utf8');
    const preparer = readFileSync('scripts/prepare-phase9-new-jersey-benchmark.mts', 'utf8');
    expect(exporter).toContain(".from('documents')");
    expect(exporter).toContain(".from('document_pages')");
    expect(exporter).not.toMatch(/\.from\('phase9_/);
    expect(preparer).not.toMatch(
      /phase9_findings|phase9_candidate_seeds|phase9-review-acceleration-new-jersey/i,
    );
  });

  it('keeps runtime packages free of the draft benchmark dependency', () => {
    const runtimeSource = [...sourceFiles('apps'), ...sourceFiles('packages')]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(runtimeSource).not.toMatch(
      /benchmarks\/new-jersey-08-x-39231|critical-obligations-draft-v1/,
    );
  });

  it('produces identical application prioritization with benchmark absent, present, or modified', () => {
    const originalRoot = process.env.PHASE9_BENCHMARK_ROOT;
    const temporary = mkdtempSync(join(tmpdir(), 'phase9-benchmark-isolation-'));
    const absent = join(temporary, 'absent.json');
    const present = join(temporary, 'present.json');
    const modified = join(temporary, 'modified.json');
    writeFileSync(present, JSON.stringify(draft), 'utf8');
    writeFileSync(modified, JSON.stringify({ ...draft, cases: [] }), 'utf8');
    const hashes: string[] = [];
    try {
      for (const path of [absent, present, modified]) {
        process.env.PHASE9_BENCHMARK_ROOT = path;
        hashes.push(hashEvaluation());
      }
    } finally {
      if (originalRoot === undefined) delete process.env.PHASE9_BENCHMARK_ROOT;
      else process.env.PHASE9_BENCHMARK_ROOT = originalRoot;
      rmSync(temporary, { recursive: true, force: true });
    }
    expect(new Set(hashes).size).toBe(1);
  });
});
