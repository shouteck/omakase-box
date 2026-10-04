import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { validateExternalSecretFiles } from '../bootstrap/environment.js';

const config = validateExternalSecretFiles(process.env);
const pool = new Pool({ host: config.EXTERNAL_DATABASE_HOST, database: config.EXTERNAL_DATABASE_NAME, user: config.EXTERNAL_DATABASE_USER, password: readFileSync(config.EXTERNAL_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2, connectionTimeoutMillis: 5000 });
try {
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../db/migrations/', import.meta.url)) });
  console.log(JSON.stringify({ assurance: 'tested', service: 'external-api', migration: 'applied' }));
} catch {
  console.error(JSON.stringify({ assurance: 'unverified', service: 'external-api', migration: 'failed' }));
  process.exitCode = 1;
} finally { await pool.end(); }
