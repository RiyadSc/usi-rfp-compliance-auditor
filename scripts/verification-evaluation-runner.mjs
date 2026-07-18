import {
  applyDuplicateSafetyBlock,
  generateDuplicatePairCandidates,
  runCandidateVerificationPipeline,
} from '../packages/ai/src/index.ts';
import {
  FIXTURE_ANALYSIS_RUN_ID,
  FIXTURE_VERIFICATION_RUN_ID,
  FIXTURE_WORKSPACE_ID,
  VERIFICATION_CONTEXTS,
  VERIFICATION_INPUT_CANDIDATES,
} from '../fixtures/eval/verification-cases.ts';

export async function runVerificationEvaluation(provider, options = {}) {
  const selectedCandidateIds = options.candidateIds ? new Set(options.candidateIds) : null;
  const candidates = selectedCandidateIds
    ? VERIFICATION_INPUT_CANDIDATES.filter((candidate) => selectedCandidateIds.has(candidate.id))
    : VERIFICATION_INPUT_CANDIDATES;
  const results = [];
  for (const candidate of candidates) {
    results.push(
      await runCandidateVerificationPipeline({
        provider,
        workspaceId: FIXTURE_WORKSPACE_ID,
        analysisRunId: FIXTURE_ANALYSIS_RUN_ID,
        verificationRunId: FIXTURE_VERIFICATION_RUN_ID,
        candidate,
        availableContexts: VERIFICATION_CONTEXTS,
        maxContexts: options.maxContexts ?? 4,
        entailmentMaxOutputTokens: options.entailmentMaxOutputTokens ?? 1200,
        challengeMaxOutputTokens: options.challengeMaxOutputTokens ?? 1200,
        beforeEntailment: () => options.beforeCall?.('entailment', candidate.id),
        beforeChallenge: () => options.beforeCall?.('challenge', candidate.id),
        onEntailmentCall: (call) => options.onCall?.('entailment', candidate.id, call),
        onChallengeCall: (call) => options.onCall?.('challenge', candidate.id, call),
      }),
    );
  }
  const duplicateResults = [];
  if (options.includeDuplicates === false) return { results, duplicateResults };
  for (const pair of generateDuplicatePairCandidates(candidates)) {
    try {
      await options.beforeCall?.('duplicate', pair.source.id, pair.target.id);
      const call = await provider.classifyDuplicatePair({
        workspaceId: FIXTURE_WORKSPACE_ID,
        analysisRunId: FIXTURE_ANALYSIS_RUN_ID,
        verificationRunId: FIXTURE_VERIFICATION_RUN_ID,
        source: pair.source,
        target: pair.target,
        deterministicMaterialDifferences: pair.materialDifferences,
        maxOutputTokens: options.duplicateMaxOutputTokens ?? 700,
      });
      await options.onCall?.('duplicate', pair.source.id, call, pair.target.id);
      duplicateResults.push({
        sourceId: pair.source.id,
        targetId: pair.target.id,
        call,
        result: call.result ? applyDuplicateSafetyBlock(pair, call.result) : null,
      });
    } catch {
      duplicateResults.push({
        sourceId: pair.source.id,
        targetId: pair.target.id,
        call: null,
        result: null,
      });
    }
  }
  return { results, duplicateResults };
}
