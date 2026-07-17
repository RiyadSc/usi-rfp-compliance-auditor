import 'server-only';
import { parseServerEnv, type ServerEnv } from '@usi/config/server';

let cached: ServerEnv | null = null;

/** Validated server environment. Throws at first use if misconfigured. */
export function serverEnv(): ServerEnv {
  if (!cached) {
    cached = parseServerEnv(process.env);
  }
  return cached;
}
