import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { parseServerEnv } from '@usi/config/server';

// Monorepo root (apps/worker → ../..)
const root = resolve(import.meta.dirname, '../../..');
loadEnv({ path: resolve(root, '.env.local') });
loadEnv({ path: resolve(root, '.env') });

export const env = parseServerEnv(process.env);
