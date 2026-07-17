import type { ModelProvider, VerificationCandidateInput, VerificationContext } from './provider';
import {
  buildDeterministicFactEnvelope,
  deriveMachineAssessment,
  selectCandidateContexts,
  type FinalMachineAssessment,
} from './verification-decision-engine';
import type { ChallengeResult, EntailmentResult } from './verification-v3-schemas';
import type { ChallengeOutput, EntailmentOutput } from './provider';

export type CandidateVerificationPipelineResult = {
  candidate: VerificationCandidateInput;
  contexts: VerificationContext[];
  facts: ReturnType<typeof buildDeterministicFactEnvelope>;
  entailmentCall: EntailmentOutput | null;
  challengeCall: ChallengeOutput | null;
  entailment: EntailmentResult | null;
  challenge: ChallengeResult | null;
  finalAssessment: FinalMachineAssessment | null;
  failedStage: 'entailment' | 'challenge' | null;
  error: string | null;
};

export async function runCandidateVerificationPipeline(input: {
  provider: ModelProvider;
  workspaceId: string;
  analysisRunId: string;
  verificationRunId: string;
  candidate: VerificationCandidateInput;
  availableContexts: VerificationContext[];
  maxContexts?: number;
  maxOutputTokens?: number;
  entailmentMaxOutputTokens?: number;
  challengeMaxOutputTokens?: number;
  beforeEntailment?: () => Promise<void> | void;
  beforeChallenge?: () => Promise<void> | void;
  onEnvelope?: (
    facts: ReturnType<typeof buildDeterministicFactEnvelope>,
    contexts: VerificationContext[],
  ) => Promise<void> | void;
  onEntailmentCall?: (call: EntailmentOutput) => Promise<void> | void;
  onChallengeCall?: (call: ChallengeOutput) => Promise<void> | void;
}): Promise<CandidateVerificationPipelineResult> {
  const contexts = selectCandidateContexts(
    input.candidate,
    input.availableContexts,
    input.maxContexts ?? 8,
  );
  const facts = buildDeterministicFactEnvelope(input.candidate, contexts);
  await input.onEnvelope?.(facts, contexts);
  const base = {
    candidate: input.candidate,
    contexts,
    facts,
    entailmentCall: null,
    challengeCall: null,
    entailment: null,
    challenge: null,
    finalAssessment: null,
    failedStage: null,
    error: null,
  } satisfies CandidateVerificationPipelineResult;
  let entailmentCall: EntailmentOutput;
  try {
    await input.beforeEntailment?.();
    entailmentCall = await input.provider.assessEntailment({
      workspaceId: input.workspaceId,
      analysisRunId: input.analysisRunId,
      verificationRunId: input.verificationRunId,
      candidate: input.candidate,
      contexts,
      factEnvelope: facts,
      maxOutputTokens: input.entailmentMaxOutputTokens ?? input.maxOutputTokens ?? 1800,
    });
    await input.onEntailmentCall?.(entailmentCall);
  } catch (error) {
    return {
      ...base,
      failedStage: 'entailment',
      error: error instanceof Error ? error.message : 'Entailment pass failed',
    };
  }
  if (entailmentCall.refused || entailmentCall.incomplete || !entailmentCall.result) {
    return {
      ...base,
      entailmentCall,
      failedStage: 'entailment',
      error: entailmentCall.refused
        ? 'Entailment pass refused'
        : entailmentCall.incomplete
          ? 'Entailment pass incomplete'
          : 'Entailment pass returned no result',
    };
  }
  const entailment = entailmentCall.result;
  if (entailment.classification !== 'entails') {
    return {
      ...base,
      entailmentCall,
      entailment,
      finalAssessment: deriveMachineAssessment({
        candidate: input.candidate,
        contexts,
        facts,
        entailment,
        challenge: null,
      }),
    };
  }

  let challengeCall: ChallengeOutput;
  try {
    await input.beforeChallenge?.();
    challengeCall = await input.provider.challengeEntailment({
      workspaceId: input.workspaceId,
      analysisRunId: input.analysisRunId,
      verificationRunId: input.verificationRunId,
      candidate: input.candidate,
      contexts,
      factEnvelope: facts,
      entailment,
      maxOutputTokens: input.challengeMaxOutputTokens ?? input.maxOutputTokens ?? 1800,
    });
    await input.onChallengeCall?.(challengeCall);
  } catch (error) {
    return {
      ...base,
      entailmentCall,
      entailment,
      failedStage: 'challenge',
      error: error instanceof Error ? error.message : 'Challenge pass failed',
      finalAssessment: deriveMachineAssessment({
        candidate: input.candidate,
        contexts,
        facts,
        entailment,
        challenge: null,
        challengeFailed: true,
      }),
    };
  }
  const challenge = challengeCall.result;
  const challengeFailed = Boolean(
    challengeCall.refused || challengeCall.incomplete || !challengeCall.result,
  );
  return {
    ...base,
    entailmentCall,
    challengeCall,
    entailment,
    challenge,
    failedStage: challengeFailed ? 'challenge' : null,
    error: challengeFailed
      ? challengeCall.refused
        ? 'Challenge pass refused'
        : challengeCall.incomplete
          ? 'Challenge pass incomplete'
          : 'Challenge pass returned no result'
      : null,
    finalAssessment: deriveMachineAssessment({
      candidate: input.candidate,
      contexts,
      facts,
      entailment,
      challenge,
      challengeFailed,
    }),
  };
}
