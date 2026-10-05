import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { bootstrapOwner } from './owner.js';
import { PostgresOwnerBootstrapStore } from './owner-store.js';
import { validatePrivateSecretFiles } from './environment.js';

let pool: Pool | undefined;
try {
  const config = validatePrivateSecretFiles(process.env);
  let input = '';
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 16384) throw new Error('Input limit exceeded.');
    input += chunk.toString();
  }
  const parsed: unknown = JSON.parse(input);
  const token = readFileSync(config.PRIVATE_OWNER_BOOTSTRAP_FILE, 'utf8').trim();
  const digest = createHash('sha256').update(token).digest('hex');
  pool = new Pool({ host: config.PRIVATE_DATABASE_HOST, database: config.PRIVATE_DATABASE_NAME, user: config.PRIVATE_DATABASE_USER, password: readFileSync(config.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  const store = new PostgresOwnerBootstrapStore(pool);
  await store.initialize(digest);
  const result = await bootstrapOwner(parsed, digest, store);
  console.log(JSON.stringify(result));
  if (result.status !== 'created') process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ assurance: 'unverified', status: 'bootstrap_unavailable' }));
  process.exitCode = 1;
} finally { await pool?.end(); }
