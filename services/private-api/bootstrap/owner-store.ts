import type { Pool } from 'pg';
import type { OwnerBootstrapStore, OwnerBootstrapTransaction } from './owner.js';

export class PostgresOwnerBootstrapStore implements OwnerBootstrapStore {
  constructor(private readonly pool: Pool) {}

  async initialize(tokenDigest: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(tokenDigest)) throw new Error('Invalid bootstrap token digest.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(840002)');
      await client.query(`CREATE TABLE IF NOT EXISTS bootstrap_owner_authority (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
        token_digest char(64) NOT NULL CHECK (token_digest ~ '^[a-f0-9]{64}$'),
        consumed boolean NOT NULL DEFAULT false
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS bootstrap_owner_accounts (
        id uuid PRIMARY KEY,
        username varchar(64) UNIQUE NOT NULL,
        password_hash text NOT NULL,
        role text NOT NULL CHECK (role = 'owner'),
        singleton boolean UNIQUE NOT NULL DEFAULT true CHECK (singleton),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query('INSERT INTO bootstrap_owner_authority (singleton, token_digest) VALUES (true, $1) ON CONFLICT (singleton) DO NOTHING', [tokenDigest]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async transaction<T>(operation: (transaction: OwnerBootstrapTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation({
        consumeUnusedBootstrap: async digest => {
          const result = await client.query('UPDATE bootstrap_owner_authority SET consumed = true WHERE singleton = true AND consumed = false AND token_digest = $1 RETURNING singleton', [digest]);
          return result.rowCount === 1;
        },
        insertOwner: async account => {
          if (account.role !== 'owner') throw new Error('Invalid bootstrap authority.');
          await client.query('INSERT INTO bootstrap_owner_accounts (id, username, password_hash, role) VALUES ($1, $2, $3, $4)', [account.id, account.username, account.passwordHash, 'owner']);
        }
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
