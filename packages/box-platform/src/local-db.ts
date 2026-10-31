// D1's shape on node:sqlite, for running the board on one machine. Never deployed.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { Db, Statement } from './store.js';

export function localDb(schemaFile: string, file = ':memory:'): Db & { close(): void } {
  const database = new DatabaseSync(file);
  database.exec(readFileSync(schemaFile, 'utf8'));
  const statement = (sql: string, values: readonly (string | number | null)[]): Statement => ({
    bind: (...next) => statement(sql, next),
    all: async <T>() => ({ results: database.prepare(sql).all(...values) as T[] }),
    first: async <T>() => (database.prepare(sql).get(...values) as T | undefined) ?? null,
    run: async () => database.prepare(sql).run(...values)
  });
  return { prepare: sql => statement(sql, []), close: () => database.close() };
}
