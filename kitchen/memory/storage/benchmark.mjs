// K27 storage benchmark — local store engines for the bounty tool's memory.
//
// Compares three candidate engines for the machine-local + project-agents
// store on identical synthetic records and identical operations (the seven
// operations of waves/K27.md Step 1):
//
//   1. listOpen            — every open bounty, one line each
//   2. boundedOverview     — open list + ended count + 5 most recent ended
//   3. find                — purpose search over title/why/partOf/task/note
//   4. readOne             — one full record by id
//   5. writeAtMilestone    — stage transition + event append, persisted
//   6. hookStart           — the hook's one-line-per-open-id output
//   7. instructionBlockSync— regenerate + write the AGENTS.md block
//
// plus open time, on-disk size, two-process concurrent writes (different
// bounties, then the same bounty) and recovery after a kill mid-write.
//
// Engines:
//   node-sqlite   node:sqlite DatabaseSync, WAL, FTS5 virtual table
//   sqljs         sql.js (SQLite→WASM), same schema, export() after each write
//   json-indexed  index.json + append-only sharded JSONL (no per-bounty files,
//                 so N=100,000 does not create 100,000 NTFS files)
//
// Usage:
//   node kitchen/memory/storage/benchmark.mjs [--engine <node-sqlite|sqljs|json-indexed|all>] [--n <1000|10000|100000|all>] [--out <dir>]
//
// Defaults: --engine all --n all. Without --out everything runs inside a
// mkdtempSync(join(tmpdir(), 'kitchen-K27-')) scratch root removed in a
// finally. With --out the directory is reused and kept; it must be empty or
// carry our .k27-storage-owned marker — a foreign non-empty directory is
// refused with exit 1 (ownership-marker guard, kitchen/roles/worker.md).
//
// sql.js is not a repository dependency. When --engine sqljs|all is chosen
// and sql.js is not already inside the scratch root, this script installs it
// there with `npm install --ignore-scripts` (scratch prefix only, never the
// repository) so a clean checkout can rerun `--engine sqljs` directly.
//
// Rerun examples (from a clean checkout):
//   node kitchen/memory/storage/benchmark.mjs --engine node-sqlite --n 10000
//   node kitchen/memory/storage/benchmark.mjs --engine sqljs --n 10000

import { spawnSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const MARKER = '.k27-storage-owned';
const SQLJS_PREFIX_DIR = 'sqljs-prefix';
const SHARD_SIZE = 512;

const OPEN_STAGES = new Set(['drafted', 'confirmed', 'posted', 'answered']);
const isOpen = (stage) => OPEN_STAGES.has(stage);

// ---------- argument parsing ----------

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

// Internal child modes used by the concurrency/crash tests. Not part of the
// documented CLI: `--child-writer <engine> <dir> <shared> <kind> <count>`
// and `--child-victim <engine> <dir>`.
const childWriter = args[0] === '--child-writer';
const childVictim = args[0] === '--child-victim';

const ENGINE = arg('--engine') ?? 'all';
const NSEL = arg('--n') ?? 'all';
const OUT = arg('--out');
const ENGINES = ENGINE === 'all' ? ['node-sqlite', 'sqljs', 'json-indexed'] : [ENGINE];
const NS = NSEL === 'all' ? [1000, 10000, 100000] : [Number(NSEL)];
for (const e of ENGINES) if (!['node-sqlite', 'sqljs', 'json-indexed'].includes(e)) throw new Error(`no such engine: ${e}`);
for (const n of NS) if (!Number.isInteger(n) || n < 1) throw new Error(`bad --n: ${NSEL}`);

// ---------- scratch root with ownership-marker guard ----------

function prepareRoot() {
  if (OUT === undefined) {
    return { root: mkdtempSync(join(tmpdir(), 'kitchen-K27-')), owned: true, cleanup: true };
  }
  if (existsSync(OUT)) {
    const entries = readdirSync(OUT);
    if (entries.length > 0 && !entries.includes(MARKER)) {
      console.error(`refusing: --out ${OUT} exists, is non-empty and has no ${MARKER} marker`);
      process.exit(1);
    }
  } else {
    mkdirSync(OUT, { recursive: true });
  }
  if (!existsSync(join(OUT, MARKER))) writeFileSync(join(OUT, MARKER), `created by kitchen/memory/storage/benchmark.mjs at ${new Date().toISOString()}\n`);
  return { root: OUT, owned: true, cleanup: false };
}

// ---------- synthetic records (same shape as kitchen/memory/measure.mjs) ----------

const RESUME_NOTE = 'Resume the parser refactor on this branch: the tokeniser is split, the tree builder still reads the old stream shape, and the failing case is the nested-comment fixture the bounty was opened to finish.';
const TASK_TEXT = 'Finish the nested-comment fixture in the parser: the tree builder must accept the new token stream, keep the existing public shape, and leave the flat-comment fixtures passing exactly as they do today.';
const NOTE_TEXT = 'Tried splitting the tokeniser first; the recursion case needs the tree builder to consume the new stream, which is design work better handed off than guessed at here.';
const recordId = (i) => `bt-${(i + 1).toString(16).padStart(12, '0')}`;
const recordAt = (i, step = 0) => new Date(Date.parse('2026-01-05T09:00:00Z') + i * 86400000 + step * 3600000).toISOString();

const ENDED = ['applied', 'rejected'];
function makeRecord(i, openCount) {
  const open = i < openCount;
  const stage = open ? 'posted' : ENDED[i % 2];
  const record = {
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id: recordId(i),
    title: `Finish the nested-comment fixture, part ${i + 1}`,
    why: 'the recursion case is design work beyond this session',
    partOf: i % 3 === 0 ? 'parser migration' : null,
    noteSource: 'authored',
    resume: { kind: 'recorded', branch: 'main', commit: '0'.repeat(40), changed: ['src/parser/tree.ts', 'src/parser/stream.ts'], note: RESUME_NOTE },
    stage,
    content: { task: { file: 'TASK.md', text: TASK_TEXT }, note: { file: 'NOTE.md', text: NOTE_TEXT }, tool: 'box-bounty' },
    createdAt: recordAt(i, 0),
    endedAt: open ? null : recordAt(i, 3),
    events: [
      { stage: 'drafted', at: recordAt(i, 0), command: 'create' },
      { stage: 'confirmed', at: recordAt(i, 1), command: 'confirm' },
      { stage: 'posted', at: recordAt(i, 2), command: 'post', destination: 'folder' }
    ]
  };
  if (stage === 'applied') record.events.push({ stage: 'applied', at: recordAt(i, 3), command: 'apply', attempt: 1, merge: '0'.repeat(40) });
  if (stage === 'rejected') record.events.push({ stage: 'rejected', at: recordAt(i, 3), command: 'close', reason: 'the fixture was retired upstream' });
  return record;
}

const openCountFor = (n) => Math.max(1, Math.round(n * 0.05)); // ~5% open, rest ended

// ---------- engine implementations ----------

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS bounties(
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  title TEXT NOT NULL,
  why TEXT,
  partOf TEXT,
  createdAt TEXT NOT NULL,
  endedAt TEXT,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bounties_stage ON bounties(stage);
CREATE INDEX IF NOT EXISTS idx_bounties_ended ON bounties(endedAt DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS bounties_fts USING fts5(id UNINDEXED, title, why, partOf, task, note);
`;

const FTS = (r) => [r.id, r.title, r.why ?? '', r.partOf ?? '', r.content?.task?.text ?? '', r.resume?.note ?? ''];

async function openNodeSqlite(dir) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(dir, 'bounties.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(SQLITE_SCHEMA);
  const stmts = {
    ins: db.prepare('INSERT OR REPLACE INTO bounties(id,stage,title,why,partOf,createdAt,endedAt,json) VALUES(?,?,?,?,?,?,?,?)'),
    insFts: db.prepare('INSERT OR REPLACE INTO bounties_fts(id,title,why,partOf,task,note) VALUES(?,?,?,?,?,?)'),
    listOpen: db.prepare("SELECT id,title,stage FROM bounties WHERE stage IN ('drafted','confirmed','posted','answered') ORDER BY createdAt"),
    endedCount: db.prepare("SELECT COUNT(*) c FROM bounties WHERE stage NOT IN ('drafted','confirmed','posted','answered')"),
    recentEnded: db.prepare("SELECT id,title,stage,endedAt FROM bounties WHERE stage NOT IN ('drafted','confirmed','posted','answered') ORDER BY endedAt DESC LIMIT 5"),
    readOne: db.prepare('SELECT json FROM bounties WHERE id = ?'),
    get: db.prepare('SELECT * FROM bounties WHERE id = ?'),
    upd: db.prepare('UPDATE bounties SET stage=?, endedAt=?, json=? WHERE id=?')
  };
  return {
    name: 'node-sqlite',
    seed(records) {
      db.exec('BEGIN');
      for (const r of records) {
        stmts.ins.run(r.id, r.stage, r.title, r.why, r.partOf, r.createdAt, r.endedAt, JSON.stringify(r));
        stmts.insFts.run(...FTS(r));
      }
      db.exec('COMMIT');
    },
    listOpen: () => stmts.listOpen.all(),
    boundedOverview() {
      const open = stmts.listOpen.all();
      const { c } = stmts.endedCount.get();
      const recentEnded = stmts.recentEnded.all();
      return { open, endedCount: c, recentEnded };
    },
    find(query) {
      const match = query.split(/\s+/).map(t => `"${t.replaceAll('"', '')}"`).join(' OR ');
      return db.prepare('SELECT b.id, b.title, b.stage FROM bounties_fts f JOIN bounties b ON b.id = f.id WHERE bounties_fts MATCH ? LIMIT 20').all(match);
    },
    readOne: (id) => { const r = stmts.readOne.get(id); return r === undefined ? undefined : JSON.parse(r.json); },
    writeAtMilestone(id, stage, at) {
      const row = stmts.get.get(id);
      const r = JSON.parse(row.json);
      r.stage = stage;
      r.endedAt = isOpen(stage) ? null : at;
      r.events.push({ stage, at, command: 'benchmark' });
      stmts.upd.run(stage, r.endedAt, JSON.stringify(r), id);
    },
    upsert(r) {
      stmts.ins.run(r.id, r.stage, r.title, r.why, r.partOf, r.createdAt, r.endedAt, JSON.stringify(r));
      stmts.insFts.run(...FTS(r));
    },
    checkpoint: () => db.exec('PRAGMA wal_checkpoint(TRUNCATE);'),
    close: () => db.close()
  };
}

async function openSqljs(dir, prefixDir) {
  const { createRequire } = await import('node:module');
  const req = createRequire(join(prefixDir, 'noop.js'));
  const initSqlJs = req('sql.js');
  const SQL = await initSqlJs({ locateFile: (f) => join(prefixDir, 'node_modules', 'sql.js', 'dist', f) });
  const file = join(dir, 'bounties-sqljs.sqlite');
  const db = existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database();
  let fts5 = true;
  try {
    db.run(SQLITE_SCHEMA);
  } catch (e) {
    // sql.js's default WASM build ships without FTS5 ("no such module: fts5").
    // Fall back to a plain search table + LIKE so the benchmark still measures
    // the real thing you would ship without a custom sql.js build.
    fts5 = false;
    db.run(`
CREATE TABLE IF NOT EXISTS bounties(
  id TEXT PRIMARY KEY, stage TEXT NOT NULL, title TEXT NOT NULL,
  why TEXT, partOf TEXT, createdAt TEXT NOT NULL, endedAt TEXT, json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bounties_stage ON bounties(stage);
CREATE INDEX IF NOT EXISTS idx_bounties_ended ON bounties(endedAt DESC);
CREATE TABLE IF NOT EXISTS bounties_search(id TEXT, hay TEXT);
`);
  }
  const persist = () => { mkdirSync(dir, { recursive: true }); writeFileSync(file, Buffer.from(db.export())); };
  return {
    name: 'sqljs',
    fts5,
    seed(records) {
      db.run('BEGIN');
      const ins = db.prepare('INSERT OR REPLACE INTO bounties VALUES(?,?,?,?,?,?,?,?)');
      const fts = db.prepare(fts5 ? 'INSERT OR REPLACE INTO bounties_fts VALUES(?,?,?,?,?,?)' : 'INSERT INTO bounties_search VALUES(?,?)');
      for (const r of records) {
        ins.run([r.id, r.stage, r.title, r.why, r.partOf, r.createdAt, r.endedAt, JSON.stringify(r)]);
        fts.run(fts5 ? FTS(r) : [r.id, FTS(r).slice(1).join('\n').toLowerCase()]);
      }
      ins.free(); fts.free();
      db.run('COMMIT');
      persist();
    },
    listOpen: () => db.exec("SELECT id,title,stage FROM bounties WHERE stage IN ('drafted','confirmed','posted','answered') ORDER BY createdAt")[0]?.values ?? [],
    boundedOverview() {
      const open = this.listOpen();
      const c = db.exec("SELECT COUNT(*) FROM bounties WHERE stage NOT IN ('drafted','confirmed','posted','answered')")[0].values[0][0];
      const recent = db.exec("SELECT id,title,stage,endedAt FROM bounties WHERE stage NOT IN ('drafted','confirmed','posted','answered') ORDER BY endedAt DESC LIMIT 5")[0]?.values ?? [];
      return { open, endedCount: c, recentEnded: recent };
    },
    find(query) {
      const terms = query.toLowerCase().split(/\s+/);
      const sql = fts5
        ? 'SELECT b.id, b.title, b.stage FROM bounties_fts f JOIN bounties b ON b.id = f.id WHERE bounties_fts MATCH ? LIMIT 20'
        : `SELECT b.id, b.title, b.stage FROM bounties_search s JOIN bounties b ON b.id = s.id WHERE ${terms.map(() => 's.hay LIKE ?').join(' AND ')} LIMIT 20`;
      const st = db.prepare(sql);
      const bind = fts5 ? [terms.map(t => `"${t.replaceAll('"', '')}"`).join(' OR ')] : terms.map(t => `%${t}%`);
      st.bind(bind);
      const out = [];
      while (st.step()) out.push(st.getAsObject());
      st.free();
      return out;
    },
    readOne(id) {
      const st = db.prepare('SELECT json FROM bounties WHERE id = ?');
      st.bind([id]);
      const r = st.step() ? st.getAsObject().json : undefined;
      st.free();
      return r === undefined ? undefined : JSON.parse(r);
    },
    writeAtMilestone(id, stage, at) {
      const st = db.prepare('SELECT json FROM bounties WHERE id = ?');
      st.bind([id]);
      if (!st.step()) { st.free(); return; }
      const r = JSON.parse(st.getAsObject().json);
      st.free();
      r.stage = stage;
      r.endedAt = isOpen(stage) ? null : at;
      r.events.push({ stage, at, command: 'benchmark' });
      db.run('UPDATE bounties SET stage=?, endedAt=?, json=? WHERE id=?', [stage, r.endedAt, JSON.stringify(r), id]);
      persist();
    },
    upsert(r) {
      db.run('INSERT OR REPLACE INTO bounties VALUES(?,?,?,?,?,?,?,?)', [r.id, r.stage, r.title, r.why, r.partOf, r.createdAt, r.endedAt, JSON.stringify(r)]);
      if (fts5) db.run('INSERT OR REPLACE INTO bounties_fts VALUES(?,?,?,?,?,?)', FTS(r));
      else db.run('INSERT INTO bounties_search VALUES(?,?)', [r.id, FTS(r).slice(1).join('\n').toLowerCase()]);
      persist();
    },
    checkpoint: persist,
    close: () => { persist(); db.close(); }
  };
}

function openJsonIndexed(dir) {
  const indexFile = join(dir, 'index.json');
  const shardsDir = join(dir, 'shards');
  mkdirSync(shardsDir, { recursive: true });
  const shardFile = (n) => join(shardsDir, `shard-${String(Math.floor(n / SHARD_SIZE)).padStart(4, '0')}.jsonl`);
  // Load index (id -> {stage,title,why,partOf,createdAt,endedAt,shard}); the
  // index is the best-version-of-today baseline: every read surface answers
  // from it without touching the shards except readOne.
  const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
  // Atomic write (tmp + rename), the same shape the tool's own writer uses —
  // a kill mid-write leaves the *previous* index, not a torn file.
  const persistIndex = () => { const tmp = `${indexFile}.tmp`; writeFileSync(tmp, JSON.stringify(index)); renameSync(tmp, indexFile); };
  return {
    name: 'json-indexed',
    seed(records) {
      // Buffer whole shards so N=100,000 costs ~200 file writes, not 100,000.
      const bufs = new Map();
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const shard = Math.floor(i / SHARD_SIZE);
        bufs.set(shard, (bufs.get(shard) ?? '') + JSON.stringify(r) + '\n');
        index[r.id] = { stage: r.stage, title: r.title, why: r.why, partOf: r.partOf, task: r.content?.task?.text ?? '', note: r.resume?.note ?? '', createdAt: r.createdAt, endedAt: r.endedAt, shard };
      }
      for (const [shard, buf] of bufs) writeFileSync(shardFile(shard * SHARD_SIZE), buf);
      persistIndex();
    },
    listOpen: () => Object.entries(index).filter(([, m]) => isOpen(m.stage)).map(([id, m]) => ({ id, title: m.title, stage: m.stage })),
    boundedOverview() {
      const open = this.listOpen();
      const ended = Object.entries(index).filter(([, m]) => !isOpen(m.stage));
      const recent = ended.sort((a, b) => (b[1].endedAt ?? '').localeCompare(a[1].endedAt ?? '')).slice(0, 5).map(([id, m]) => ({ id, title: m.title, stage: m.stage, endedAt: m.endedAt }));
      return { open, endedCount: ended.length, recentEnded: recent };
    },
    find(query) {
      const terms = query.toLowerCase().split(/\s+/);
      const hits = [];
      for (const [id, m] of Object.entries(index)) {
        const hay = `${m.title}\n${m.why ?? ''}\n${m.partOf ?? ''}\n${m.task}\n${m.note}`.toLowerCase();
        if (terms.every(t => hay.includes(t))) hits.push({ id, title: m.title, stage: m.stage });
        if (hits.length >= 20) break;
      }
      return hits;
    },
    readOne(id) {
      const m = index[id];
      if (m === undefined) return undefined;
      const lines = readFileSync(shardFile(m.shard * SHARD_SIZE), 'utf8').split('\n');
      let found;
      for (const line of lines) {
        if (line === '') continue;
        let r;
        try { r = JSON.parse(line); } catch { continue; } // tolerate a torn tail line after a kill mid-append
        if (r.id === id) found = r; // append-only: last occurrence wins
      }
      return found;
    },
    writeAtMilestone(id, stage, at) {
      const m = index[id];
      const r = this.readOne(id);
      r.stage = stage;
      r.endedAt = isOpen(stage) ? null : at;
      r.events.push({ stage, at, command: 'benchmark' });
      appendFileSync(shardFile(m.shard * SHARD_SIZE), JSON.stringify(r) + '\n');
      m.stage = stage; m.endedAt = r.endedAt;
      persistIndex();
    },
    upsert(r) {
      const shard = Math.floor((r.__seed ?? 0) / SHARD_SIZE);
      const target = index[r.id]?.shard ?? shard;
      appendFileSync(shardFile(target * SHARD_SIZE), JSON.stringify(r) + '\n');
      index[r.id] = { stage: r.stage, title: r.title, why: r.why, partOf: r.partOf, task: r.content?.task?.text ?? '', note: r.resume?.note ?? '', createdAt: r.createdAt, endedAt: r.endedAt, shard: target };
      persistIndex();
    },
    checkpoint() {},
    close: () => persistIndex()
  };
}

// ---------- shared op harness ----------

function timeIt(fn) {
  const t = performance.now();
  const out = fn();
  return { ms: Math.round((performance.now() - t) * 100) / 100, out };
}

function dirSize(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

// The seven benchmark operations against one open store.
function runOps(store, n, openCount, repoDir) {
  const ops = {};
  const midOpenId = recordId(Math.floor(openCount / 2));
  const oneEndedId = recordId(openCount + 5 < n ? openCount + 5 : n - 1);

  ops.listOpen = timeIt(() => store.listOpen().length);
  ops.boundedOverview = timeIt(() => { const o = store.boundedOverview(); return o.open.length + o.endedCount + o.recentEnded.length; });
  ops.find = timeIt(() => store.find('nested-comment tokeniser').length);
  ops.readOne = timeIt(() => store.readOne(oneEndedId)?.id);
  ops.writeAtMilestone = timeIt(() => store.writeAtMilestone(midOpenId, 'applied', recordAt(1, 9)));
  ops.hookStart = timeIt(() => store.listOpen().map(r => `${r.id} ${r.stage}`).join(' ').length);
  ops.instructionBlockSync = timeIt(() => {
    const open = store.listOpen();
    const block = `<!-- box-bounty -->\nbox bounty can hand a task to an outside solver and bring solutions back\nas facts — \`box bounty describe\` says what it does, what it costs and when it\nbeats doing the work yourself. Using it is always your call; the owner's\npermission applies.${open.length > 0 ? `\nopen bounties: ${open.map(r => r.id).join(', ')}` : ''}\n<!-- /box-bounty -->\n`;
    writeFileSync(join(repoDir, 'AGENTS.md'), `# fixture\n\n${block}`);
    return block.length;
  });
  return ops;
}

// ---------- concurrency + crash tests ----------

async function openEngine(engine, dir, root) {
  if (engine === 'sqljs') return openSqljs(dir, join(root, SQLJS_PREFIX_DIR));
  if (engine === 'node-sqlite') return openNodeSqlite(dir);
  if (engine === 'json-indexed') return openJsonIndexed(dir);
  throw new Error(`no engine ${engine}`);
}

function concurrencyTest(engine, dir, root, n, openCount) {
  // Two processes write at once. First to different bounties, then to the
  // same one. Each child writes 25 milestone updates; the parent then reads
  // the result and reports what survived.
  const result = {};
  const targets = { a: recordId(openCount), b: recordId(openCount + 1) };
  const run = (kind) => {
    const ids = kind === 'different' ? [targets.a, targets.b] : [targets.a, targets.a];
    const procs = ids.map(id => spawn(process.execPath, [SELF, '--child-writer', engine, dir, kind, '25', '--shared-id', id, '--root', root], { stdio: ['ignore', 'pipe', 'pipe'] }));
    const t = performance.now();
    return new Promise((resolve) => {
      let done = 0, outs = [];
      for (const p of procs) {
        let out = '', err = '';
        p.stdout.on('data', d => out += d);
        p.stderr.on('data', d => err += d);
        p.on('close', (code) => { outs.push({ code, out: out.trim(), err: err.trim().slice(0, 400) }); if (++done === procs.length) resolve({ ms: Math.round(performance.now() - t), outs }); });
      }
    });
  };
  return (async () => {
    result.differentBounties = await run('different');
    result.sameBounty = await run('same');
    const store = await openEngine(engine, dir, root);
    const ra = store.readOne(targets.a);
    result.after = {
      aEvents: ra?.events?.length ?? null,
      aStage: ra?.stage ?? null,
      bEvents: store.readOne(targets.b)?.events?.length ?? null
    };
    store.close();
    return result;
  })();
}

async function childWriterRun(engine, dir, kind, count, sharedId, root) {
  const store = await openEngine(engine, dir, root);
  let wrote = 0, errors = 0;
  for (let i = 0; i < count; i++) {
    try {
      store.writeAtMilestone(sharedId, i % 2 === 0 ? 'answered' : 'posted', new Date().toISOString());
      wrote++;
    } catch (e) { errors++; }
  }
  try { store.close(); } catch {}
  console.log(JSON.stringify({ wrote, errors }));
}

// Crash victim: inserts one base record, prints victim-ready, then loops
// milestone writes until the parent kills it mid-write.
async function childVictimRun(engine, dir, root) {
  const store = await openEngine(engine, dir, root);
  const base = makeRecord(999999, 1);
  store.upsert(base);
  console.log('victim-ready');
  let i = 0;
  while (true) {
    store.writeAtMilestone(base.id, i % 2 === 0 ? 'answered' : 'posted', new Date().toISOString());
    i++;
  }
}

// Parent side of the crash test: spawn the victim, kill it ~150 ms after it
// reports ready, then reopen the store and check integrity.
async function crashTest(engine, dir, root, n, openCount) {
  const victim = spawn(process.execPath, [SELF, '--child-victim', engine, dir, '--root', root], { stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false;
  const done = new Promise((resolve) => {
    victim.stdout.on('data', (d) => {
      if (`${d}`.includes('victim-ready') && !ready) {
        ready = true;
        setTimeout(() => victim.kill(), 150);
      }
    });
    victim.on('close', (code, signal) => resolve({ code, signal }));
  });
  const exit = await done;
  // Reopen and inspect: can the store be opened, does integrity check pass,
  // how many events did the victim's record end with (bounded loss, not zero).
  let store;
  try {
    store = await openEngine(engine, dir, root);
  } catch (e) {
    return { killedBy: exit.signal ?? `exit ${exit.code}`, integrity: `OPEN FAILED: ${e.message}`, victimRecordEvents: 'unreadable', preExistingRecordIntact: 'unreadable' };
  }
  let integrity = 'n/a';
  if (engine !== 'json-indexed') {
    try {
      if (engine === 'node-sqlite') {
        const { DatabaseSync } = await import('node:sqlite');
        const ic = new DatabaseSync(join(dir, 'bounties.sqlite'));
        integrity = ic.prepare('PRAGMA integrity_check').get().integrity_check;
        ic.close();
      } else {
        integrity = 'opened-and-exported (sql.js has no integrity_check; export succeeded)';
        store.checkpoint();
      }
    } catch (e) { integrity = `FAILED: ${e.message}`; }
  }
  const victimRecord = store.readOne(recordId(999999));
  const preExisting = store.readOne(recordId(openCount + 2));
  const result = {
    killedBy: exit.signal ?? `exit ${exit.code}`,
    integrity,
    victimRecordEvents: victimRecord?.events?.length ?? 'LOST',
    preExistingRecordIntact: preExisting !== undefined && preExisting.events.length === (preExisting.stage === 'applied' ? 4 : 4)
  };
  store.close();
  return result;
}

// ---------- sql.js scratch install ----------

function ensureSqljs(root) {
  const prefix = join(root, SQLJS_PREFIX_DIR);
  if (existsSync(join(prefix, 'node_modules', 'sql.js', 'package.json'))) return prefix;
  mkdirSync(prefix, { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const run = spawnSync(npm, ['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', 'sql.js'], { encoding: 'utf8', timeout: 300000, shell: process.platform === 'win32' });
  if (run.status !== 0) throw new Error(`scratch sql.js install failed: ${run.error ?? run.stderr ?? run.stdout}`);
  return prefix;
}

// ---------- main ----------

async function benchOne(engine, n, root) {
  const dir = join(root, `${engine}-n${n}`);
  mkdirSync(dir, { recursive: true });
  const repoDir = join(dir, 'repo');
  mkdirSync(repoDir, { recursive: true });
  const openCount = openCountFor(n);

  const t0 = performance.now();
  const store = await openEngine(engine, dir, root);
  const openMs = Math.round((performance.now() - t0) * 100) / 100;

  const s0 = performance.now();
  const records = [];
  for (let i = 0; i < n; i++) records.push(makeRecord(i, openCount));
  store.seed(records);
  const seedMs = Math.round(performance.now() - s0);

  const ops = runOps(store, n, openCount, repoDir);
  store.checkpoint();
  const sizeBytes = dirSize(dir);

  const concurrency = await concurrencyTest(engine, dir, root, n, openCount);
  const crash = await crashTest(engine, dir, root, n, openCount);
  store.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  return { engine, n, openMs, seedMs, sizeBytes, fts5: store.fts5 ?? true, ops, concurrency, crash };
}

function printTable(r) {
  console.log(`\n=== engine: ${r.engine} · N = ${r.n} · host: node ${process.version} ${process.platform} ===`);
  console.log(`open ${r.openMs} ms · seed ${r.seedMs} ms · on-disk ${(r.sizeBytes / 1048576).toFixed(2)} MiB (${r.sizeBytes} B)${r.fts5 ? '' : ' · FTS5 NOT in this build (find fell back to LIKE)'}`);
  for (const [k, v] of Object.entries(r.ops)) console.log(`  ${k.padEnd(22)} ${v.ms} ms  (${v.out})`);
  const fmtConc = (c) => `${c.ms} ms · ${c.outs.map(o => `${o.out || `exit ${o.code}${o.err ? ` err:${o.err.slice(0, 120)}` : ''}`}`).join(' | ')}`;
  console.log(`  concurrent different: ${fmtConc(r.concurrency.differentBounties)}`);
  console.log(`  concurrent same     : ${fmtConc(r.concurrency.sameBounty)}`);
  console.log(`  after concurrency   : a events=${r.concurrency.after.aEvents} stage=${r.concurrency.after.aStage} b events=${r.concurrency.after.bEvents}`);
  console.log(`  crash mid-write     : killed ${r.crash.killedBy} · integrity: ${r.crash.integrity} · victim events=${r.crash.victimRecordEvents} · other record intact=${r.crash.preExistingRecordIntact}`);
}

async function main() {
  const { root, cleanup } = prepareRoot();
  try {
    if (childWriter) {
      const [, , engine, dir, kind, countS] = [null, null, args[1], args[2], args[3], args[4]];
      await childWriterRun(args[1], args[2], args[3], Number(args[4]), arg('--shared-id'), arg('--root') ?? dir);
      return;
    }
    if (childVictim) {
      await childVictimRun(args[1], args[2], arg('--root') ?? args[2]);
      return;
    }
    const load = `loadavg ${process.platform === 'win32' ? 'n/a (win32)' : (await import('node:os')).loadavg().map(x => x.toFixed(2)).join('/')} · cpus ${(await import('node:os')).cpus().length}`;
    console.log(`K27 storage benchmark · ${new Date().toISOString()} · ${load}`);
    console.log(`engines: ${ENGINES.join(', ')} · N: ${NS.join(', ')} · scratch: ${root}`);
    if (ENGINES.includes('sqljs')) ensureSqljs(root);

    const all = [];
    for (const engine of ENGINES) for (const n of NS) {
      const r = await benchOne(engine, n, root);
      printTable(r);
      all.push(r);
    }
    console.log('\n=== json ===');
    console.log(JSON.stringify(all, null, 2));
  } finally {
    if (cleanup) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

