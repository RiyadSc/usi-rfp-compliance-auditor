import {
  MockProvider,
  VERIFICATION_PROMPT_VERSION,
  VERIFICATION_SCHEMA_VERSION,
} from '../packages/ai/src/index.ts';
import {
  FIXTURE_ANALYSIS_RUN_ID,
  FIXTURE_VERIFICATION_RUN_ID,
  FIXTURE_WORKSPACE_ID,
  VERIFICATION_CONTEXTS,
  VERIFICATION_INPUT_CANDIDATES,
} from '../fixtures/eval/verification-cases.ts';
import { scoreVerificationRun } from './verification-metrics.mjs';

const output = await new MockProvider().verifyCandidates({
  workspaceId: FIXTURE_WORKSPACE_ID,
  analysisRunId: FIXTURE_ANALYSIS_RUN_ID,
  verificationRunId: FIXTURE_VERIFICATION_RUN_ID,
  candidates: VERIFICATION_INPUT_CANDIDATES,
  contexts: VERIFICATION_CONTEXTS,
  promptVersion: VERIFICATION_PROMPT_VERSION,
  schemaVersion: VERIFICATION_SCHEMA_VERSION,
  maxOutputTokens: 8000,
});
console.log(JSON.stringify({ provider: 'mock', metrics: scoreVerificationRun(output) }, null, 2));
