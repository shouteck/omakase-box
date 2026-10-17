// The bounty-record store (BT31): records live in one SQLite database per
// checkout at `.box/local/box.db`, not one JSON file per bounty. Every
// command used to read every record file (`listRecords` scanned
// `.box/bounties/*.json`); the store answers the same questions from
// indexed columns and a trigram FTS table instead. The `json` column holds
// the record exactly as persistRecord writes it — pretty JSON plus a
// trailing newline — so the record shape and `asRecord` validation are
// unchanged: the database is where records are kept, never a new shape.
//
// Compatibility: JSON files planted under `.box/bounties/` (older checkouts,
// tests, hand edits) are still honoured. Each store operation runs
// syncJsonFiles first: a file whose sha256 differs from the last import —
// or whose marker is absent — is (re)imported through JSON.parse + the same
// validation; a file that fails reads as corrupt through meta markers; a
// tracked file that vanished removes its row. A database write is stamped
// against the file's current bytes so an unchanged stale file can never
// roll the record back (rule 5 of the wave brief).

import { createHash } from 'node:crypto';
import { existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { BountyRefused } from './errors.js';
import type { BountyRecord,ListedBounty } from './record.js';

// The record shape is record.ts's to define, and record.ts imports this
// module — the store validates through a seam registered at record.ts's
// load, the same direction the read-scan and open-surfaces seams run. A
// bare import of this module alone throws rather than silently trusting
// unvalidated bytes.
let codec: { readonly validate: (parsed: unknown) => BountyRecord | null; readonly isOpen: (stage: string) => boolean } | undefined;
export function setStoreCodec(next: { readonly validate: (parsed: unknown) => BountyRecord | null; readonly isOpen: (stage: string) => boolean }): void { codec = next; }
const validate = (parsed: unknown): BountyRecord | null => {
  if (codec === undefined) throw new Error('box-bounty wiring: the store validates through record.ts — import the package index');
  return codec.validate(parsed);
};
const openStage = (stage: string): boolean => {
  if (codec === undefined) throw new Error('box-bounty wiring: the store validates through record.ts — import the package index');
  return codec.isOpen(stage);
};

// The SQLite experimental warning is filtered here and in the CLI's
// node-check (whichever module loads first registers — the guard symbol is
// shared). A 'warning' listener cannot hide it: Node prints warnings to
// stderr whether or not the event has listeners, and --no-warnings is too
// broad. The narrow seam is process.emitWarning — internals call it for
// the print — so it is wrapped to drop exactly the SQLite notice while
// every other warning passes through unchanged.
const FILTERED = Symbol.for('box-bounty.sqlite-warning-filter');
const flagged = process as unknown as Record<PropertyKey, unknown>;
if (flagged[FILTERED] !== true) {
  flagged[FILTERED] = true;
  const emitWarning = process.emitWarning;
  process.emitWarning = function (warning: string | Error, ...rest: unknown[]): void {
    const message = typeof warning === 'string' ? warning : warning?.message;
    const kind = typeof warning === 'object' && warning !== null && 'name' in warning
      ? warning.name
      : typeof rest[0] === 'string' ? rest[0] : (rest[0] as { type?: string } | undefined)?.type;
    if (kind === 'ExperimentalWarning' && typeof message === 'string' && message.startsWith('SQLite is an experimental feature')) return;
    return emitWarning.call(process, warning as never, ...(rest as never[]));
  };
}

// node:sqlite emits its warning the moment the module evaluates, so it must
// load after the filter above — and lazily, so `help` and `describe` on a
// store-free checkout never pay for it. A static import cannot do either
// (bundlers hoist it ahead of the filter), hence createRequire (the
// "dynamic import after listener" the packaging station card allows).
const require_ = createRequire(import.meta.url);
let sqliteDriver: typeof DatabaseSync | undefined;
const driver = (): typeof DatabaseSync => {
  if (sqliteDriver === undefined) sqliteDriver = (require_('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  return sqliteDriver;
};

export const localStoreDir = (repoRoot: string): string => join(repoRoot, '.box', 'local');
export const storeDbPath = (repoRoot: string): string => join(localStoreDir(repoRoot), 'box.db');
const legacyDir = (repoRoot: string): string => join(repoRoot, '.box', 'bounties');
const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');

// `.box` and `.box/local` are walked component by component before any path
// under them is opened: a link or junction there must never be followed
// outside the checkout.
const checkInside = (repoRoot: string): void => {
  for (const named of ['.box', join('.box', 'local')]) {
    const at = join(repoRoot, named);
    const stat = lstatSync(at, { throwIfNoEntry: false });
    if (stat === undefined) continue;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new BountyRefused('local-store-path-blocked', `${named} is a link or not a directory — the record store must be a real directory inside this checkout; nothing was written`);
    }
  }
};

// First open in a checkout: create `.box/local/` link-safe, pin the
// `.gitignore` (everything under it is this checkout's alone), then open —
// WAL, a bounded wait for a concurrent writer, NORMAL durability.
// `PRAGMA journal_mode=WAL` grabs an exclusive lock that busy_timeout does
// not cover, so two first-opens racing get database-locked outright; the
// whole open-and-set-up sequence retries on a locked/busy answer for the
// same five seconds busy_timeout gives every later statement.
const sleep = (ms: number): void => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const isLocked = (error: unknown): boolean => error instanceof Error && /locked|busy/i.test(error.message);
function openDb(repoRoot: string): DatabaseSync {
  checkInside(repoRoot);
  const dir = localStoreDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  const gitignore = join(dir, '.gitignore');
  if (!existsSync(gitignore)) writeFileSync(gitignore, '*\n');
  const deadline = Date.now() + 5000;
  for (;;) {
    let db: DatabaseSync | undefined;
    try {
      db = new (driver())(storeDbPath(repoRoot));
      setUp(db, repoRoot);
      return db;
    } catch (error) {
      try { db?.close(); } catch { /* never opened */ }
      if (!isLocked(error) || Date.now() >= deadline) throw error;
      sleep(50);
    }
  }
}

function setUp(db: DatabaseSync, repoRoot: string): void {
  db.exec('PRAGMA busy_timeout=5000');
  // The fast path for an already-built store: journal_mode=WAL persists in
  // the file and the schema's presence is told by user_version, so a steady-
  // state open sets the per-connection pragmas and goes straight to the
  // compat scan — no DDL round-trips on every command.
  if ((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode !== 'wal') db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA synchronous=NORMAL');
  if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version !== 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS records(
        id TEXT PRIMARY KEY,
        stage TEXT NOT NULL,
        open INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ended_at TEXT,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_open_updated ON records(open, updated_at);
      CREATE INDEX IF NOT EXISTS records_open_ended ON records(open, ended_at);
      CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
        id UNINDEXED, title, why, part_of, task, note,
        tokenize='trigram'
      );
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    db.exec('PRAGMA user_version=1');
  }
  syncJsonFiles(db, repoRoot);
  // The one-time marker: once the first scan ran, .box/bounties/ is a
  // compat input, not the place records live.
  db.prepare("INSERT INTO meta(key, value) VALUES('imported_from_json', '1') ON CONFLICT(key) DO NOTHING").run();
}

// Does `.box/bounties/` hold a compat file a first open would import?
// One stat + one listing, only asked while no database exists yet.
const legacyFilesWait = (repoRoot: string): boolean => {
  const dir = legacyDir(repoRoot);
  const stat = lstatSync(dir, { throwIfNoEntry: false });
  return stat !== undefined && !stat.isSymbolicLink() && stat.isDirectory()
    && readdirSync(dir).some(entry => entry.endsWith('.json'));
};

// Every store operation opens its own connection and closes it before
// returning. A long-lived host (a test runner, a hook host, an agent
// embedding the package) must never pin a checkout's WAL files open —
// Windows refuses to remove the folder while it does, and only an explicit
// close releases them: a cached connection could not close on a timer
// anyway, because a synchronous removal loop would starve the timer.
// Commands are one-shot processes, so caching bought nothing but the pin.
// The JSON-compat scan runs inside every open, so a file planted mid-
// process by an older tool (or a test fixture) is imported before the
// answer is read. Reads never create the database: with no database and no
// compat files waiting there is nothing to answer with, and a command that
// only reads leaves no .box/local behind. Writes always open for real.
function withDb<T>(repoRoot: string, write: boolean, run: (db: DatabaseSync | undefined) => T): T {
  let db: DatabaseSync | undefined;
  if (write || existsSync(storeDbPath(repoRoot)) || legacyFilesWait(repoRoot)) db = openDb(repoRoot);
  try { return run(db); }
  finally {
    if (db !== undefined) {
      try { db.close(); } catch { /* already closed */ }
    }
  }
}

// Kept for callers written against a pooled world: connections are per-
// operation now, so there is nothing to close — the export stays so those
// call sites and tests keep compiling.
export function closeStores(): void { /* connections are per-operation */ }

interface FileMeta { readonly sha: string | null; readonly sig: string | null; readonly corrupt: boolean }

// Read every file_sha/corrupt_file marker once; the sync below walks files
// by name and purges markers whose file vanished.
function fileMarkers(db: DatabaseSync): Map<string, FileMeta> {
  const markers = new Map<string, FileMeta>();
  const rows = db.prepare("SELECT key, value FROM meta WHERE key GLOB 'file_sha:*' OR key GLOB 'file_sig:*' OR key GLOB 'corrupt_file:*'").all() as unknown as { key: string; value: string }[];
  for (const { key, value } of rows) {
    const entry = key.slice(key.indexOf(':') + 1);
    const found = markers.get(entry) ?? { sha: null, sig: null, corrupt: false };
    markers.set(entry, {
      sha: key.startsWith('file_sha:') ? value : found.sha,
      sig: key.startsWith('file_sig:') ? value : found.sig,
      corrupt: found.corrupt || key.startsWith('corrupt_file:')
    });
  }
  return markers;
}

const deleteRow = (db: DatabaseSync, id: string): void => {
  db.prepare('DELETE FROM records WHERE id=?').run(id);
  db.prepare('DELETE FROM records_fts WHERE id=?').run(id);
};

const upsertRow = (db: DatabaseSync, record: BountyRecord): void => {
  const last = record.events.at(-1)?.at ?? record.createdAt;
  const ended = openStage(record.stage) ? null : last;
  db.prepare('INSERT INTO records(id, stage, open, created_at, updated_at, ended_at, json) VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, open=excluded.open, updated_at=excluded.updated_at, ended_at=excluded.ended_at, json=excluded.json')
    .run(record.id, record.stage, openStage(record.stage) ? 1 : 0, record.createdAt, last, ended, JSON.stringify(record, null, 2) + '\n');
  db.prepare('DELETE FROM records_fts WHERE id=?').run(record.id);
  db.prepare('INSERT INTO records_fts(id, title, why, part_of, task, note) VALUES(?, ?, ?, ?, ?, ?)')
    .run(record.id, record.title, record.why ?? '', record.partOf ?? record.job?.file ?? '', record.content?.task.text ?? '', [record.content?.note?.text, record.resume?.kind === 'recorded' ? record.resume.note : null].filter((text): text is string => typeof text === 'string').join('\n'));
};

// Import what `.box/bounties/*.json` carries that the database has not
// already seen — fingerprinted by sha256. Every store operation runs this,
// so the steady-state scan must be cheap: a file whose recorded
// size:mtime signature still matches is skipped without a read (the sha is
// still authoritative — a changed signature costs one read+hash, and a
// rewrite that lands on the same bytes just refreshes the signature).
// Without it, a command that writes once per record re-reads the whole
// compat folder per write — O(records × files).
function syncJsonFiles(db: DatabaseSync, repoRoot: string): void {
  const dir = legacyDir(repoRoot);
  const stat = lstatSync(dir, { throwIfNoEntry: false });
  const present = new Map<string, string>();
  if (stat !== undefined && !stat.isSymbolicLink() && stat.isDirectory()) {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.json')) continue;
      const fileStat = lstatSync(join(dir, entry), { throwIfNoEntry: false });
      if (fileStat === undefined) continue;
      present.set(entry, `${fileStat.size}:${fileStat.mtimeMs}`);
    }
  }
  const markers = fileMarkers(db);
  for (const entry of markers.keys()) {
    if (present.has(entry)) continue;
    // The file this marker tracked is gone: the record it described is
    // gone too — the file was the compat source for that row.
    deleteRow(db, entry.slice(0, -'.json'.length));
    db.prepare("DELETE FROM meta WHERE key IN ('file_sha:' || ?, 'file_sig:' || ?, 'corrupt_file:' || ?)").run(entry, entry, entry);
  }
  const setMeta = db.prepare("INSERT INTO meta(key, value) VALUES(? || ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  for (const [entry, sig] of present) {
    if (markers.get(entry)?.sig === sig) continue;
    let bytes: Buffer;
    try { bytes = readFileSync(join(dir, entry)); } catch { continue; }
    const sha = sha256(bytes);
    if (markers.get(entry)?.sha === sha) {
      // Same bytes, new timestamps — remember the signature and move on.
      setMeta.run('file_sig:', entry, sig);
      continue;
    }
    const id = entry.slice(0, -'.json'.length);
    let record: BountyRecord | null = null;
    try { record = validate(JSON.parse(bytes.toString('utf8'))); } catch { record = null; }
    if (record === null) {
      deleteRow(db, id);
      setMeta.run('corrupt_file:', entry, sha);
    } else {
      upsertRow(db, record);
      db.prepare("DELETE FROM meta WHERE key='corrupt_file:' || ?").run(entry);
    }
    setMeta.run('file_sha:', entry, sha);
    setMeta.run('file_sig:', entry, sig);
  }
}

const rowToRecord = (row: unknown): BountyRecord | null => {
  try { return validate(JSON.parse((row as { json: string }).json)); } catch { return null; }
};

export interface StoredRead {
  readonly record: BountyRecord | null;
  /** 'missing' — nothing named id; 'corrupt' — a compat file marker says
      the bytes under that id are not a record; 'ok' — a validated record. */
  readonly state: 'ok' | 'corrupt' | 'missing';
}

export function readStored(repoRoot: string, id: string): StoredRead {
  return withDb(repoRoot, false, db => {
    if (db === undefined) return { record: null, state: 'missing' } as StoredRead;
    const row = db.prepare('SELECT json FROM records WHERE id=?').get(id) as { json: string } | undefined;
    if (row !== undefined) {
      const record = rowToRecord(row);
      return { record, state: record === null ? 'corrupt' : 'ok' };
    }
    const corrupt = db.prepare("SELECT value FROM meta WHERE key='corrupt_file:' || ?").get(`${id}.json`) as { value: string } | undefined;
    return { record: null, state: corrupt === undefined ? 'missing' : 'corrupt' };
  });
}

export function recordExists(repoRoot: string, id: string): boolean {
  return readStored(repoRoot, id).state !== 'missing';
}

export function recordIds(repoRoot: string): string[] {
  return withDb(repoRoot, false, db => {
    if (db === undefined) return [];
    const ids = new Set<string>((db.prepare('SELECT id FROM records').all() as unknown as { id: string }[]).map(row => row.id));
    for (const row of db.prepare("SELECT key FROM meta WHERE key GLOB 'corrupt_file:*'").all() as unknown as { key: string }[]) {
      ids.add(row.key.slice('corrupt_file:'.length, -'.json'.length));
    }
    return [...ids].sort();
  });
}

// One entry per record the way the file scan reported it — corrupt compat
// files list as { record: null, file } so status names them. Sorted by
// createdAt (filename for entries without a record), as listRecords did.
export function allRecords(repoRoot: string): ListedBounty[] {
  return withDb(repoRoot, false, db => {
    if (db === undefined) return [];
    const listed: ListedBounty[] = [];
    for (const row of db.prepare('SELECT id, json FROM records').all() as unknown as { id: string; json: string }[]) {
      listed.push({ record: rowToRecord(row), file: `${row.id}.json` });
    }
    for (const row of db.prepare("SELECT key FROM meta WHERE key GLOB 'corrupt_file:*'").all() as unknown as { key: string }[]) {
      listed.push({ record: null, file: row.key.slice('corrupt_file:'.length) });
    }
    listed.sort((a, b) => (a.record?.createdAt ?? a.file).localeCompare(b.record?.createdAt ?? b.file));
    return listed;
  });
}

export function listOpen(repoRoot: string): BountyRecord[] {
  return withDb(repoRoot, false, db => db === undefined ? []
    : (db.prepare('SELECT json FROM records WHERE open=1 ORDER BY created_at, id').all() as unknown[]).map(rowToRecord).filter((record): record is BountyRecord => record !== null));
}

export function listEndedRecent(repoRoot: string, limit?: number): BountyRecord[] {
  return withDb(repoRoot, false, db => {
    if (db === undefined) return [];
    const sql = `SELECT json FROM records WHERE open=0 ORDER BY ended_at DESC, id DESC${limit === undefined ? '' : ' LIMIT ?'}`;
    const rows = (limit === undefined ? db.prepare(sql).all() : db.prepare(sql).all(limit)) as unknown[];
    return rows.map(rowToRecord).filter((record): record is BountyRecord => record !== null);
  });
}

export function countEnded(repoRoot: string): number {
  return withDb(repoRoot, false, db => db === undefined ? 0
    : (db.prepare('SELECT COUNT(*) AS n FROM records WHERE open=0').get() as { n: number }).n);
}

// Compat files that failed validation — the count status and the hook name
// without materialising entries.
export function countCorrupt(repoRoot: string): number {
  return withDb(repoRoot, false, db => db === undefined ? 0
    : (db.prepare("SELECT COUNT(*) AS n FROM meta WHERE key GLOB 'corrupt_file:*'").get() as { n: number }).n);
}

// The corrupt files' names — status prints each as `! <file>`, so the
// bounded overview needs the names without the records table.
export function corruptFiles(repoRoot: string): string[] {
  return withDb(repoRoot, false, db => db === undefined ? []
    : (db.prepare("SELECT key FROM meta WHERE key GLOB 'corrupt_file:*'").all() as unknown as { key: string }[])
      .map(row => row.key.slice('corrupt_file:'.length)).sort());
}

// Ended records whose stored JSON contains a fixed substring — how the
// bounded overview finds an ended bounty still carrying `pending` work, or
// one whose applied merge a first-merge notice names, without parsing every
// ended record.
export function endedContaining(repoRoot: string, substring: string): BountyRecord[] {
  return withDb(repoRoot, false, db => {
    if (db === undefined) return [];
    const like = `%${substring.split(BS).join(BS + BS).replaceAll('%', BS + '%').replaceAll('_', BS + '_')}%`;
    return (db.prepare(`SELECT json FROM records WHERE open=0 AND json LIKE ? ESCAPE '${BS}'`).all(like) as unknown[])
      .map(rowToRecord).filter((record): record is BountyRecord => record !== null);
  });
}

// The record's stored bytes, re-rendered the way the file used to read:
// pretty JSON plus a trailing newline. Null when the store holds nothing.
export function storedRaw(repoRoot: string, id: string): string | null {
  return withDb(repoRoot, false, db => {
    if (db === undefined) return null;
    const row = db.prepare('SELECT json FROM records WHERE id=?').get(id) as { json: string } | undefined;
    if (row !== undefined) {
      try { return JSON.stringify(JSON.parse(row.json), null, 2) + '\n'; } catch { return row.json; }
    }
    return null;
  });
}

// One record write, row and FTS together in a single transaction so a
// crashed write can never split them. The compat fingerprint for a sibling
// JSON file is stamped to the file's CURRENT bytes — a stale file an older
// tool or test left behind can never roll this write back, while a genuine
// later edit still reimports through its new hash.
export function writeStored(repoRoot: string, record: BountyRecord): void {
  withDb(repoRoot, true, db => {
    db!.exec('BEGIN IMMEDIATE');
    try {
      upsertRow(db!, record);
      const entry = `${record.id}.json`;
      const file = join(legacyDir(repoRoot), entry);
      const bytes = existsSync(file) ? readFileSync(file) : null;
      if (bytes !== null) {
        db!.prepare("INSERT INTO meta(key, value) VALUES('file_sha:' || ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(entry, sha256(bytes));
      }
      db!.prepare("DELETE FROM meta WHERE key='corrupt_file:' || ?").run(entry);
      db!.exec('COMMIT');
    } catch (error) {
      db!.exec('ROLLBACK');
      throw error;
    }
  });
}

// Drop a record everywhere it exists: the row, its FTS entry, the compat
// fingerprints and the JSON file itself if one still sits there.
export function dropStored(repoRoot: string, id: string): void {
  withDb(repoRoot, true, db => {
    const entry = `${id}.json`;
    deleteRow(db!, id);
    db!.prepare("DELETE FROM meta WHERE key IN ('file_sha:' || ?, 'corrupt_file:' || ?)").run(entry, entry);
    rmSync(join(legacyDir(repoRoot), entry), { force: true });
  });
}

// Test-support seam: a fixture rewrote `.box/bounties/<entry>` on disk —
// drop the fingerprint so the next read reimports it through asRecord.
export function forgetFileSha(repoRoot: string, entry: string): void {
  if (!existsSync(storeDbPath(repoRoot))) return;
  withDb(repoRoot, false, db => db?.prepare("DELETE FROM meta WHERE key IN ('file_sha:' || ?, 'corrupt_file:' || ?)").run(entry, entry));
}

// FTS5 trigram match for needles of three characters or more — substring
// semantics, case-folded — and a plain case-folded substring scan over the
// stored JSON for shorter needles, where trigrams cannot index. Results
// come back as full records; callers re-derive matched fields.
export function searchRecords(repoRoot: string, needle: string, limit?: number): BountyRecord[] {
  return withDb(repoRoot, false, db => {
    if (db === undefined) return [];
    const escaped = needle.replaceAll('"', '""');
    let rows: unknown[];
    if (needle.length >= 3) {
      // id is UNINDEXED in the FTS table — matching is still whole-record,
      // so an id fragment finds its record through a plain substring probe.
      const idLike = `%${needle.split(BS).join(BS + BS).replaceAll('%', BS + '%').replaceAll('_', BS + '_')}%`;
      const idRows = db.prepare(`SELECT json FROM records WHERE lower(id) LIKE ? ESCAPE '${BS}'`).all(idLike) as unknown[];
      try {
        rows = (db.prepare('SELECT r.json FROM records_fts JOIN records r ON r.id = records_fts.id WHERE records_fts MATCH ?').all(`"${escaped}"`) as unknown[])
          .concat(idRows);
      } catch {
        rows = idRows;
      }
      // A trigram query that found nothing can still miss a needle it could
      // not index (rare byte patterns) — the LIKE scan settles zero-match and
      // odd-needle queries exactly, at the old file-scan price.
      if (rows.length === 0) rows = likeScan(db, needle, limit);
    } else {
      rows = likeScan(db, needle, limit);
    }
    const seen = new Set<string>();
    return rows.filter(row => {
      const json = (row as { json: string }).json;
      if (seen.has(json)) return false;
      seen.add(json);
      return true;
    }).map(rowToRecord).filter((record): record is BountyRecord => record !== null);
  });
}

const BS = String.fromCharCode(92);
function likeScan(db: DatabaseSync, needle: string, limit?: number): unknown[] {
  const like = `%${needle.split(BS).join(BS + BS).replaceAll('%', BS + '%').replaceAll('_', BS + '_')}%`;
  const sql = `SELECT json FROM records WHERE lower(json) LIKE ? ESCAPE '${BS}'${limit === undefined ? '' : ' LIMIT ?'}`;
  return (limit === undefined ? db.prepare(sql).all(like) : db.prepare(sql).all(like, limit)) as unknown[];
}

// Does any stored record's JSON carry this exact substring — for checks
// that ask "does some record record X" without reading every record.
export function anyJsonContaining(repoRoot: string, substring: string): boolean {
  return withDb(repoRoot, false, db => {
    if (db === undefined) return false;
    const like = `%${substring.split(BS).join(BS + BS).replaceAll('%', BS + '%').replaceAll('_', BS + '_')}%`;
    return (db.prepare(`SELECT EXISTS(SELECT 1 FROM records WHERE json LIKE ? ESCAPE '${BS}') AS n`).get(like) as { n: number }).n === 1;
  });
}

// The ids the store knows, for snapshot classification — WITHOUT creating
// anything: no database file yet means no ids, and an unreadable store is
// simply empty here.
export function storedIds(repoRoot: string): string[] {
  const path = storeDbPath(repoRoot);
  if (!existsSync(path)) return [];
  let db: DatabaseSync | undefined;
  try {
    db = new (driver())(path, { readOnly: true });
    return (db.prepare('SELECT id FROM records').all() as unknown as { id: string }[]).map(row => row.id);
  } catch {
    return [];
  } finally {
    try { db?.close(); } catch { /* best-effort */ }
  }
}
