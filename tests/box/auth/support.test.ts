import { afterEach, describe, expect, it } from 'vitest';
import { migratedPool } from './support.js';

const configured = process.env.BOX_TEST_DATABASE_URL;
afterEach(() => { if (configured === undefined) delete process.env.BOX_TEST_DATABASE_URL; else process.env.BOX_TEST_DATABASE_URL = configured; });

describe('Box test database helper', () => {
  it('rejects a non-loopback BOX_TEST_DATABASE_URL before connecting', async () => {
    for (const host of ['db.example.invalid', '10.0.0.5', '127.0.0.1.example.invalid', 'localhost.example.invalid', 'w002-b11-box-db-r4-env2', '[2001:db8::1]']) {
      process.env.BOX_TEST_DATABASE_URL = 'postgres://postgres:synthetic@' + host + ':5432/postgres';
      await expect(migratedPool()).rejects.toThrow('BOX_TEST_DATABASE_URL is not a loopback database.');
    }
  });
  it('drops the database it created when the pool ends', async () => {
    const first = await migratedPool();
    await first.pool.end();
    const second = await migratedPool();
    try {
      expect(second.database).not.toBe(first.database);
      const remaining = await second.pool.query('SELECT datname FROM pg_database WHERE datname = $1', [first.database]);
      expect(remaining.rows).toEqual([]);
    } finally { await second.pool.end(); }
  }, 120000);
});
