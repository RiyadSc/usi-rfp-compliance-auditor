/** Key presence validation only. Never prints, hashes, or persists key material. */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { OpenAIProvider } from '../packages/ai/src/index.ts';
import { parseServerEnv } from '../packages/config/src/server-env.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const key = process.env.OPENAI_API_KEY?.trim();
const present = Boolean(key);
const syntacticallyValid = Boolean(key && key.length >= 20);
const results = [];

try {
  const workerEnv = parseServerEnv(process.env);
  results.push({
    runtime: 'standalone worker',
    availability: workerEnv.OPENAI_API_KEY ? 'present' : 'absent',
    validation: workerEnv.OPENAI_API_KEY ? 'success' : 'failure',
  });
} catch {
  results.push({
    runtime: 'standalone worker',
    availability: present ? 'present' : 'absent',
    validation: 'failure',
  });
}

results.push({
  runtime: 'live evaluation command',
  availability: present ? 'present' : 'absent',
  validation: syntacticallyValid ? 'success' : 'failure',
});

try {
  if (!key || !syntacticallyValid) throw new Error('missing');
  new OpenAIProvider({ apiKey: key, extractModel: 'gpt-5.4-mini-2026-03-17' });
  results.push({
    runtime: 'OpenAI provider adapter',
    availability: 'present',
    validation: 'success',
  });
} catch {
  results.push({
    runtime: 'OpenAI provider adapter',
    availability: present ? 'present' : 'absent',
    validation: 'failure',
  });
}

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.validation !== 'success')) process.exitCode = 1;
