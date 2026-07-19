import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import {
  PHASE8_VERSIONS,
  consolidatedMetricsSchema,
  generateChecklistItems,
  calculateBlockers,
  type BlockerInputItem,
} from '@usi/domain';
import { MockProvider } from '../packages/ai/src/index';
import {
  EXPECTED_MISSING_FORM_IDS,
  FIVE_MISSING_FORM_CASES,
} from '../fixtures/eval/checklist-five-missing-forms';
import { runVerificationEvaluation } from './verification-evaluation-runner.mjs';
import { scoreVerificationPipelineRun } from './verification-metrics.mjs';

const artifactDirectory = 'artifacts/evaluation';
await mkdir(artifactDirectory, { recursive: true });

// Phase 6 and 7 evaluators are deterministic and provider-free. Running them here makes the
// consolidated manifest a fresh evaluation rather than a passive summary of old artifacts.
for (const evaluator of ['scripts/eval-proposal-audit.mts', 'scripts/eval-reporting.mts']) {
  execFileSync(process.execPath, ['--import', 'tsx', evaluator], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, PHASE3_LIVE_EVAL: '0', PHASE4_LIVE_EVAL: '0' },
  });
}

const verification = await runVerificationEvaluation(new MockProvider());
const phase4 = scoreVerificationPipelineRun(verification);

const checklistItems = generateChecklistItems(
  FIVE_MISSING_FORM_CASES.map((entry) => entry.source),
).map((item) => {
  const fixture = FIVE_MISSING_FORM_CASES.find(
    (entry) => entry.source.findingId === item.findingId,
  );
  return {
    ...item,
    artifactState: fixture?.missing ? 'missing' : 'reviewed',
  } as BlockerInputItem;
});
const phase5Blockers = calculateBlockers(checklistItems, new Date('2027-01-01T00:00:00Z'));
const actualMissingForms = phase5Blockers
  .filter((blocker) => blocker.type === 'missing_mandatory_form')
  .map((blocker) => {
    const item = checklistItems.find((candidate) => candidate.stableKey === blocker.itemStableKey);
    return FIVE_MISSING_FORM_CASES.find((entry) => entry.source.title === item?.title)
      ?.formIdentifier;
  })
  .filter((value): value is string => Boolean(value))
  .sort();
const expectedMissingForms = [...EXPECTED_MISSING_FORM_IDS].sort();

const phase6 = JSON.parse(
  await readFile(`${artifactDirectory}/phase6-proposal-audit-known-answer-v1.json`, 'utf8'),
) as { metrics: Record<string, number> };
const phase7 = JSON.parse(
  await readFile(`${artifactDirectory}/phase7-reporting-known-answer-v1.json`, 'utf8'),
) as { metrics: Record<string, number> };

const metrics = consolidatedMetricsSchema.parse({
  criticalFalseSupported:
    phase4.final.criticalFalseSupported + (phase6.metrics.criticalFalseSupported ?? 0),
  criticalFalseActive: phase4.final.criticalFalseActive,
  criticalFalseConsistent: phase6.metrics.criticalFalseConsistent ?? 0,
  falseBlockers: Number(
    JSON.stringify(actualMissingForms) !== JSON.stringify(expectedMissingForms),
  ),
  falseMissingForms: Number(
    JSON.stringify(actualMissingForms) !== JSON.stringify(expectedMissingForms),
  ),
  falseMissingResponses: Number(phase6.metrics.missingResponseRecall !== 1),
  falseMerges: phase4.final.falseMergeCount + (phase6.metrics.falseMerges ?? 0),
  destructiveMerges: phase6.metrics.destructiveMerges ?? 0,
  injectionInfluence: phase4.final.injectionInfluence + (phase6.metrics.injectionInfluence ?? 0),
  crossWorkspaceLeaks:
    (phase6.metrics.crossWorkspaceLeaks ?? 0) + (phase7.metrics.crossWorkspaceLeaks ?? 0),
  unauthorizedDownloads: phase7.metrics.unauthorizedDownloads ?? 0,
  prohibitedLanguageViolations: phase7.metrics.prohibitedLanguageViolations ?? 0,
  csvInjectionVulnerabilities: phase7.metrics.csvInjectionVulnerabilities ?? 0,
  evidenceValidity: Number(
    phase4.final.quoteValidity === 1 &&
      phase6.metrics.evidenceValidity === 1 &&
      phase7.metrics.evidenceLinkValidity === 1,
  ),
  citationValidity: Number(
    phase4.final.citationAccuracy === 1 && phase6.metrics.citationValidity === 1,
  ),
  provenanceValidity: phase7.metrics.provenanceValidity,
  schemaAdherence: Number(
    phase4.passA.schemaAdherence === 1 &&
      phase4.passB.schemaAdherence === 1 &&
      phase4.final.schemaAdherence === 1 &&
      phase6.metrics.schemaAdherence === 1,
  ),
  knownAnswerCaseAccuracy: Number(
    phase4.final.sourceStatusAccuracy === 1 &&
      phase4.final.precedenceAccuracy === 1 &&
      phase4.final.dateAccuracy === 1 &&
      phase4.final.numberAccuracy === 1 &&
      phase6.metrics.caseAccuracy === 1 &&
      phase7.metrics.executiveSummaryAccuracy === 1 &&
      JSON.stringify(actualMissingForms) === JSON.stringify(expectedMissingForms),
  ),
});

const artifact = {
  artifactVersion: PHASE8_VERSIONS.evaluation,
  generatedAt: new Date().toISOString(),
  provider: { name: 'MockProvider', calls: 0, spendUsd: 0 },
  fixtures: {
    phase4: 'verification-cases-v2',
    phase5: 'checklist-five-missing-forms-v1',
    phase6: 'proposal-audit-known-answer-v1',
    phase7: 'reporting-known-answer-v1',
  },
  expected: {
    metrics: 'all accuracy/validity/adherence values 1; all dangerous counts 0',
    missingForms: expectedMissingForms,
  },
  actual: {
    metrics,
    missingForms: actualMissingForms,
    phase4: phase4.final,
    phase6: phase6.metrics,
    phase7: phase7.metrics,
  },
};

await writeFile(
  `${artifactDirectory}/phase8-consolidated-known-answer-v1.json`,
  await format(JSON.stringify(artifact), { parser: 'json', printWidth: 100 }),
  'utf8',
);
console.info(JSON.stringify(metrics));
