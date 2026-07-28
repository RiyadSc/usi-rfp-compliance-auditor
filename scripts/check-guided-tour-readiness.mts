import { evaluateGuidedTourStaticReadiness } from './lib/guided-tour-readiness';

for (const flag of [
  'PHASE3_LIVE_EVAL',
  'PHASE4_LIVE_EVAL',
  'PHASE4_LIVE_SMOKE',
  'PHASE9_LIVE_EVAL',
  'PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED',
])
  if (process.env[flag] === '1' || process.env[flag] === 'true')
    throw new Error(`guided_tour_readiness_refuses_live_flag:${flag}`);

const result = evaluateGuidedTourStaticReadiness();
console.info(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
