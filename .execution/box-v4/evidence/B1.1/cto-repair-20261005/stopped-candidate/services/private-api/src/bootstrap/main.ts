import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createPrivateApi } from './server.js';
import { SessionStore } from '../../../../packages/contracts/auth/store.js';
import { validatePrivateSecretFiles } from '../../bootstrap/environment.js';
import { PrivateResourceAccess } from '../../auth/resources.js';
import { PrivateIntakeStore } from '../../requests/store.js';
import { loadSnapshotSources } from '../../snapshots/sources.js';
import { PrivateReleaseStore } from '../../releases/store.js';
import { ApprovedReleaseCompiler } from '../../releases/compiler.js';
import { PrivateAssignmentStore } from '../../assignments/store.js';
import { AssignmentDeliveryStore, type AssignmentDeliveryTransport } from '../../assignments/delivery.js';
import { releaseReadinessGate } from '../../assignments/readiness.js';
import { SqlSubmissionImportStore } from '../../submission-import/store.js';
import { SubmissionImporter, type ImportTransport } from '../../submission-import/importer.js';
import { PrivateReadinessStore } from '../../readiness/store.js';
import { PrivateAcceptanceStore } from '../../acceptance/store.js';
import { PrivateFeedbackStore } from '../../feedback/store.js';
import { FeedbackDeliverer, type DeliveryTransport } from '../../feedback/delivery.js';
import { createPublicKey } from 'node:crypto';

const COMMAND_ENDPOINT = 'http://external-api:4001/v1/assignment-commands';
const EXPORT_ENDPOINT = 'http://external-api:4001/v1/submission-exports';
const FEEDBACK_ENDPOINT = 'http://external-api:4001/v1/feedback-ingest';
const transport: AssignmentDeliveryTransport = {
  async send(packet, signal) {
    const response = await fetch(COMMAND_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packet), signal });
    if (!response.ok) throw new Error('delivery_unverified');
    return await response.json();
  }
};
const exportTransport: ImportTransport = {
  async send(packet) {
    const response = await fetch(EXPORT_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packet) });
    if (!response.ok) throw new Error('delivery_unverified');
    return await response.json();
  }
};
const feedbackTransport: DeliveryTransport = {
  async send(packet) {
    const response = await fetch(FEEDBACK_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packet) });
    if (!response.ok) throw new Error('delivery_unverified');
    return await response.json();
  }
};

let pool: Pool | undefined;
try {
  const synthetic = process.env.SYNTHETIC_BOOTSTRAP_ONLY === 'true';
  let auth: Parameters<typeof createPrivateApi>[0];
  let dispatchTimer: NodeJS.Timeout | undefined;
  let importTimer: NodeJS.Timeout | undefined;
  let feedbackTimer: NodeJS.Timeout | undefined;
  if (!synthetic) {
    const config = validatePrivateSecretFiles(process.env);
    if (process.env.AUTH_MODE !== 'localhost_demo') throw new Error('Production TLS listener must be configured explicitly.');
    pool = new Pool({ host: config.PRIVATE_DATABASE_HOST, database: config.PRIVATE_DATABASE_NAME, user: config.PRIVATE_DATABASE_USER, password: readFileSync(config.PRIVATE_DATABASE_PASSWORD_FILE,'utf8').trim(), max: 3, connectionTimeoutMillis: 5000 });
    const sources = await loadSnapshotSources(process.env.PRIVATE_SNAPSHOT_SOURCES_FILE);
    if (process.env.SYNTHETIC_SNAPSHOT_SOURCE === 'private-task-mvp-synthetic') {
      const fixture = JSON.parse(readFileSync('/workspace/examples/private-shop/fixture.json', 'utf8'));
      if (fixture.kind !== 'synthetic-private-shop' || fixture.schemaVersion !== 1) throw new Error('Invalid synthetic snapshot fixture.');
      sources.push({ id: 'synthetic-shop', root: '/workspace/examples/private-shop', paths: fixture.snapshotPaths });
    }
    const releaseKey = readFileSync(config.PRIVATE_RELEASE_KEY_FILE);
    const gate = releaseReadinessGate(createPublicKey(releaseKey));
    const assignmentKey = readFileSync(config.PRIVATE_ASSIGNMENT_KEY_FILE);
    const delivery = new AssignmentDeliveryStore(pool, assignmentKey, readFileSync(config.PRIVATE_RECEIPT_PUBLIC_KEY_FILE), gate);
    const dispatch = () => { void delivery.dispatchOne(transport).catch(() => undefined); };
    dispatchTimer = setInterval(dispatch, 5000);
    dispatchTimer.unref();
    const importer = new SubmissionImporter(new SqlSubmissionImportStore(pool), readFileSync(config.PRIVATE_IMPORT_KEY_FILE), readFileSync(config.PRIVATE_PERMIT_PUBLIC_KEY_FILE), exportTransport);
    const pollImports = () => { void importer.pollOnce().catch(() => undefined); };
    importTimer = setInterval(pollImports, 7000);
    importTimer.unref();
    const deliverer = new FeedbackDeliverer(new PrivateFeedbackStore(pool), readFileSync(config.PRIVATE_IMPORT_KEY_FILE), readFileSync(config.PRIVATE_RECEIPT_PUBLIC_KEY_FILE), feedbackTransport);
    const pollFeedback = () => { void deliverer.deliverOnce().catch(() => undefined); };
    feedbackTimer = setInterval(pollFeedback, 8000);
    feedbackTimer.unref();
    auth = { store: new SessionStore(pool, 'private', readFileSync(config.PRIVATE_SESSION_KEY_FILE)), mode: 'localhost_demo', resources: new PrivateResourceAccess(pool), intake: new PrivateIntakeStore(pool, sources), releases: new PrivateReleaseStore(pool, releaseKey), releaseCompiler: new ApprovedReleaseCompiler(pool, createPublicKey(releaseKey)), assignments: new PrivateAssignmentStore(pool, assignmentKey, gate), readiness: new PrivateReadinessStore(pool), acceptance: new PrivateAcceptanceStore(pool) };
  }
  const app = createPrivateApi(auth);
  app.addHook('onClose', async () => { if (dispatchTimer) clearInterval(dispatchTimer); if (importTimer) clearInterval(importTimer); if (feedbackTimer) clearInterval(feedbackTimer); await pool?.end(); });
  const host = !synthetic && process.env.TRUSTED_CONTAINER_LISTEN === 'true' ? '0.0.0.0' : '127.0.0.1';
  await app.listen({ host, port: 4000 });
  console.log('Private API listening on port 4000; MVP delivery remains unverified.');
  for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { void app.close(); });
} catch {
  await pool?.end(); console.error('Private bootstrap API could not start.'); process.exitCode = 1;
}
