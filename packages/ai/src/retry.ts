export type RetryOptions = {
  maxAttempts: number;
  baseDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
};

const DEFAULT_RETRYABLE = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  if (status === 429 || status === 500 || status === 502 || status === 503) return true;
  const code = String((err as { code?: string }).code ?? '');
  return /rate_limit|timeout|ECONNRESET|ETIMEDOUT/i.test(code + String(err));
};

/** Bounded exponential backoff for provider calls. Never infinite. */
export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts);
  const baseDelayMs = options.baseDelayMs ?? 250;
  const isRetryable = options.isRetryable ?? DEFAULT_RETRYABLE;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('retry exhausted');
}

export function normalizeProviderError(err: unknown): {
  category: string;
  message: string;
  retryable: boolean;
} {
  const message = err instanceof Error ? err.message.slice(0, 500) : 'provider error';
  const status = err && typeof err === 'object' ? (err as { status?: number }).status : undefined;
  if (status === 429) return { category: 'rate_limit', message, retryable: true };
  if (status === 401 || status === 403) return { category: 'auth', message, retryable: false };
  if (status && status >= 500) return { category: 'provider_5xx', message, retryable: true };
  if (/Zod|schema|non-JSON|validation/i.test(message)) {
    return { category: 'malformed_output', message, retryable: false };
  }
  return { category: 'provider', message, retryable: DEFAULT_RETRYABLE(err) };
}
