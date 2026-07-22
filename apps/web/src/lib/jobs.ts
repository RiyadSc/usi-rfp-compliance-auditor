import 'server-only';
import { PgBoss } from 'pg-boss';
import { serverEnv } from '@/lib/env';

export const PARSE_QUEUE = 'document-parse';
export const EXTRACT_QUEUE = 'document-extract';
export const VERIFY_QUEUE = 'requirements-verify';
export const LARGE_DOCUMENT_WORK_QUEUE = 'large-document-work';

export type ParseJobPayload = {
  workspaceId: string;
  documentId: string;
  processingJobId: string;
  objectKey: string;
  inputHash: string;
  largeDocumentJobId?: string;
};

export type ExtractJobPayload = {
  workspaceId: string;
  documentId: string;
  analysisRunId: string;
  processingJobId: string;
};

export type VerifyJobPayload = {
  workspaceId: string;
  analysisRunId: string;
  verificationRunId: string;
  processingJobId: string;
};
export type LargeDocumentWorkPayload = { workspaceId: string; jobId: string; workUnitId: string };

async function withBoss<T>(fn: (boss: PgBoss) => Promise<T>): Promise<T> {
  const env = serverEnv();
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    migrate: false,
    createSchema: false,
    supervise: false,
    schedule: false,
    useListenNotify: false,
  });
  await boss.start();
  try {
    return await fn(boss);
  } finally {
    await boss.stop({ graceful: false, timeout: 5_000 });
  }
}

/** Send-only enqueue for document parse jobs (pg-boss schema, no supervise). */
export async function enqueueParseJob(payload: ParseJobPayload): Promise<string | null> {
  return withBoss(async (boss) => {
    await boss.createQueue(PARSE_QUEUE);
    return boss.send(PARSE_QUEUE, payload, {
      retryLimit: 2,
      retryDelay: 30,
      expireInSeconds: 60 * 30,
    });
  });
}

export async function enqueueExtractJob(payload: ExtractJobPayload): Promise<string | null> {
  return withBoss(async (boss) => {
    await boss.createQueue(EXTRACT_QUEUE);
    return boss.send(EXTRACT_QUEUE, payload, {
      retryLimit: 2,
      retryDelay: 30,
      expireInSeconds: 60 * 60,
    });
  });
}

export async function enqueueVerifyJob(payload: VerifyJobPayload): Promise<string | null> {
  return withBoss(async (boss) => {
    await boss.createQueue(VERIFY_QUEUE);
    return boss.send(VERIFY_QUEUE, payload, {
      retryLimit: 2,
      retryDelay: 30,
      expireInSeconds: 60 * 60,
    });
  });
}

export async function enqueueLargeDocumentWork(
  payload: LargeDocumentWorkPayload,
): Promise<string | null> {
  return withBoss(async (boss) => {
    await boss.createQueue(LARGE_DOCUMENT_WORK_QUEUE);
    return boss.send(LARGE_DOCUMENT_WORK_QUEUE, payload, {
      retryLimit: 0,
      expireInSeconds: 60 * 15,
    });
  });
}
