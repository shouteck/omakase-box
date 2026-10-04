import { readFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { Pool } from 'pg';
import { AssignmentDeliveryStore } from '../services/private-api/assignments/delivery.js';
import { releaseReadinessGate } from '../services/private-api/assignments/readiness.js';

const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 2 });
try {
  const releaseKey = readFileSync(process.env.PRIVATE_RELEASE_KEY_FILE!);
  const gate = releaseReadinessGate(createPublicKey(releaseKey));
  const store = new AssignmentDeliveryStore(pool, readFileSync(process.env.PRIVATE_ASSIGNMENT_KEY_FILE!), readFileSync(process.env.PRIVATE_RECEIPT_PUBLIC_KEY_FILE!), gate);
  const observed: Record<string, unknown> = {};
  const transport = {
    async send(packet: unknown, signal: AbortSignal) {
      const response = await fetch('http://external-api:4001/v1/assignment-commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packet), signal });
      const text = await response.text();
      observed.httpStatus = response.status; observed.httpBody = text.slice(0, 400);
      if (!response.ok) throw new Error('delivery_unverified');
      return JSON.parse(text);
    }
  };
  const result = await store.dispatchOne(transport);
  console.log(JSON.stringify({ result, observed }));
} catch (error) {
  console.log(JSON.stringify({ failure: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
