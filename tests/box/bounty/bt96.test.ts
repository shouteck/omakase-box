// BT96 — one bounty store under Git's common folder. The fixture databases here
// are written at the legacy `.box/local/box.db` path by hand: once the product
// moves first stores, using the product to make them would move them before the
// scenario starts.
import childProcess, { execFileSync, spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import fs, { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { appendEvent, boardTold, CHAIN_NS, closeStores, listOpen, metaGet, metaSet, outboxRows, owe, setMergeNoticeListener, storeDbPath } from '../../../packages/box-bounty/index.js';
import type { BountyRecord } from '../../../packages/box-bounty/index.js';
import { git, makeRepo, recordFilePath, runRoot, write } from './support.js';
import { readStoredSnapshot } from '../../../packages/box-bounty/store.js';

const AT = '2026-11-20T00:00:00.000Z';
const legacyDb = (repo: string): string => join(repo, '.box', 'local', 'box.db');
const sharedDb = (repo: string): string => {
  const shown = git(repo, ['rev-parse', '--git-path', 'common/box/box.db']);
  return isAbsolute(shown) ? shown : resolve(repo, shown);
};
const validRecord = (id: string, title: string): BountyRecord => ({
  schemaVersion: 1,
  kind: 'box-bounty-record',
  id,
  title,
  stage: 'drafted',
  createdAt: AT,
  events: [{ stage: 'drafted', at: AT }]
});
const SCHEMA = `
CREATE TABLE records(
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  open INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT,
  json TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT ''
);
CREATE INDEX records_open_updated ON records(open, updated_at);
CREATE INDEX records_open_ended ON records(open, ended_at);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE shared(
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  open INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT,
  json TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT ''
);
CREATE INDEX shared_open_updated ON shared(open, updated_at);
CREATE TABLE events(bounty_id TEXT NOT NULL, seq INTEGER NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(bounty_id, seq));
CREATE TABLE outbox(key TEXT PRIMARY KEY, bounty_id TEXT NOT NULL, event_seq INTEGER NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, result TEXT, done_at TEXT);
PRAGMA user_version=7;
`;

interface Seed {
  readonly id: string;
  readonly title?: string;
  readonly seqs?: readonly number[];
  readonly outbox?: readonly { key: string; kind: string; state?: string; eventSeq?: number }[];
  readonly meta?: readonly { key: string; value: string }[];
  readonly shared?: boolean;
  readonly corruptEventJson?: boolean;
}

/** A version-7 legacy store with exactly the rows the scenario needs. */
function seedLegacyStore(repo: string, seeds: readonly Seed[]): void {
  const file = legacyDb(repo);
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode=WAL');
    db.exec(SCHEMA);
    for (const seed of seeds) {
      const record = validRecord(seed.id, seed.title ?? `${seed.id} local draft`);
      const json = JSON.stringify(record);
      db.prepare('INSERT INTO records(id, stage, open, created_at, updated_at, ended_at, json, search_text) VALUES(?, ?, 1, ?, ?, NULL, ?, ?)')
        .run(seed.id, record.stage, AT, AT, json, `${record.id}\n${record.title}`.toLowerCase());
      if (seed.shared === true) db.prepare('INSERT INTO shared(id, stage, open, created_at, updated_at, ended_at, json, search_text) VALUES(?, ?, 1, ?, ?, NULL, ?, ?)')
        .run(seed.id, record.stage, AT, AT, json, `${record.id}\n${record.title}`.toLowerCase());
      const seqs = seed.seqs ?? [1];
      for (const seq of seqs) {
        const payload = seq === 1 ? record : { ...record, events: [...record.events, { stage: 'drafted', at: `2026-11-20T00:00:0${seq}.000Z` }] };
        db.prepare('INSERT INTO events(bounty_id, seq, at, kind, json) VALUES(?, ?, ?, ?, ?)')
          .run(seed.id, seq, AT, 'created', seed.corruptEventJson === true && seq === 1 ? '{not-json' : JSON.stringify(payload));
      }
      for (const row of seed.outbox ?? []) {
        const seq = row.eventSeq ?? seqs.at(-1)!;
        db.prepare('INSERT INTO outbox(key, bounty_id, event_seq, kind, state, result, done_at) VALUES(?, ?, ?, ?, ?, NULL, NULL)')
          .run(row.key, seed.id, seq, row.kind, row.state ?? 'pending');
        db.prepare('INSERT OR REPLACE INTO events(bounty_id, seq, at, kind, json) VALUES(?, ?, ?, ?, ?)')
          .run(seed.id, seq, AT, 'owed', JSON.stringify({ key: row.key, kind: row.kind }));
      }
      for (const meta of seed.meta ?? []) db.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run(meta.key, meta.value);
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
  rmSync(`${file}-wal`, { force: true });
  rmSync(`${file}-shm`, { force: true });
}

const cliStatus = (repo: string) => spawnSync(process.execPath, [fileURLToPath(new URL('../../../packages/box-cli/dist/cli.js', import.meta.url)), 'status'], { cwd: repo, encoding: 'utf8' });

/** Two worktrees of one Git repository: their stores share one common object store. */
function linkedRepos(): { readonly main: string; readonly side: string } {
  const main = makeRepo({ 'a.txt': 'a\n' });
  const side = join(runRoot('bt96-linked'), 'wt');
  git(main, ['worktree', 'add', '-q', '-b', 'bt96-side', side.replaceAll('\\', '/')]);
  return { main, side };
}

function noticed<T>(run: () => T): { readonly result: T; readonly lines: string[] } {
  const lines: string[] = [];
  setMergeNoticeListener(line => lines.push(line));
  try { return { result: run(), lines }; }
  finally { setMergeNoticeListener(null); }
}

const errorCode = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code;
  return undefined;
};

const samePath = (left: string, right: string): boolean => {
  const normalize = (value: string): string => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
  return normalize(left) === normalize(right);
};

afterEach(() => {
  setMergeNoticeListener(null);
  closeStores();
});

describe('BT96 the store moves under Git common storage', () => {
  it('moves a first legacy store whole and leaves the old database renamed, never deleted', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-aaaa1111bbbb';
    seedLegacyStore(repo, [{ id, seqs: [1, 2], shared: true, outbox: [{ key: `chain:${id}`, kind: 'chain', eventSeq: 2 }], meta: [{ key: `chain_tip:${id}`, value: 'c'.repeat(40) }] }]);
    expect(existsSync(sharedDb(repo))).toBe(false);

    expect(listOpen(repo).map(row => row.id)).toEqual([id]);

    const shared = sharedDb(repo);
    expect(storeDbPath(repo)).toBe(shared);
    expect(existsSync(shared)).toBe(true);
    expect(existsSync(legacyDb(repo))).toBe(false);
    const names = readdirSync(dirname(legacyDb(repo)));
    expect(names.some(name => /^box\.db\.moved-\d{4}-\d{2}-\d{2}/.test(name))).toBe(true);
    expect(names.some(name => name === 'box.db-wal' || name === 'box.db-shm')).toBe(false);
    expect(readFileSync(join(dirname(legacyDb(repo)), names.find(name => name.startsWith('box.db.moved-'))!), 'utf8')).not.toBe('');
    expect(metaGet(repo, `chain_tip:${id}`)).toBe('c'.repeat(40));
    closeStores();
    expect(existsSync(`${shared}-wal`)).toBe(false);
    expect(existsSync(`${shared}-shm`)).toBe(false);
    const original = join(dirname(legacyDb(repo)), names.find(name => name.startsWith('box.db.moved-'))!);
    const before = new DatabaseSync(original, { readOnly: true });
    const after = new DatabaseSync(shared, { readOnly: true });
    try {
      const counts = (db: DatabaseSync) => Object.fromEntries(['records', 'events', 'outbox', 'shared', 'meta'].map(table => [table, (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n]));
      const afterCounts = counts(after);
      expect(counts(before)).toEqual({ records: 1, events: 2, outbox: 1, shared: 1, meta: 1 });
      expect([afterCounts['records'], afterCounts['events'], afterCounts['outbox'], afterCounts['shared']]).toEqual([1, 2, 1, 1]);
      expect(afterCounts['meta']).toBeGreaterThanOrEqual(1);
    } finally {
      before.close();
      after.close();
    }
    closeStores();
  });

  it('git clean -fdx removes checkout-local files but the draft, pending outbox row and chain provenance survive', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-aaaa5555cccc';
    seedLegacyStore(repo, [{
      id,
      outbox: [{ key: `chain:${id}`, kind: 'chain', eventSeq: 1 }],
      meta: [
        { key: `chain_authored:${id}`, value: 'a'.repeat(40) },
        { key: `chain_pushed:${id}`, value: 'b'.repeat(40) },
        { key: `chain_tip:${id}`, value: 'c'.repeat(40) }
      ]
    }]);
    expect(listOpen(repo).map(row => row.id)).toEqual([id]);

    git(repo, ['clean', '-fdx']);

    expect(existsSync(join(repo, '.box'))).toBe(false);
    expect(listOpen(repo).map(row => row.id)).toEqual([id]);
    expect(outboxRows(repo, id).some(row => row.key === `chain:${id}` && row.state === 'pending')).toBe(true);
    expect(metaGet(repo, `chain_authored:${id}`)).toBe('a'.repeat(40));
    expect(metaGet(repo, `chain_pushed:${id}`)).toBe('b'.repeat(40));
    expect(metaGet(repo, `chain_tip:${id}`)).toBe('c'.repeat(40));
  });

  it('racing first movers install exactly one shared store and both keep their rows', () => {
    const { main, side } = linkedRepos();
    const first = 'bt-1111aaaa2222';
    const second = 'bt-3333bbbb4444';
    seedLegacyStore(main, [{ id: first }]);
    seedLegacyStore(side, [{ id: second }]);

    const shared = sharedDb(main);
    const realLinkSync = fs.linkSync;
    let phase: 'waiting' | 'winner' | 'loser' = 'waiting';
    let installCalls = 0;
    let winnerRows: string[] = [];
    let loserCode: string | undefined;
    const hooked = new Proxy(realLinkSync, {
      apply(target, receiver, args) {
        const [source, destination] = args;
        const install = typeof source === 'string' && typeof destination === 'string'
          && samePath(destination, shared) && basename(source).startsWith('box.db.install-');
        if (!install) return Reflect.apply(target, receiver, args);
        installCalls += 1;
        if (phase === 'waiting') {
          phase = 'winner';
          winnerRows = listOpen(side).map(row => row.id);
          phase = 'loser';
        }
        try {
          return Reflect.apply(target, receiver, args);
        } catch (error) {
          if (phase === 'loser') loserCode = errorCode(error);
          throw error;
        }
      }
    });
    fs.linkSync = hooked;
    syncBuiltinESMExports();
    let movedRows: string[] = [];
    try {
      movedRows = listOpen(main).map(row => row.id);
    } finally {
      fs.linkSync = realLinkSync;
      syncBuiltinESMExports();
    }

    expect(phase).toBe('loser');
    expect(installCalls).toBe(2);
    expect(winnerRows).toEqual([second]);
    expect(loserCode).toBe('EEXIST');
    expect(movedRows.sort()).toEqual([first, second].sort());
    closeStores();
    expect(listOpen(main).map(row => row.id).sort()).toEqual([first, second].sort());
    expect(listOpen(side).map(row => row.id).sort()).toEqual([first, second].sort());
    expect(existsSync(legacyDb(main))).toBe(false);
    expect(existsSync(legacyDb(side))).toBe(false);
    expect(existsSync(sharedDb(main))).toBe(true);
    expect(readdirSync(dirname(sharedDb(main))).some(name => name.startsWith('box.db.install-'))).toBe(false);
    expect(realpathSync(sharedDb(main))).toBe(realpathSync(sharedDb(side)));
  });

  it('a link in the shared store path refuses local-store-path-blocked and the old store stays in use', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-cccc2222dddd';
    seedLegacyStore(repo, [{ id }]);
    const shared = sharedDb(repo);
    mkdirSync(dirname(shared), { recursive: true });
    const outside = join(runRoot('bt96-outside'), 'outside.db');
    writeFileSync(outside, 'not a database');
    symlinkSync(outside, shared, 'file');

    const blocked = noticed(() => listOpen(repo));
    expect(blocked.result.map(row => row.id)).toEqual([id]);
    expect(blocked.lines.join('\n')).toContain('local-store-path-blocked');
    expect(blocked.lines.join('\n')).toContain(shared);
    expect(existsSync(legacyDb(repo))).toBe(true);
    rmSync(shared, { force: true });
    closeStores();
    expect(listOpen(repo).map(row => row.id)).toEqual([id]);
    expect(existsSync(shared)).toBe(true);
    expect(existsSync(legacyDb(repo))).toBe(false);
  });

  it('a corrupt legacy store refuses local-store-corrupt, installs nothing, and still opens the old store', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-dddd3333eeee';
    seedLegacyStore(repo, [{ id, corruptEventJson: true }]);

    const corrupt = noticed(() => listOpen(repo));
    expect(corrupt.result.map(row => row.id)).toEqual([id]);
    expect(corrupt.lines.join('\n')).toContain('local-store-corrupt');
    expect(corrupt.lines.join('\n')).toContain(legacyDb(repo));
    expect(existsSync(sharedDb(repo))).toBe(false);
    expect(existsSync(legacyDb(repo))).toBe(true);
    expect(listOpen(repo).map(row => row.id)).toEqual([id]);
  });

  it('a read-only snapshot reads an unmigrated legacy store without moving it', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-5555eeee6666';
    seedLegacyStore(repo, [{ id }]);

    expect(readStoredSnapshot(repo, id)?.id).toBe(id);
    expect(existsSync(legacyDb(repo))).toBe(true);
    expect(existsSync(sharedDb(repo))).toBe(false);
  });

  it('a synced checkout is named once and opens delete-mode, while an unsynced checkout stays wal', () => {
    const parent = realpathSync(runRoot('bt96-onedrive'));
    const nested = join(parent, 'synced', 'repo');
    mkdirSync(nested, { recursive: true });
    git(nested, ['init', '-q', '-b', 'main']);
    write(nested, 'a.txt', 'a\n');
    git(nested, ['add', '-A']);
    git(nested, ['-c', 'user.name=t', '-c', 'user.email=t@test.invalid', 'commit', '-qm', 'base']);
    const id = 'bt-eeee4444ffff';
    seedLegacyStore(nested, [{ id }]);
    const before = process.env['OneDrive'];
    process.env['OneDrive'] = parent;
    let lines: readonly string[] = [];
    try {
      const seen = noticed(() => listOpen(nested));
      lines = seen.lines;
      expect(seen.result.map(row => row.id)).toEqual([id]);
    } finally {
      if (before === undefined) delete process.env['OneDrive'];
      else process.env['OneDrive'] = before;
    }
    expect(lines.join('\n')).toContain(`this checkout is inside ${parent}, synced by OneDrive; sync can corrupt SQLite databases and Git repositories while they are in use; keep projects outside synced folders`);
    closeStores();
    const db = new DatabaseSync(storeDbPath(nested));
    try {
      expect((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('delete');
    } finally { db.close(); }
  });
});

describe('BT96 a later worktree joins by bounty', () => {
  it('imports an absent bounty whole: rows, original event sequence, outbox and scoped chain meta', () => {
    const { main, side } = linkedRepos();
    const first = 'bt-1212abab3434';
    const joined = 'bt-5656cdcd7878';
    seedLegacyStore(main, [{ id: first }]);
    expect(listOpen(main).map(row => row.id)).toEqual([first]);
    closeStores();
    seedLegacyStore(side, [{
      id: joined,
      seqs: [1, 2, 5],
      outbox: [{ key: `chain:${joined}`, kind: 'chain', eventSeq: 5 }],
      meta: [
        { key: `chain_authored:${joined}`, value: 'a'.repeat(40) },
        { key: `chain_pushed:${joined}`, value: 'b'.repeat(40) },
        { key: `chain_tip:${joined}`, value: 'c'.repeat(40) },
        { key: 'unrelated', value: 'not copied' }
      ]
    }]);

    expect(listOpen(side).map(row => row.id).sort()).toEqual([first, joined].sort());

    const events = (() => {
      const db = new DatabaseSync(sharedDb(main), { readOnly: true });
      try { return db.prepare('SELECT seq FROM events WHERE bounty_id=? ORDER BY seq').all(joined).map(row => (row as { seq: number }).seq); } finally { db.close(); }
    })();
    expect(events).toEqual([1, 2, 5]);
    expect(outboxRows(main, joined).map(row => row.key)).toEqual([`chain:${joined}`]);
    expect(metaGet(main, `chain_authored:${joined}`)).toBe('a'.repeat(40));
    expect(metaGet(main, `chain_pushed:${joined}`)).toBe('b'.repeat(40));
    expect(metaGet(main, `chain_tip:${joined}`)).toBe('c'.repeat(40));
    expect(metaGet(main, 'unrelated')).toBe(null);
  });

  it('a bounty present in both is not imported; the line names the kept copy, the file and each owed kind once', () => {
    const { main, side } = linkedRepos();
    const both = 'bt-9999aaaa8888';
    seedLegacyStore(main, [{ id: both, title: 'shared winner' }]);
    expect(listOpen(main).map(row => row.id)).toEqual([both]);
    closeStores();
    seedLegacyStore(side, [{
      id: both,
      title: 'other local history',
      outbox: [
        { key: `chain:${both}`, kind: 'chain' },
        { key: `board:${both}`, kind: 'board' },
        { key: `issue:${both}`, kind: 'issue' },
        { key: `decision:${both}`, kind: 'decision' }
      ]
    }]);

    const joined = noticed(() => listOpen(side));
    expect(joined.result.find(row => row.id === both)?.title).toBe('shared winner');
    const output = joined.lines.join('\n');
    expect(output).toContain(`${both} has a different local history in ${side}; kept the shared store's; the other is in `);
    expect(output).toContain('which nothing reads');
    expect(output).toContain('a shared-memory push');
    expect(output).toContain('a board hint');
    expect(output).toContain('an issue');
    expect(output).toContain('a decision comment');
    const db = new DatabaseSync(sharedDb(main), { readOnly: true });
    try {
      expect((db.prepare('SELECT json FROM records WHERE id=?').get(both) as { json: string }).json).toContain('shared winner');
    } finally { db.close(); }
  });

  it('only the checkout that imported a legacy JSON row may remove it from the shared store', () => {
    const { main, side } = linkedRepos();
    const id = 'bt-0000aaaa1111';
    // First move creates the shared store, with no row for this bounty.
    const other = 'bt-2222bbbb3333';
    seedLegacyStore(main, [{ id: other }]);
    expect(listOpen(main).map(row => row.id)).toEqual([other]);
    closeStores();

    // The side checkout joins a bounty and leaves the legacy compatibility JSON in its worktree.
    seedLegacyStore(side, [{ id }]);
    const compatFile = recordFilePath(side, id);
    mkdirSync(dirname(compatFile), { recursive: true });
    writeFileSync(compatFile, JSON.stringify(validRecord(id, 'json-backed draft'), null, 2) + '\n');
    expect(listOpen(side).map(row => row.id).sort()).toEqual([other, id].sort());
    closeStores();

    // Main has never had that file: its sync must not delete the row side imported.
    rmSync(compatFile, { force: true });
    expect(listOpen(main).map(row => row.id).sort()).toEqual([other, id].sort());
    closeStores();
    expect(listOpen(side).map(row => row.id)).toEqual([other]);
    closeStores();
    expect(listOpen(main).map(row => row.id)).toEqual([other]);
  });
});

describe('BT96 chain append names the expected head', () => {
  const event = (id: string, type: string) => ({ v: 1, type, id, at: AT, actor: 'bt96-test' });
  const rawGit = (repo: string, args: readonly string[], input?: string): string =>
    execFileSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-c', 'user.name=racer', '-c', 'user.email=racer@test.invalid', '-C', repo, ...args], { input, encoding: 'utf8' }).trim();

  /** A competing tool-authored chain event, with the provenance a real racer would have written before moving the ref. */
  function plantCompetitor(repo: string, id: string, type: string): string {
    const ref = `${CHAIN_NS}/${id}`;
    const parent = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-C', repo, 'rev-parse', '--verify', '-q', ref], { encoding: 'utf8' }).stdout.trim();
    const payload = JSON.stringify({ v: 1, type, id, at: AT, actor: 'racer' }) + '\n';
    const blob = rawGit(repo, ['hash-object', '-w', '--stdin'], payload);
    const tree = rawGit(repo, ['mktree'], `100644 blob ${blob}\tevent.json\n`);
    const commit = rawGit(repo, ['commit-tree', tree, '-m', 'racer', ...(parent === '' ? [] : ['-p', parent])]);
    metaSet(repo, `chain_authored:${id}`, commit);
    rawGit(repo, ['update-ref', ref, commit]);
    return commit;
  }

  /** At each production update-ref, move the ref first through the bypassing execFileSync path. */
  function raceRefUpdates(repo: string, id: string, limit = Number.POSITIVE_INFINITY): { readonly moves: () => number; readonly stop: () => void } {
    const inner = childProcess.spawnSync;
    let moves = 0;
    const hooked = new Proxy(inner, {
      apply(target, receiver, args) {
        const argv = Array.isArray(args[1]) ? args[1].map(String) : [];
        if (argv.includes('update-ref') && argv.includes('--stdin') && moves < limit) {
          moves += 1;
          plantCompetitor(repo, id, `racer-${moves}`);
        }
        return Reflect.apply(target, receiver, args);
      }
    });
    childProcess.spawnSync = hooked;
    syncBuiltinESMExports();
    return {
      moves: () => moves,
      stop: () => {
        childProcess.spawnSync = inner;
        syncBuiltinESMExports();
      }
    };
  }

  const chainEvents = (repo: string, id: string): Record<string, unknown>[] =>
    git(repo, ['rev-list', '--topo-order', '--reverse', `${CHAIN_NS}/${id}`]).split('\n').filter(line => line !== '')
      .map(commit => JSON.parse(git(repo, ['cat-file', 'blob', `${commit}:event.json`])) as Record<string, unknown>);

  it('a racing first append is rebuilt on the winner instead of overwriting it', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-ab12cd34ef56';
    const race = raceRefUpdates(repo, id, 1);
    try {
      appendEvent(repo, id, event(id, 'posted') as never);
    } finally { race.stop(); }
    expect(race.moves()).toBe(1);
    const events = chainEvents(repo, id);
    expect(events.map(entry => entry['type']).sort()).toEqual(['posted', 'racer-1']);
    expect(events).toHaveLength(2);
    expect(git(repo, ['rev-list', '--count', `${CHAIN_NS}/${id}`])).toBe('2');
  });

  it('a racing later append is rebuilt on the competitor and preserves both events', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-fedc4321ba98';
    appendEvent(repo, id, event(id, 'posted') as never);
    const race = raceRefUpdates(repo, id, 1);
    try {
      appendEvent(repo, id, event(id, 'solution') as never);
    } finally { race.stop(); }
    expect(race.moves()).toBe(1);
    const events = chainEvents(repo, id);
    expect(events.map(entry => entry['type'])).toEqual(['posted', 'racer-1', 'solution']);
  });

  it('a second lost race refuses chain-changed with the exact contract and writes no owed row', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-1357aaaa2468';
    const race = raceRefUpdates(repo, id);
    try {
      expect(() => appendEvent(repo, id, event(id, 'posted') as never)).toThrow(expect.objectContaining({
        reason: 'chain-changed',
        message: `${id}'s shared memory changed while this ran; nothing was written; next: run it again`
      }));
    } finally { race.stop(); }
    expect(race.moves()).toBe(2);
    expect(chainEvents(repo, id).map(entry => entry['type'])).toEqual(['racer-1', 'racer-2']);
    expect(outboxRows(repo, id).filter(row => row.kind === 'chain' && row.state === 'pending')).toEqual([]);
  });
});

describe('BT96 the outbox reads only what is owed', () => {
  it('the store schema indexes outbox state and the call sites query pending rows by kind or bounty', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    seedLegacyStore(repo, [{ id: 'bt-4444cccc5555' }]);
    expect(listOpen(repo).length).toBe(1);
    closeStores();
    const db = new DatabaseSync(storeDbPath(repo), { readOnly: true });
    try {
      const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='outbox'").all() as { name: string; sql: string | null }[];
      expect(indexes.some(index => index.sql?.toLowerCase().includes('state'))).toBe(true);
    } finally { db.close(); }
    const detail = (sql: string, values: string[] = []): string => {
      const explained = new DatabaseSync(storeDbPath(repo), { readOnly: true });
      try { return (explained.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values) as { detail: string }[]).map(row => row.detail).join('\n'); }
      finally { explained.close(); }
    };
    expect(detail("SELECT * FROM outbox WHERE state='pending'")).toContain('USING INDEX outbox_state');
    expect(detail("SELECT * FROM outbox WHERE state='pending' AND bounty_id=?", ['bt-4444cccc5555'])).toContain('USING INDEX outbox_state');
    expect(detail("SELECT * FROM outbox WHERE state='pending' AND kind=?", ['chain'])).toContain('USING INDEX outbox_state');
  });

  it('settled rows stay forever and still do not reappear as pending work', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const id = 'bt-7777dddd6666';
    seedLegacyStore(repo, [{
      id,
      outbox: [
        { key: `chain:${id}`, kind: 'chain', state: 'done' },
        { key: `board:${id}`, kind: 'board', state: 'refused' }
      ]
    }]);
    expect(listOpen(repo).map(row => row.id)).toEqual([id]);
    expect(storeDbPath(repo)).toBe(sharedDb(repo));
    closeStores();
    const settledDb = new DatabaseSync(storeDbPath(repo), { readOnly: true });
    try {
      expect((settledDb.prepare('SELECT state FROM outbox WHERE bounty_id=? ORDER BY state').all(id) as { state: string }[]).map(row => row.state)).toEqual(['done', 'refused']);
    } finally { settledDb.close(); }
    expect(outboxRows(repo, id).map(row => row.state).sort()).toEqual(['done', 'refused']);
    expect(boardTold(repo).pending).toBe(0);
    const key = owe(repo, id, 'chain', { tip: 'd'.repeat(40) });
    expect(key).toBe(`chain:${id}`);
    expect(outboxRows(repo, id).some(row => row.key === `chain:${id}` && row.state === 'pending')).toBe(true);
    expect(outboxRows(repo, id).some(row => row.key === `board:${id}` && row.state === 'refused')).toBe(true);
  });
});
