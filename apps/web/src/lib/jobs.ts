import 'server-only';
import { PgBoss } from 'pg-boss';
import { serverEnv } from '@/lib/env';

export const PARSE_QUEUE = 'document-parse';

export type ParseJobPayload = {
  workspaceId: string;
  documentId: string;
  processingJobId: string;
  objectKey: string;
  inputHash: string;
};

/** Send-only enqueue for document parse jobs (pg-boss schema, no supervise). */
export async function enqueueParseJob(payload: ParseJobPayload): Promise<string | null> {
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
    await boss.createQueue(PARSE_QUEUE);
    const id = await boss.send(PARSE_QUEUE, payload, {
      retryLimit: 2,
      retryDelay: 30,
      expireInSeconds: 60 * 30,
    });
    return id;
  } finally {
    await boss.stop({ graceful: false, timeout: 5_000 });
  }
}
