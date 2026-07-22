/**
 * Secret scan for repository files and built client bundles.
 * Fails when service-role JWTs, private keys, or provider API keys appear
 * in tracked files or in apps/web/.next static client assets.
 * The anon/publishable key is public by design and explicitly allowed.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  {
    name: 'Supabase service-role JWT',
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\./,
  },
  { name: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'Private key block', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { name: 'OpenAI-style API key', regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'Anthropic API key', regex: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { name: 'AWS access key id', regex: /AKIA[0-9A-Z]{16}/ },
  {
    name: 'Bearer authorization value',
    regex: /authorization["']?\s*[:=]\s*["']Bearer\s+[A-Za-z0-9._-]{20,}/i,
  },
  { name: 'Signed URL token', regex: /[?&](?:token|signature|sig)=[A-Za-z0-9._~-]{20,}/i },
  { name: 'Password assignment with literal', regex: /PASSWORD\s*=\s*['"][^'"$]{8,}['"]/i },
];

const failures = [];

function scanContent(content, label) {
  for (const { name, regex } of PATTERNS) {
    if (regex.test(content)) {
      failures.push(`${label}: matched "${name}"`);
    }
  }
}

// 1. All git-tracked files plus untracked, non-ignored commit candidates.
const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const repositoryFiles = [...new Set([...tracked, ...untracked])];
for (const file of repositoryFiles) {
  if (/\.(pdf|png|jpg|jpeg|gif|webp|woff2?|zip|mp4|webm)$/.test(file)) continue;
  try {
    scanContent(readFileSync(file, 'utf8'), file);
  } catch {
    // binary or unreadable: skip
  }
}

// 2. Client-visible build output (browser bundle).
const staticDirs = ['apps/web/.next/static', 'apps/web/.next-e2e/static'].filter((dir) =>
  existsSync(dir),
);
for (const staticDir of staticDirs) {
  const stack = [staticDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        stack.push(full);
      } else if (/\.(js|css|json|txt)$/.test(entry)) {
        scanContent(readFileSync(full, 'utf8'), full);
      }
    }
  }
  // Extra check: server-only env names must not leak into client assets.
  const serverOnlyNames = ['SUPABASE_SERVICE_ROLE_KEY', 'MODEL_API_KEY', 'PARSER_API_KEY'];
  const stack2 = [staticDir];
  while (stack2.length > 0) {
    const dir = stack2.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) stack2.push(full);
      else if (/\.js$/.test(entry)) {
        const content = readFileSync(full, 'utf8');
        for (const name of serverOnlyNames) {
          if (content.includes(name)) failures.push(`${full}: references server-only var ${name}`);
        }
      }
    }
  }
}
if (staticDirs.length === 0) {
  console.info('note: apps/web/.next/static not found; run build first for bundle scan');
}

// 3. .env.local must not be tracked.
if (tracked.includes('.env.local') || tracked.some((f) => /\.env($|\.(?!example))/.test(f))) {
  failures.push('.env file is tracked by git');
}

if (failures.length > 0) {
  console.error('Secret scan FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.info(
  `Secret scan passed (${tracked.length} tracked + ${untracked.length} untracked commit candidates + client bundle).`,
);
