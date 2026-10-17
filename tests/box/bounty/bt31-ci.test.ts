// BT31-ci: the record store works on a Node whose SQLite lacks FTS5
// (Node 22.13.0's bundled build). BOX_BOUNTY_TEST_NO_FTS5=1 is the test-only
// switch store.ts reads to take the no-FTS5 path on a Node that has FTS5;
// the store asks once per open, so each switch closes the cached
// connection first. Against master the switch does nothing and a store made
// "without FTS5" still holds records_fts — the first test fails there.
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeStores, finalizeBounty, findBounties, planBounty, renderStatus, searchRecords } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { makeRepo, write } from './support.js';

const dbPath = (repo: string): string => join(repo, '.box', 'local', 'box.db');

// Tests that open a store WITH FTS5 need a Node whose SQLite has it; on one
// without (Node 22.13.0) they are skipped by this capability probe, the way
// K10 marks host-only tests.
const probe = new DatabaseSync(':memory:');
const hostHasFts5 = (probe.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS f").get() as { f: number }).f === 1;
probe.close();

const create = (repo: string, title: string, why: string, task: string): string => {
  write(repo, `${title}.md`, `${task}\n`);
  const options: CreateOptions = { repoPath: repo, why, title, taskPath: join(repo, `${title}.md`) };
  return finalizeBounty(planBounty(options)).id;
};

// Open the store fresh with or without FTS5 for what follows.
const reopen = (repo: string, fts: boolean): void => {
  closeStores(repo);
  if (fts) delete process.env.BOX_BOUNTY_TEST_NO_FTS5;
  else process.env.BOX_BOUNTY_TEST_NO_FTS5 = '1';
};

const inspect = <T>(repo: string, read: (db: DatabaseSync) => T): T => {
  closeStores(repo);
  const db = new DatabaseSync(dbPath(repo));
  try { return read(db); } finally { db.close(); }
};
const hasFtsTable = (repo: string): boolean => inspect(repo, db =>
  (db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='records_fts'").get() as { n: number }).n === 1);
const ftsRows = (repo: string): number => inspect(repo, db => (db.prepare('SELECT COUNT(*) AS n FROM records_fts').get() as { n: number }).n);

// Ids differ between checkouts; title, stage and matched fields do not.
const found = (repo: string, query: string) =>
  findBounties(repo, query).matches.map(match => `${match.record.title} ${match.record.stage} ${match.fields.join(',')}`);
const searched = (repo: string, query: string) => searchRecords(repo, query).map(record => record.id).sort();

const QUERIES = ['parser', 'telemetry', 'batching window', 'nothingmatcheshere', 'gu'];

const seed = (repo: string): void => {
  create(repo, 'batching', 'the parser doubles latency under load', 'rewrite the telemetry batching window');
  create(repo, 'cache', 'cold starts are slow', 'add a parser cache for config');
  create(repo, 'docs', 'nobody reads the guide', 'shorten the install page');
};

afterEach(() => {
  closeStores();
  delete process.env.BOX_BOUNTY_TEST_NO_FTS5;
});

describe('BT31-ci — the store without FTS5', () => {
  it('create, status and find work without FTS5 and answer exactly as the FTS5 path does', () => {
    const withFts = makeRepo({ 'src/app.py': 'x\n' });
    seed(withFts);
    const expected = Object.fromEntries(QUERIES.map(query => [query, found(withFts, query)]));

    const plain = makeRepo({ 'src/app.py': 'x\n' });
    reopen(plain, false);
    seed(plain);
    expect(renderStatus(plain)).toContain('batching');
    // A word in why, a word in the task, two words (both must match), a
    // word in nothing, a needle shorter than three letters.
    expect(found(plain, 'parser')).toHaveLength(2);
    expect(found(plain, 'telemetry')).toEqual(['batching drafted task']);
    expect(found(plain, 'nothingmatcheshere')).toEqual([]);
    for (const query of QUERIES) expect(found(plain, query), query).toEqual(expected[query]);
    // The store's own word rule: every word must match, across fields.
    expect(searchRecords(plain, 'parser telemetry').map(record => record.title)).toEqual(['batching']);
    expect(searchRecords(plain, 'parser guide')).toEqual([]);
    expect(searchRecords(withFts, 'parser telemetry').map(record => record.title)).toEqual(['batching']);
    // A store made without FTS5 never holds the FTS table.
    expect(hasFtsTable(plain)).toBe(false);
  });

  it.skipIf(!hostHasFts5)('a store created with FTS5 still opens and answers find when FTS5 is missing', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    seed(repo);
    expect(hasFtsTable(repo)).toBe(true);
    const before = searched(repo, 'parser');
    reopen(repo, false);
    expect(searched(repo, 'parser')).toEqual(before);
    expect(found(repo, 'install')).toHaveLength(1);
    // A write without FTS5 cannot reach records_fts; the next FTS5 open
    // rebuilds it, so the new record is found there too.
    create(repo, 'later', 'the parser again', 'tidy up');
    expect(searched(repo, 'parser')).toHaveLength(3);
    reopen(repo, true);
    expect(searched(repo, 'parser')).toHaveLength(3);
    expect(found(repo, 'tidy')).toHaveLength(1);
    expect(ftsRows(repo)).toBe(4);
    expect(inspect(repo, db => db.prepare("SELECT value FROM meta WHERE key='fts_stale'").get())).toBeUndefined();
  });

  it('a BT31 store (no search_text column) opens without FTS5 and finds by every field', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    seed(repo);
    inspect(repo, db => db.exec('ALTER TABLE records DROP COLUMN search_text; PRAGMA user_version=1'));
    reopen(repo, false);
    expect(found(repo, 'telemetry')).toHaveLength(1);
    expect(found(repo, 'guide')).toHaveLength(1);
  });

  it.skipIf(!hostHasFts5)('a store created without FTS5 builds records_fts when next opened with it, and find answers', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    reopen(repo, false);
    seed(repo);
    expect(hasFtsTable(repo)).toBe(false);
    reopen(repo, true);
    expect(found(repo, 'parser')).toHaveLength(2);
    expect(hasFtsTable(repo)).toBe(true);
    expect(ftsRows(repo)).toBe(3);
  });
});
