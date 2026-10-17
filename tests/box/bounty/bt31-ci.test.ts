// BT31-ci: one plain search on every Node. The store keeps a lower-cased
// search_text column and never uses SQLite's FTS5 — Node 22.13.0's bundled
// SQLite lacks it, and FTS5's whole-word matching disagreed with find's
// substring rule ("parser" missed "subparser" on Node 24 only). Stores made
// by the earlier versions (1: BT31, FTS5 table and no search_text; 2: both)
// open, migrate to version 3 (records_fts and its shadow tables dropped) and
// answer find. Each case runs unchanged on Node 24 and Node 22.13.0; the
// earlier-version stores are built here with raw SQL, and the FTS5 table only
// where the running SQLite has FTS5.
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeStores, finalizeBounty, findBounties, planBounty, renderStatus, searchRecords } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { makeRepo, write } from './support.js';

const dbPath = (repo: string): string => join(repo, '.box', 'local', 'box.db');

const probe = new DatabaseSync(':memory:');
const hostHasFts5 = (probe.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS f").get() as { f: number }).f === 1;
probe.close();

const create = (repo: string, title: string, why: string, task: string): string => {
  write(repo, `${title}.md`, `${task}\n`);
  const options: CreateOptions = { repoPath: repo, why, title, taskPath: join(repo, `${title}.md`) };
  return finalizeBounty(planBounty(options)).id;
};

const inspect = <T>(repo: string, read: (db: DatabaseSync) => T): T => {
  closeStores(repo);
  const db = new DatabaseSync(dbPath(repo));
  try { return read(db); } finally { db.close(); }
};
const ftsNames = (repo: string): string[] => inspect(repo, db =>
  (db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'records_fts%' ORDER BY name").all() as unknown as { name: string }[]).map(row => row.name));
const userVersion = (repo: string): number => inspect(repo, db => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);

// Ids differ between checkouts; title, stage and matched fields do not.
const found = (repo: string, query: string) =>
  findBounties(repo, query).matches.map(match => `${match.record.title} ${match.record.stage} ${match.fields.join(',')}`);

const seed = (repo: string): void => {
  create(repo, 'batching', 'the parser doubles latency under load', 'rewrite the telemetry batching window');
  create(repo, 'cache', 'cold starts are slow', 'add a parser cache for config');
  create(repo, 'docs', 'nobody reads the guide', 'shorten the install page');
};

// The answers every store, whatever made it, must give for the seed.
const expectSeedAnswers = (repo: string): void => {
  expect(found(repo, 'parser')).toEqual(['batching drafted why', 'cache drafted task']);
  expect(found(repo, 'telemetry')).toEqual(['batching drafted task']);
  expect(found(repo, 'guide')).toEqual(['docs drafted why']);
  expect(found(repo, 'batching window')).toEqual(['batching drafted task']);
  expect(found(repo, 'gu')).toEqual(['docs drafted why']);
  expect(found(repo, 'nothingmatcheshere')).toEqual([]);
  // The store's own word rule: every word must occur, across fields.
  expect(searchRecords(repo, 'parser telemetry').map(record => record.title)).toEqual(['batching']);
  expect(searchRecords(repo, 'parser guide')).toEqual([]);
};

// Turn a version-3 store into what an earlier version left: version 2 kept
// search_text and an FTS5 table; version 1 had the FTS5 table only. The FTS5
// table is created only where this SQLite has FTS5 (the earlier versions
// failed outright without it), and filled from the records like theirs.
const regress = (repo: string, version: 1 | 2): void => inspect(repo, db => {
  if (hostHasFts5) {
    db.exec('CREATE VIRTUAL TABLE records_fts USING fts5(id UNINDEXED, title, why, part_of, task, note)');
    db.exec("INSERT INTO records_fts(rowid, id, title, why, part_of, task, note) SELECT rowid, id, json_extract(json, '$.title'), json_extract(json, '$.why'), '', json_extract(json, '$.content.task.text'), '' FROM records");
  }
  if (version === 1) db.exec('ALTER TABLE records DROP COLUMN search_text');
  db.exec("INSERT INTO meta(key, value) VALUES('fts_stale', '1') ON CONFLICT(key) DO NOTHING");
  db.exec(`PRAGMA user_version=${version}`);
});

afterEach(() => { closeStores(); });

describe('BT31-ci — one plain search on every Node', () => {
  it('create, status and find answer from search_text, and no FTS table is made', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    seed(repo);
    expect(renderStatus(repo)).toContain('batching');
    expectSeedAnswers(repo);
    expect(ftsNames(repo)).toEqual([]);
    expect(userVersion(repo)).toBe(3);
  });

  it('find parser returns a record with "parser" and one with "subparser"', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    create(repo, 'whole', 'beyond this agent', 'fix the parser');
    create(repo, 'inner', 'beyond this agent', 'fix the subparser');
    expect(found(repo, 'parser')).toEqual(['whole drafted task', 'inner drafted task']);
    expect(found(repo, 'PARSER')).toEqual(['whole drafted task', 'inner drafted task']);
    expect(found(repo, 'subparser')).toEqual(['inner drafted task']);
  });

  for (const version of [1, 2] as const) {
    it(`a version-${version} store${hostHasFts5 ? ' holding records_fts' : ''} opens, migrates and finds by substring`, () => {
      const repo = makeRepo({ 'src/app.py': 'x\n' });
      seed(repo);
      create(repo, 'inner', 'beyond this agent', 'fix the subparser');
      regress(repo, version);
      if (hostHasFts5) expect(ftsNames(repo)).toContain('records_fts');
      expect(found(repo, 'parser')).toEqual(['batching drafted why', 'cache drafted task', 'inner drafted task']);
      expect(found(repo, 'guide')).toEqual(['docs drafted why']);
      expect(ftsNames(repo)).toEqual([]);
      expect(userVersion(repo)).toBe(3);
      expect(inspect(repo, db => db.prepare("SELECT value FROM meta WHERE key='fts_stale'").get())).toBeUndefined();
      expect(inspect(repo, db => (db.prepare("SELECT COUNT(*) AS n FROM records WHERE search_text=''").get() as { n: number }).n)).toBe(0);
      expect(inspect(repo, db => (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check)).toBe('ok');
      // Opening again changes nothing, and writes after the migration land.
      create(repo, 'later', 'the parser again', 'tidy up');
      expect(found(repo, 'parser')).toHaveLength(4);
      expect(found(repo, 'tidy')).toEqual(['later drafted task']);
      expect(userVersion(repo)).toBe(3);
    });
  }

  // A store holding records_fts opened by a Node whose SQLite lacks FTS5
  // (DROP TABLE fails with "no such module"): the table goes through the
  // writable_schema path. Only a Node without FTS5 can drive that path, so
  // this case runs under Node 22.13.0; there it builds the FTS5-era layout
  // by hand (the virtual table's schema row and its shadow tables) exactly
  // as SQLite wrote it on Node 24.
  it.skipIf(hostHasFts5)('without FTS5, a store whose schema holds records_fts still migrates and drops it', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    seed(repo);
    inspect(repo, db => {
      for (const shadow of ['data(id INTEGER PRIMARY KEY, block BLOB)', 'idx(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID', 'content(id INTEGER PRIMARY KEY, c0, c1, c2, c3, c4, c5)', 'docsize(id INTEGER PRIMARY KEY, sz BLOB)', 'config(k PRIMARY KEY, v) WITHOUT ROWID']) {
        db.exec(`CREATE TABLE records_fts_${shadow}`);
      }
      db.exec('PRAGMA writable_schema=ON');
      db.exec("INSERT INTO sqlite_master(type, name, tbl_name, rootpage, sql) VALUES('table', 'records_fts', 'records_fts', 0, 'CREATE VIRTUAL TABLE records_fts USING fts5(id UNINDEXED, title, why, part_of, task, note)')");
      db.exec('PRAGMA writable_schema=OFF');
      db.exec('PRAGMA user_version=2');
    });
    expect(ftsNames(repo)).toContain('records_fts');
    expectSeedAnswers(repo);
    expect(ftsNames(repo)).toEqual([]);
    expect(userVersion(repo)).toBe(3);
    expect(inspect(repo, db => (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check)).toBe('ok');
  });
});
