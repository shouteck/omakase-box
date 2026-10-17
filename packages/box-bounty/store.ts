// The bounty-record store (BT31): records live in one SQLite database per
// checkout at `.box/local/box.db`, not one JSON file per bounty. Every
// command used to read every record file (`listRecords` scanned
// `.box/bounties/*.json`); the store answers the same questions from
// indexed columns and an FTS5 table instead — or, on a Node whose SQLite
// lacks FTS5, a lower-cased search_text column (BT31-ci). The `json` column holds
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
import type { DatabaseSync,StatementSync } from 'node:sqlite';
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
function openDb(repoRoot: string): { readonly db: DatabaseSync; readonly fts: boolean } {
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
      const fts = setUp(db);
      return { db, fts };
    } catch (error) {
      try { db?.close(); } catch { /* never opened */ }
      if (!isLocked(error) || Date.now() >= deadline) throw error;
      sleep(50);
    }
  }
}

// Whether the running SQLite has FTS5 depends on how this Node was built —
// Node 22.13.0's bundled SQLite lacks it, Node 24's has it, and distribution
// builds against a system SQLite vary (BT31-ci). Asked once per open; a
// failing query reads as no. BOX_BOUNTY_TEST_NO_FTS5=1 is TEST-ONLY: the
// bt31-ci tests set it to drive the plain-search path on a Node that has
// FTS5. Nothing else sets or documents it.
const fts5Available = (db: DatabaseSync): boolean => {
  if (process.env.BOX_BOUNTY_TEST_NO_FTS5 === '1') return false;
  try {
    return (db.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS fts5").get() as { fts5: number }).fts5 === 1;
  } catch {
    return false;
  }
};

const FTS_DDL = 'CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(id UNINDEXED, title, why, part_of, task, note)';

// The searchable fields, one place for the FTS row and the plain column.
interface SearchFields { readonly title: string; readonly why: string; readonly partOf: string; readonly task: string; readonly note: string }
const searchFields = (record: BountyRecord): SearchFields => ({
  title: typeof record.title === 'string' ? record.title : '',
  why: record.why ?? '',
  partOf: record.partOf ?? record.job?.file ?? '',
  task: record.content?.task?.text ?? '',
  note: [record.content?.note?.text, record.resume?.kind === 'recorded' ? record.resume.note : null].filter((text): text is string => typeof text === 'string').join('\n')
});
// The plain-search column: the same fields FTS indexes plus the id,
// lower-cased once at write so a search never parses JSON per row.
const searchText = (id: string, fields: SearchFields): string =>
  [id, fields.title, fields.why, fields.partOf, fields.task, fields.note].join('\n').toLowerCase();

// Rows written before the search_text column, or while records_fts could
// not be written: re-derive from the stored JSON (the same bytes upsertRow
// wrote, so the fields are the record's own).
const storedFields = (json: string): SearchFields | null => {
  try { return searchFields(JSON.parse(json) as BountyRecord); } catch { return null; }
};

function setUp(db: DatabaseSync): boolean {
  db.exec('PRAGMA busy_timeout=5000');
  // The fast path for an already-built store: journal_mode=WAL persists in
  // the file and the schema's presence is told by user_version, so a steady-
  // state open sets the per-connection pragmas and goes straight to the
  // compat scan — no DDL round-trips on every command.
  if ((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode !== 'wal') db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA synchronous=NORMAL');
  const fts = fts5Available(db);
  const version = (): number => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version() !== 2) {
    // Version 1 (BT31) had no search_text column and always created
    // records_fts; version 2 keeps search_text on every row and creates
    // records_fts only where FTS5 exists. Locked and re-checked so two
    // first opens never both migrate.
    db.exec('BEGIN IMMEDIATE');
    try {
      if (version() !== 2) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS records(
            id TEXT PRIMARY KEY,
            stage TEXT NOT NULL,
            open INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            ended_at TEXT,
            json TEXT NOT NULL,
            search_text TEXT NOT NULL DEFAULT ''
          );
          CREATE INDEX IF NOT EXISTS records_open_updated ON records(open, updated_at);
          CREATE INDEX IF NOT EXISTS records_open_ended ON records(open, ended_at);
          CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        `);
        const columns = (db.prepare('PRAGMA table_info(records)').all() as unknown as { name: string }[]).map(column => column.name);
        if (!columns.includes('search_text')) {
          db.exec("ALTER TABLE records ADD COLUMN search_text TEXT NOT NULL DEFAULT ''");
          const fill = db.prepare('UPDATE records SET search_text=? WHERE id=?');
          for (const row of db.prepare('SELECT id, json FROM records').all() as unknown as { id: string; json: string }[]) {
            const fields = storedFields(row.json);
            if (fields !== null) fill.run(searchText(row.id, fields), row.id);
          }
        }
        db.exec('PRAGMA user_version=2');
      }
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* nothing open */ }
      throw error;
    }
  }
  if (fts) ensureFts(db);
  return fts;
}

// With FTS5: records_fts must exist and hold every row. A store built on a
// Node without FTS5 has no records_fts, and one written by such a Node
// carries the `fts_stale` marker (it could not keep records_fts in step) —
// either way the table is (re)built from the records here, once.
function ensureFts(db: DatabaseSync): void {
  const need = (): boolean => {
    const state = db.prepare("SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='records_fts') AS has, (SELECT COUNT(*) FROM meta WHERE key='fts_stale') AS stale").get() as { has: number; stale: number };
    return state.has === 0 || state.stale > 0;
  };
  if (!need()) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (need()) {
      db.exec(FTS_DDL);
      db.exec('DELETE FROM records_fts');
      const insert = db.prepare('INSERT INTO records_fts(rowid, id, title, why, part_of, task, note) VALUES(?, ?, ?, ?, ?, ?, ?)');
      for (const row of db.prepare('SELECT rowid, id, json FROM records').all() as unknown as { rowid: number | bigint; id: string; json: string }[]) {
        const fields = storedFields(row.json);
        if (fields !== null) insert.run(row.rowid, row.id, fields.title, fields.why, fields.partOf, fields.task, fields.note);
      }
      db.exec("DELETE FROM meta WHERE key='fts_stale'");
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* nothing open */ }
    throw error;
  }
}

// Does `.box/bounties/` hold a compat file a first open would import?
// One stat + one listing, only asked while no database exists yet.
const legacyFilesWait = (repoRoot: string): boolean => {
  const dir = legacyDir(repoRoot);
  const stat = lstatSync(dir, { throwIfNoEntry: false });
  return stat !== undefined && !stat.isSymbolicLink() && stat.isDirectory()
    && readdirSync(dir).some(entry => entry.endsWith('.json'));
};

// One open connection per checkout, cached with its prepared statements
// and compat-scan state. Per-operation open+close cost ~10 ms apiece
// (four pragmas, a compat scan and a marker write on every read) — a
// long-lived host (the test runner, a hook host, an embedding agent)
// holds the entry until closeStores releases it, which the test helpers
// call before any folder removal so Windows never keeps an open WAL
// handle. The cache validates the database file still sits where it was
// opened (ino/birthtime) before handing the connection out, so a checkout
// deleted and recreated underneath drops the stale entry instead of
// writing into an unlinked file.
// Reads never create the database: with no database and no compat files
// waiting there is nothing to answer with, and a command that only reads
// leaves no .box/local behind. Writes always open for real.
interface StoreEntry {
  readonly db: DatabaseSync;
  /** This connection's SQLite has FTS5 (fts5Available at open). Without it
      records_fts is never touched — search runs over search_text. */
  readonly fts: boolean;
  /** A no-FTS connection marked `fts_stale` once already this open. */
  staleMarked: boolean;
  readonly stmts: Map<string, StatementSync>;
  /** row.json strings already proven valid (or not) through asRecord —
      rows only ever enter `records` post-validation, so a known-valid
      string needs JSON.parse, not the validator, on each read. The value is
      the VALIDATED record — asRecord rewrites migrated fields (retired
      command names in stored text), so the raw parse is never handed out. */
  readonly validJson: Map<string, BountyRecord | null>;
  /** id -> last-parsed record and the exact json string it came from.
      Readers get a shallow clone (events copied — callers append to it),
      so a caller mutating its copy never rewrites what other readers see.
      Entries are always asRecord-validated: reads go through
      canonicalRecord, writes validate only when `github` is present —
      the retired-command scrubs live entirely under it. */
  readonly records: Map<string, { readonly json: string; readonly record: BountyRecord }>;
  /** Bumped by every local write; paired with PRAGMA data_version (which
      moves on OTHER connections' commits) it lets listOpen reuse its
      parsed list while any change — ours or another process's — busts it. */
  epoch: number;
  /** true when the compat scan just ran found no legacy files and no
      markers — writeStored can then skip its per-write file stat. */
  legacyClear: boolean;
  /** PRAGMA data_version at the last check — it moves when ANOTHER
      connection commits, so a change means every cached record could be
      stale (records entries are re-verified per-row only when their json
      is fetched, so the cheap id-only rebuilds must drop the map). */
  dataVersion: number;
  openList?: { readonly epoch: number; readonly list: readonly BountyRecord[] } | undefined;
  /** false once a compat scan proved no file_sha/file_sig/corrupt_file
      markers and no legacy dir existed — then the next scan costs one
      lstat and zero queries. */
  hasFileMarkers: boolean;
  readonly ino: number | bigint;
  readonly birthtimeMs: number;
  /** Date.now() of the last "the db file still sits where it was opened"
      re-check — throttled, since an open WAL cannot be unlinked out from
      under us on Windows and every test-removal path closes stores first. */
  statCheckedAt: number;
}

const stores = new Map<string, StoreEntry>();

const stmt = (entry: StoreEntry, sql: string): StatementSync => {
  let cached = entry.stmts.get(sql);
  if (cached === undefined) {
    cached = entry.db.prepare(sql);
    entry.stmts.set(sql, cached);
  }
  return cached;
};

function acquire(repoRoot: string, write: boolean): StoreEntry | undefined {
  const path = storeDbPath(repoRoot);
  let entry = stores.get(repoRoot);
  if (entry !== undefined && write) {
    // Re-stat at most every 250 ms, on writes only: a deleted/recreated
    // checkout drops the stale entry instead of writing into an unlinked
    // file. Reads never restat — a live handle cannot be unlinked under us
    // on Windows, and every test-removal path closes stores first; the
    // compat scan below still runs on every operation.
    const now = Date.now();
    if (now - entry.statCheckedAt >= 250) {
      entry.statCheckedAt = now;
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (stat === undefined || !stat.isFile() || stat.ino !== entry.ino || stat.birthtimeMs !== entry.birthtimeMs) {
        try { entry.db.close(); } catch { /* already closed */ }
        stores.delete(repoRoot);
        entry = undefined;
      }
    }
  }
  if (entry === undefined) {
    if (!write && !existsSync(path) && !legacyFilesWait(repoRoot)) return undefined;
    const { db, fts } = openDb(repoRoot);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    entry = {
      db, fts, staleMarked: false, stmts: new Map(), validJson: new Map(), records: new Map(), hasFileMarkers: true, epoch: 0, dataVersion: -1, legacyClear: false,
      ino: stat?.ino ?? 0, birthtimeMs: stat?.birthtimeMs ?? 0, statCheckedAt: Date.now()
    };
    stores.set(repoRoot, entry);
    // The one-time marker: once the first scan ran, .box/bounties/ is a
    // compat input, not the place records live.
    stmt(entry, "INSERT INTO meta(key, value) VALUES('imported_from_json', '1') ON CONFLICT(key) DO NOTHING").run();
  }
  // The compat scan runs on every operation — a file planted mid-process
  // by an older tool (or a fixture) is imported before the answer is read.
  // In steady state it is one lstat and zero queries.
  syncJsonFiles(entry, repoRoot);
  return entry;
}

function withDb<T>(repoRoot: string, write: boolean, run: (entry: StoreEntry | undefined) => T): T {
  return run(acquire(repoRoot, write));
}

// Release the cached connections — the test helpers call this before any
// checkout folder is removed (Windows refuses to delete an open WAL).
export function closeStores(repoRoot?: string): void {
  if (repoRoot !== undefined) {
    const entry = stores.get(repoRoot);
    if (entry !== undefined) {
      try { entry.db.close(); } catch { /* already closed */ }
      stores.delete(repoRoot);
    }
    return;
  }
  for (const entry of stores.values()) {
    try { entry.db.close(); } catch { /* already closed */ }
  }
  stores.clear();
}

// One-shot commands never call closeStores — closing on exit checkpoints
// and removes the -wal/-shm files instead of leaving them behind.
process.once('exit', () => closeStores());

interface FileMeta { readonly sha: string | null; readonly sig: string | null; readonly corrupt: boolean }

// Read every file_sha/corrupt_file marker once; the sync below walks files
// by name and purges markers whose file vanished.
function fileMarkers(entry: StoreEntry): Map<string, FileMeta> {
  const markers = new Map<string, FileMeta>();
  const rows = stmt(entry, "SELECT key, value FROM meta WHERE key GLOB 'file_sha:*' OR key GLOB 'file_sig:*' OR key GLOB 'corrupt_file:*'").all() as unknown as { key: string; value: string }[];
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

const deleteRow = (entry: StoreEntry, id: string): void => {
  // The FTS row is keyed on the records rowid — `WHERE id=?` would scan
  // the whole FTS table (id is UNINDEXED there): O(records) per write.
  const row = stmt(entry, 'SELECT rowid FROM records WHERE id=?').get(id) as { rowid: number | bigint } | undefined;
  stmt(entry, 'DELETE FROM records WHERE id=?').run(id);
  if (row !== undefined) {
    if (entry.fts) stmt(entry, 'DELETE FROM records_fts WHERE rowid=?').run(row.rowid);
    else markFtsStale(entry);
  }
  entry.records.delete(id);
  entry.epoch++;
};

// A connection without FTS5 never writes records_fts (it cannot), so a row
// it changes leaves that table behind; the marker tells the next FTS5 open
// to rebuild it (ensureFts). Once per connection.
const markFtsStale = (entry: StoreEntry): void => {
  if (entry.staleMarked) return;
  stmt(entry, "INSERT INTO meta(key, value) VALUES('fts_stale', '1') ON CONFLICT(key) DO NOTHING").run();
  entry.staleMarked = true;
};

const upsertRow = (entry: StoreEntry, record: BountyRecord): void => {
  const last = record.events.at(-1)?.at ?? record.createdAt;
  const ended = openStage(record.stage) ? null : last;
  const json = JSON.stringify(record, null, 2) + '\n';
  const fields = searchFields(record);
  const row = stmt(entry, 'INSERT INTO records(id, stage, open, created_at, updated_at, ended_at, json, search_text) VALUES(?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, open=excluded.open, updated_at=excluded.updated_at, ended_at=excluded.ended_at, json=excluded.json, search_text=excluded.search_text RETURNING rowid')
    .get(record.id, record.stage, openStage(record.stage) ? 1 : 0, record.createdAt, last, ended, json, searchText(record.id, fields)) as { rowid: number | bigint };
  // A records row keeps its rowid across ON CONFLICT updates, so REPLACE
  // on rowid swaps the FTS content in one indexed write — skipped when a
  // milestone moved only stage/events and the searchable text is the
  // cached record's verbatim.
  const prev = entry.records.get(record.id);
  const before = prev === undefined ? undefined : searchFields(prev.record);
  if (!entry.fts) {
    markFtsStale(entry);
  } else if (before === undefined || before.title !== fields.title || before.why !== fields.why || before.partOf !== fields.partOf || before.task !== fields.task || before.note !== fields.note) {
    stmt(entry, 'INSERT OR REPLACE INTO records_fts(rowid, id, title, why, part_of, task, note) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .run(row.rowid, record.id, fields.title, fields.why, fields.partOf, fields.task, fields.note);
  }
  // Cache what a fresh read would return: asRecord's in-place migrations
  // (retired command names in stored text) all live under `github`, so a
  // github-free clone is already canonical. Clone either way — a caller
  // mutating its own reference after the write must not move the cache.
  const canonical = record.github === undefined ? cloneRecord(record) : (validate(cloneRecord(record)) ?? cloneRecord(record));
  entry.records.set(record.id, { json, record: canonical });
  entry.epoch++;
};

// Import what `.box/bounties/*.json` carries that the database has not
// already seen — fingerprinted by sha256. Every store operation runs this,
// so the steady-state scan must be cheap: a file whose recorded
// size:mtime signature still matches is skipped without a read (the sha is
// still authoritative — a changed signature costs one read+hash, and a
// rewrite that lands on the same bytes just refreshes the signature).
// Without it, a command that writes once per record re-reads the whole
// compat folder per write — O(records × files).
function syncJsonFiles(entry: StoreEntry, repoRoot: string): void {
  const dir = legacyDir(repoRoot);
  entry.legacyClear = false;
  // Steady state — no compat directory and nothing tracked from one: one
  // lstat, zero queries. Checkouts that never had .box/bounties/ (and the
  // benchmark's) stay here forever.
  const stat = lstatSync(dir, { throwIfNoEntry: false });
  if ((stat === undefined || stat.isSymbolicLink() || !stat.isDirectory()) && !entry.hasFileMarkers) {
    entry.legacyClear = true;
    return;
  }
  const present = new Map<string, string>();
  if (stat !== undefined && !stat.isSymbolicLink() && stat.isDirectory()) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const fileStat = lstatSync(join(dir, name), { throwIfNoEntry: false });
      if (fileStat === undefined) continue;
      present.set(name, `${fileStat.size}:${fileStat.mtimeMs}`);
    }
  }
  // An empty compat dir with no tracked markers needs no queries at all.
  if (present.size === 0 && !entry.hasFileMarkers) {
    entry.legacyClear = true;
    return;
  }
  const markers = fileMarkers(entry);
  for (const name of markers.keys()) {
    if (present.has(name)) continue;
    // The file this marker tracked is gone: the record it described is
    // gone too — the file was the compat source for that row.
    deleteRow(entry, name.slice(0, -'.json'.length));
    stmt(entry, "DELETE FROM meta WHERE key IN ('file_sha:' || ?, 'file_sig:' || ?, 'corrupt_file:' || ?)").run(name, name, name);
    markers.delete(name);
  }
  const setMeta = stmt(entry, "INSERT INTO meta(key, value) VALUES(? || ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  for (const [name, sig] of present) {
    if (markers.get(name)?.sig === sig) continue;
    let bytes: Buffer;
    try { bytes = readFileSync(join(dir, name)); } catch { continue; }
    const sha = sha256(bytes);
    if (markers.get(name)?.sha === sha) {
      // Same bytes, new timestamps — remember the signature and move on.
      setMeta.run('file_sig:', name, sig);
      markers.set(name, { sha, sig, corrupt: markers.get(name)?.corrupt ?? false });
      continue;
    }
    const id = name.slice(0, -'.json'.length);
    let record: BountyRecord | null = null;
    try { record = validate(JSON.parse(bytes.toString('utf8'))); } catch { record = null; }
    refreshDataVersion(entry);
    if (record === null) {
      deleteRow(entry, id);
      setMeta.run('corrupt_file:', name, sha);
    } else {
      upsertRow(entry, record);
      stmt(entry, "DELETE FROM meta WHERE key='corrupt_file:' || ?").run(name);
    }
    setMeta.run('file_sha:', name, sha);
    setMeta.run('file_sig:', name, sig);
    markers.set(name, { sha, sig, corrupt: record === null });
  }
  entry.hasFileMarkers = markers.size > 0;
}

// Rows only enter `records` post-validation, so a json string already seen
// valid needs JSON.parse, not the validator's regexes — and an unchanged
// row needs no parse at all: the entry keeps the last parsed record keyed
// by the exact stored string. Callers get a shallow clone with a fresh
// events array (transitionTo pushes onto it before persisting), never a
// shared reference a mutation could leak through the cache.
const canonicalRecord = (entry: StoreEntry, id: string, json: string): BountyRecord | null => {
  const cached = entry.records.get(id);
  if (cached !== undefined && cached.json === json) return cached.record;
  let record = entry.validJson.get(json);
  if (record === undefined) {
    try { record = validate(JSON.parse(json)); } catch { record = null; }
    if (entry.validJson.size > 65536) entry.validJson.clear();
    entry.validJson.set(json, record);
  }
  if (record === null) return null;
  entry.records.set(id, { json, record });
  return record;
};

const cloneRecord = (record: BountyRecord): BountyRecord => ({ ...record, events: [...record.events] });
const rowToRecord = (entry: StoreEntry, id: string, json: string): BountyRecord | null => {
  const record = canonicalRecord(entry, id, json);
  return record === null ? null : cloneRecord(record);
};

export interface StoredRead {
  readonly record: BountyRecord | null;
  /** 'missing' — nothing named id; 'corrupt' — a compat file marker says
      the bytes under that id are not a record; 'ok' — a validated record. */
  readonly state: 'ok' | 'corrupt' | 'missing';
}

export function readStored(repoRoot: string, id: string): StoredRead {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return { record: null, state: 'missing' } as StoredRead;
    // A data_version-verified cache hit answers without touching the row —
    // the pragma is a cheaper round trip than SELECT json and the json-compare.
    refreshDataVersion(entry);
    const hit = entry.records.get(id);
    if (hit !== undefined) return { record: cloneRecord(hit.record), state: 'ok' };
    const row = stmt(entry, 'SELECT json FROM records WHERE id=?').get(id) as { json: string } | undefined;
    if (row !== undefined) {
      const record = rowToRecord(entry, id, row.json);
      return { record, state: record === null ? 'corrupt' : 'ok' };
    }
    const corrupt = stmt(entry, "SELECT value FROM meta WHERE key='corrupt_file:' || ?").get(`${id}.json`) as { value: string } | undefined;
    return { record: null, state: corrupt === undefined ? 'missing' : 'corrupt' };
  });
}

export function recordExists(repoRoot: string, id: string): boolean {
  return readStored(repoRoot, id).state !== 'missing';
}

export function recordIds(repoRoot: string): string[] {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return [];
    const ids = new Set<string>((stmt(entry, 'SELECT id FROM records').all() as unknown as { id: string }[]).map(row => row.id));
    for (const row of stmt(entry, "SELECT key FROM meta WHERE key GLOB 'corrupt_file:*'").all() as unknown as { key: string }[]) {
      ids.add(row.key.slice('corrupt_file:'.length, -'.json'.length));
    }
    return [...ids].sort();
  });
}

// One entry per record the way the file scan reported it — corrupt compat
// files list as { record: null, file } so status names them. Sorted by
// createdAt (filename for entries without a record), as listRecords did.
export function allRecords(repoRoot: string): ListedBounty[] {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return [];
    const listed: ListedBounty[] = [];
    for (const row of stmt(entry, 'SELECT id, json FROM records').all() as unknown as { id: string; json: string }[]) {
      listed.push({ record: rowToRecord(entry, row.id, row.json), file: `${row.id}.json` });
    }
    for (const row of stmt(entry, "SELECT key FROM meta WHERE key GLOB 'corrupt_file:*'").all() as unknown as { key: string }[]) {
      listed.push({ record: null, file: row.key.slice('corrupt_file:'.length) });
    }
    listed.sort((a, b) => (a.record?.createdAt ?? a.file).localeCompare(b.record?.createdAt ?? b.file));
    return listed;
  });
}

const dataVersion = (entry: StoreEntry): number =>
  (stmt(entry, 'PRAGMA data_version').get() as { data_version: number }).data_version;

// Another connection's commits move data_version. Only callers that trust
// the records map without re-fetching a row's json pay for the check —
// listOpen's id-only rebuild and upsertRow's FTS-skip compare; reads that
// fetch json anyway re-verify per row in canonicalRecord.
const refreshDataVersion = (entry: StoreEntry): void => {
  const dv = dataVersion(entry);
  if (entry.dataVersion !== dv) {
    entry.dataVersion = dv;
    entry.records.clear();
    entry.openList = undefined;
  }
};

// While data_version stands still no other connection has committed, so a
// records entry is known-current — the open list rebuilds from ids alone
// and reaches for a row's json only on a cache miss.
export function listOpen(repoRoot: string): BountyRecord[] {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return [];
    refreshDataVersion(entry);
    if (entry.openList !== undefined && entry.openList.epoch === entry.epoch) {
      return entry.openList.list.map(cloneRecord);
    }
    const list: BountyRecord[] = [];
    for (const { id } of stmt(entry, 'SELECT id FROM records WHERE open=1 ORDER BY created_at, id').all() as unknown as { id: string }[]) {
      const hit = entry.records.get(id);
      if (hit !== undefined) { list.push(hit.record); continue; }
      const row = stmt(entry, 'SELECT json FROM records WHERE id=?').get(id) as { json: string } | undefined;
      if (row === undefined) continue;
      const record = canonicalRecord(entry, id, row.json);
      if (record !== null) list.push(record);
    }
    entry.openList = { epoch: entry.epoch, list };
    return list.map(cloneRecord);
  });
}

export function listEndedRecent(repoRoot: string, limit?: number): BountyRecord[] {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return [];
    const sql = `SELECT id, json FROM records WHERE open=0 ORDER BY ended_at DESC, id DESC${limit === undefined ? '' : ' LIMIT ?'}`;
    const rows = (limit === undefined ? stmt(entry, sql).all() : stmt(entry, sql).all(limit)) as unknown as { id: string; json: string }[];
    return rows.map(row => rowToRecord(entry, row.id, row.json)).filter((record): record is BountyRecord => record !== null);
  });
}

export function countEnded(repoRoot: string): number {
  return withDb(repoRoot, false, entry => entry === undefined ? 0
    : (stmt(entry, 'SELECT COUNT(*) AS n FROM records WHERE open=0').get() as { n: number }).n);
}

// Compat files that failed validation — the count status and the hook name
// without materialising entries.
export function countCorrupt(repoRoot: string): number {
  return withDb(repoRoot, false, entry => entry === undefined ? 0
    : (stmt(entry, "SELECT COUNT(*) AS n FROM meta WHERE key GLOB 'corrupt_file:*'").get() as { n: number }).n);
}

// The corrupt files' names — status prints each as `! <file>`, so the
// bounded overview needs the names without the records table.
export function corruptFiles(repoRoot: string): string[] {
  return withDb(repoRoot, false, entry => entry === undefined ? []
    : (stmt(entry, "SELECT key FROM meta WHERE key GLOB 'corrupt_file:*'").all() as unknown as { key: string }[])
      .map(row => row.key.slice('corrupt_file:'.length)).sort());
}

// Ended records whose stored JSON contains a fixed substring — how the
// bounded overview finds an ended bounty still carrying `pending` work, or
// one whose applied merge a first-merge notice names, without parsing every
// ended record.
export function endedContaining(repoRoot: string, substring: string): BountyRecord[] {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return [];
    const like = `%${substring.split(BS).join(BS + BS).replaceAll('%', BS + '%').replaceAll('_', BS + '_')}%`;
    return (stmt(entry, `SELECT id, json FROM records WHERE open=0 AND json LIKE ? ESCAPE '${BS}'`).all(like) as unknown as { id: string; json: string }[])
      .map(row => rowToRecord(entry, row.id, row.json)).filter((record): record is BountyRecord => record !== null);
  });
}

// The record's stored bytes, re-rendered the way the file used to read:
// pretty JSON plus a trailing newline. Null when the store holds nothing.
export function storedRaw(repoRoot: string, id: string): string | null {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return null;
    const row = stmt(entry, 'SELECT json FROM records WHERE id=?').get(id) as { json: string } | undefined;
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
  withDb(repoRoot, true, entry => {
    refreshDataVersion(entry!);
    entry!.db.exec('BEGIN IMMEDIATE');
    try {
      upsertRow(entry!, record);
      // The compat stamp exists for a sibling JSON file still on disk —
      // this acquire's scan already proved none is there, so a clean
      // checkout skips the stat and both meta writes entirely.
      if (!entry!.legacyClear) {
        const name = `${record.id}.json`;
        const file = join(legacyDir(repoRoot), name);
        const bytes = existsSync(file) ? readFileSync(file) : null;
        if (bytes !== null) {
          stmt(entry!, "INSERT INTO meta(key, value) VALUES('file_sha:' || ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(name, sha256(bytes));
          entry!.hasFileMarkers = true;
        }
        stmt(entry!, "DELETE FROM meta WHERE key='corrupt_file:' || ?").run(name);
      }
      entry!.db.exec('COMMIT');
    } catch (error) {
      entry!.db.exec('ROLLBACK');
      // The write never landed — cached records and the open list could
      // repeat it, so both are dropped rather than audited per row.
      entry!.records.clear();
      entry!.openList = undefined;
      throw error;
    }
  });
}

// Many-record insert in one transaction — the benchmark's seed and any
// bulk import; per-record writeStored would pay a commit apiece.
export function seedStored(repoRoot: string, records: readonly BountyRecord[]): void {
  withDb(repoRoot, true, entry => {
    refreshDataVersion(entry!);
    entry!.db.exec('BEGIN IMMEDIATE');
    try {
      for (const record of records) upsertRow(entry!, record);
      entry!.db.exec('COMMIT');
    } catch (error) {
      entry!.db.exec('ROLLBACK');
      entry!.records.clear();
      entry!.openList = undefined;
      throw error;
    }
  });
}

// Drop a record everywhere it exists: the row, its FTS entry, the compat
// fingerprints and the JSON file itself if one still sits there.
export function dropStored(repoRoot: string, id: string): void {
  withDb(repoRoot, true, entry => {
    const name = `${id}.json`;
    deleteRow(entry!, id);
    stmt(entry!, "DELETE FROM meta WHERE key IN ('file_sha:' || ?, 'file_sig:' || ?, 'corrupt_file:' || ?)").run(name, name, name);
    rmSync(join(legacyDir(repoRoot), name), { force: true });
  });
}

// Test-support seam: a fixture rewrote `.box/bounties/<entry>` on disk —
// drop the fingerprint so the next read reimports it through asRecord.
export function forgetFileSha(repoRoot: string, name: string): void {
  if (!existsSync(storeDbPath(repoRoot))) return;
  withDb(repoRoot, false, entry => {
    stmt(entry!, "DELETE FROM meta WHERE key IN ('file_sha:' || ?, 'file_sig:' || ?, 'corrupt_file:' || ?)").run(name, name, name);
    entry!.hasFileMarkers = true;
  });
}

// Without FTS5 on this connection: plainSearch, for every needle. With it:
// FTS5 match for needles of three characters or more — substring
// semantics, case-folded — and a plain case-folded substring scan over the
// stored JSON for shorter needles, where trigrams cannot index. Results
// come back as full records; callers re-derive matched fields.
export function searchRecords(repoRoot: string, needle: string, limit?: number): BountyRecord[] {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return [];
    if (!entry.fts) return plainSearch(entry, needle, limit).map(row => rowToRecord(entry, row.id, row.json)).filter((record): record is BountyRecord => record !== null);
    if (needle.length >= 3) {
      // id is UNINDEXED in the FTS table — matching is still whole-record,
      // so an id fragment finds its record through a substring probe over
      // the id column alone (short strings only, json fetched for hits by
      // primary key). Skipped for needles holding whitespace: a bounty id
      // is a slug and can never contain one.
      const idHits = /\s/.test(needle) ? [] : (stmt(entry, 'SELECT id FROM records WHERE instr(lower(id), lower(?))').all(needle) as unknown as { id: string }[])
        .map(row => stmt(entry, 'SELECT id, json FROM records WHERE id=?').get(row.id) as { id: string; json: string } | undefined)
        .filter((row): row is { id: string; json: string } => row !== undefined);
      // A multi-word needle is not one adjacent phrase — its words usually
      // live in different columns (find's callers re-filter for the exact
      // substring either way). Every whitespace-separated token long
      // enough to index becomes a quoted term ANDed together; anything
      // shorter (or one word) keeps exact-phrase semantics.
      const tokens = needle.split(/\s+/).filter(word => word.length >= 3);
      const match = tokens.length > 1
        ? tokens.map(word => `"${word.replaceAll('"', '""')}"`).join(' AND ')
        : `"${needle.replaceAll('"', '""')}"`;
      const ftsSql = `SELECT r.id AS id, r.json AS json FROM records_fts JOIN records r ON r.id = records_fts.id WHERE records_fts MATCH ?${limit === undefined ? '' : ' LIMIT ?'}`;
      let rows: { id: string; json: string }[];
      try {
        rows = ((limit === undefined ? stmt(entry, ftsSql).all(match) : stmt(entry, ftsSql).all(match, limit)) as unknown as { id: string; json: string }[])
          .concat(idHits);
      } catch {
        rows = idHits;
      }
      // An FTS query that found nothing can still miss a needle it could
      // not index (mid-word substrings, rare byte patterns) — the LIKE
      // scan settles zero-match and odd-needle queries exactly, at the old
      // file-scan price.
      if (rows.length === 0) rows = likeScan(entry, needle, limit);
      const seen = new Set<string>();
      return rows.filter(row => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      }).map(row => rowToRecord(entry, row.id, row.json)).filter((record): record is BountyRecord => record !== null);
    }
    const seen = new Set<string>();
    return likeScan(entry, needle, limit).filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }).map(row => rowToRecord(entry, row.id, row.json)).filter((record): record is BountyRecord => record !== null);
  });
}

// Search without FTS5 (BT31-ci): every whitespace-separated word of the
// needle must occur, case-folded, in the row's search_text — the id and the
// fields FTS indexes, never the JSON. Words are bound parameters only. Rows
// come in rowid order, the order an FTS5 MATCH returns them; find then
// re-filters by the exact needle per field and puts open work first, ended
// most recent first — so find answers the same on both paths.
function plainSearch(entry: StoreEntry, needle: string, limit?: number): { id: string; json: string }[] {
  const words = needle.toLowerCase().split(/\s+/).filter(word => word !== '');
  if (words.length === 0) return [];
  const sql = `SELECT id, json FROM records WHERE ${words.map(() => 'instr(search_text, ?) > 0').join(' AND ')} ORDER BY rowid${limit === undefined ? '' : ' LIMIT ?'}`;
  return (limit === undefined ? stmt(entry, sql).all(...words) : stmt(entry, sql).all(...words, limit)) as unknown as { id: string; json: string }[];
}

const BS = String.fromCharCode(92);
function likeScan(entry: StoreEntry, needle: string, limit?: number): { id: string; json: string }[] {
  const like = `%${needle.split(BS).join(BS + BS).replaceAll('%', BS + '%').replaceAll('_', BS + '_')}%`;
  const sql = `SELECT id, json FROM records WHERE lower(json) LIKE ? ESCAPE '${BS}'${limit === undefined ? '' : ' LIMIT ?'}`;
  return (limit === undefined ? stmt(entry, sql).all(like) : stmt(entry, sql).all(like, limit)) as unknown as { id: string; json: string }[];
}

// Does any stored record's JSON carry this exact substring — for checks
// that ask "does some record record X" without reading every record.
export function anyJsonContaining(repoRoot: string, substring: string): boolean {
  return withDb(repoRoot, false, entry => {
    if (entry === undefined) return false;
    const like = `%${substring.split(BS).join(BS + BS).replaceAll('%', BS + '%').replaceAll('_', BS + '_')}%`;
    return (stmt(entry, `SELECT EXISTS(SELECT 1 FROM records WHERE json LIKE ? ESCAPE '${BS}') AS n`).get(like) as { n: number }).n === 1;
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
