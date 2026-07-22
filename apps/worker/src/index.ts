import { createServer } from 'node:http';
import { PgBoss } from 'pg-boss';
import { env } from './env.js';
import { handleParseJob, type ParseJobPayload } from './parse-document.js';
import { handleExtractJob, type ExtractJobPayload } from './extract-document.js';
import { handleVerifyJob, type VerifyJobPayload } from './verify-requirements.js';
import { handleLargeDocumentWork, type LargeDocumentWorkPayload } from './large-document-work.js';

const PARSE_QUEUE = 'document-parse';
const EXTRACT_QUEUE = 'document-extract';
const VERIFY_QUEUE = 'requirements-verify';
const LARGE_DOCUMENT_WORK_QUEUE = 'large-document-work';
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 3001);

async function main() {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    migrate: true,
    createSchema: true,
    supervise: true,
    schedule: false,
    useListenNotify: false,
  });

  boss.on('error', (err) => {
    console.error('[worker] pg-boss error', err.message);
  });

  await boss.start();
  await boss.createQueue(PARSE_QUEUE);
  await boss.createQueue(EXTRACT_QUEUE);
  await boss.createQueue(VERIFY_QUEUE);
  await boss.createQueue(LARGE_DOCUMENT_WORK_QUEUE);

  await boss.work(
    PARSE_QUEUE,
    { batchSize: 1, localConcurrency: env.PARSE_CONCURRENCY },
    async (jobs) => {
      for (const job of jobs) {
        const payload = job.data as ParseJobPayload;
        console.info(
          `[worker] parse start document=${payload.documentId} workspace=${payload.workspaceId}`,
        );
        await handleParseJob(payload);
        console.info(`[worker] parse done document=${payload.documentId}`);
      }
    },
  );

  await boss.work(EXTRACT_QUEUE, { batchSize: 1, localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const payload = job.data as ExtractJobPayload;
      console.info(
        `[worker] extract start run=${payload.analysisRunId} document=${payload.documentId}`,
      );
      await handleExtractJob(payload);
      console.info(`[worker] extract done run=${payload.analysisRunId}`);
    }
  });

  await boss.work(VERIFY_QUEUE, { batchSize: 1, localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const payload = job.data as VerifyJobPayload;
      console.info(`[worker] verify start run=${payload.verificationRunId}`);
      await handleVerifyJob(payload);
      console.info(`[worker] verify done run=${payload.verificationRunId}`);
    }
  });

  await boss.work(
    LARGE_DOCUMENT_WORK_QUEUE,
    { batchSize: 1, localConcurrency: env.PARSE_CONCURRENCY },
    async (jobs) => {
      for (const job of jobs) await handleLargeDocumentWork(job.data as LargeDocumentWorkPayload);
    },
  );

  const health = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  await new Promise<void>((resolve, reject) => {
    health.once('error', reject);
    health.listen(HEALTH_PORT, '127.0.0.1', () => resolve());
  });

  console.info(`[worker] listening on ${PARSE_QUEUE} + ${EXTRACT_QUEUE} + ${VERIFY_QUEUE}`);
  console.info(`[worker] health http://127.0.0.1:${HEALTH_PORT}/`);

  const shutdown = async () => {
    console.info('[worker] shutting down');
    health.close();
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal', err instanceof Error ? err.message : err);
  process.exit(1);
});
