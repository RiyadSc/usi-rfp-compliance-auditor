import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = new URL('../supabase/migrations/', import.meta.url);
const directoryPath = fileURLToPath(directory);
const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

const filenamePattern = /^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/;
const versions = new Set();
const errors = [];
const legacyDuplicateVersions = new Map([
  [
    '20260717000005',
    new Set([
      '20260717000005_documents_ingestion.sql',
      '20260717000005_documents_upload_parse.sql',
    ]),
  ],
]);

for (const name of names) {
  const match = filenamePattern.exec(name);
  if (!match) {
    errors.push(`${name}: filename must be YYYYMMDDHHMMSS_snake_case.sql`);
    continue;
  }

  const version = match[1];
  if (versions.has(version)) {
    const allowed = legacyDuplicateVersions.get(version);
    const duplicateNames = names.filter((candidate) => candidate.startsWith(`${version}_`));
    if (!allowed || duplicateNames.some((candidate) => !allowed.has(candidate))) {
      errors.push(`${name}: duplicate migration version ${version}`);
    }
  }
  versions.add(version);

  const sql = (await readFile(join(directoryPath, name), 'utf8')).trim();
  if (!sql) errors.push(`${name}: migration is empty`);
  if (/\b(drop\s+(database|schema)|truncate\s+)/i.test(sql)) {
    errors.push(
      `${name}: destructive database operation is not permitted in repository migrations`,
    );
  }
}

for (let index = 1; index < names.length; index += 1) {
  const previous = filenamePattern.exec(names[index - 1])?.[1];
  const current = filenamePattern.exec(names[index])?.[1];
  if (previous && current && current < previous) {
    errors.push(`${names[index]}: migration versions must sort strictly after ${names[index - 1]}`);
  }
}

if (errors.length) {
  console.error('Migration validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Migration validation passed: ${names.length} ordered, non-empty, repository-safe SQL migrations.`,
  );
}
