import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createExternalApi } from './server.js';
import { SessionStore } from '../../../../packages/contracts/auth/store.js';
import { validateExternalSecretFiles } from '../../bootstrap/environment.js';
import { PublishedReleaseStore } from '../../tasks/published-store.js';
import { PublishedTaskBoard } from '../../tasks/board.js';
import { SqlAssignmentStore, SqlDefectReportStore, SqlReservationStore } from '../../reservations/reservation-sql.js';
import { SqlAssignmentCommandReceiver } from '../../reservations/assignment-receiver.js';
import { SqlSubmissionStore } from '../../submissions/store.js';
import { SubmissionExportReceiver } from '../../submissions/export-receiver.js';
import { SqlExternalStatusStore } from '../../status/store.js';
import { FeedbackIngestReceiver } from '../../status/receiver.js';

let pool: Pool | undefined;
try {
  const synthetic = process.env.SYNTHETIC_BOOTSTRAP_ONLY === 'true';
  let auth: Parameters<typeof createExternalApi>[0];
  if (!synthetic) {
    const config = validateExternalSecretFiles(process.env);
    if (process.env.AUTH_MODE !== 'localhost_demo') throw new Error('Production TLS listener must be configured explicitly.');
    pool = new Pool({ host: config.EXTERNAL_DATABASE_HOST, database: config.EXTERNAL_DATABASE_NAME, user: config.EXTERNAL_DATABASE_USER, password: readFileSync(config.EXTERNAL_DATABASE_PASSWORD_FILE,'utf8').trim(), max: 3, connectionTimeoutMillis: 5000 });
    const published = new PublishedReleaseStore(pool);
    auth = {
      store: new SessionStore(pool, 'external', readFileSync(config.EXTERNAL_SESSION_KEY_FILE)), mode: 'localhost_demo',
      reservations: { board: new PublishedTaskBoard(published), reservations: new SqlReservationStore(pool), assignments: new SqlAssignmentStore(pool), defects: new SqlDefectReportStore(pool) },
      commands: new SqlAssignmentCommandReceiver(pool, readFileSync(config.EXTERNAL_ASSIGNMENT_PUBLIC_KEY_FILE), readFileSync(config.EXTERNAL_RECEIPT_KEY_FILE)),
      submissions: new SqlSubmissionStore(pool, readFileSync(config.EXTERNAL_PERMIT_KEY_FILE)),
      exports: new SubmissionExportReceiver(new SqlSubmissionStore(pool, readFileSync(config.EXTERNAL_PERMIT_KEY_FILE)), readFileSync(config.EXTERNAL_IMPORT_PUBLIC_KEY_FILE)),
      status: new SqlExternalStatusStore(pool),
      feedbackIngest: new FeedbackIngestReceiver(new SqlExternalStatusStore(pool), readFileSync(config.EXTERNAL_IMPORT_PUBLIC_KEY_FILE), readFileSync(config.EXTERNAL_RECEIPT_KEY_FILE))
    };
  }
  const app = createExternalApi(auth);
  app.addHook('onClose', async () => { await pool?.end(); });
  const host = !synthetic && process.env.TRUSTED_CONTAINER_LISTEN === 'true' ? '0.0.0.0' : '127.0.0.1';
  await app.listen({ host, port: 4001 });
  console.log('Contributor API listening on port 4001; MVP delivery remains unverified.');
  for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { void app.close(); });
} catch (error) {
  await pool?.end(); console.error(`Contributor bootstrap API could not start: ${error instanceof Error ? error.message : 'unknown'}.`); process.exitCode = 1;
}
