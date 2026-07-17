import { createServer } from 'node:http';
import { PgBoss } from 'pg-boss';
import { env } from './env.js';
import { handleParseJob, type ParseJobPayload } from './parse-document.js';

const QUEUE = 'document-parse';
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 3001);

async function main() {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    migrate: true,
    createSchema: true,
    supervise: true,
    schedule: false,
    useListenNotify: false, // polling + SKIP LOCKED; session/direct DB URL required
  });

  boss.on('error', (err) => {
    console.error('[worker] pg-boss error', err.message);
  });

  await boss.start();
  await boss.createQueue(QUEUE);

  await boss.work(
    QUEUE,
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

  const health = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  await new Promise<void>((resolve, reject) => {
    health.once('error', reject);
    health.listen(HEALTH_PORT, '127.0.0.1', () => resolve());
  });

  console.info(`[worker] listening on queue ${QUEUE} (schema=pgboss)`);
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
