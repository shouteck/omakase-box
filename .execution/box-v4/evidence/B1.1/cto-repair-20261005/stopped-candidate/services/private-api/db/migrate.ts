import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { validatePrivateSecretFiles } from '../bootstrap/environment.js';

const config = validatePrivateSecretFiles(process.env);
const pool = new Pool({ host: config.PRIVATE_DATABASE_HOST, database: config.PRIVATE_DATABASE_NAME, user: config.PRIVATE_DATABASE_USER, password: readFileSync(config.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2, connectionTimeoutMillis: 5000 });
try {
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../db/migrations/', import.meta.url)) });
  const exists = await pool.query("SELECT to_regclass('bootstrap_owner_accounts') AS name");
  if (exists.rows[0]?.name) await pool.query("INSERT INTO private_accounts (id, username, password_hash, role) SELECT id, username, password_hash, 'owner' FROM bootstrap_owner_accounts ON CONFLICT (id) DO NOTHING");
  console.log(JSON.stringify({ assurance: 'tested', service: 'private-api', migration: 'applied' }));
} catch {
  console.error(JSON.stringify({ assurance: 'unverified', service: 'private-api', migration: 'failed' }));
  process.exitCode = 1;
} finally { await pool.end(); }
