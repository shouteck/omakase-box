// K27 storage prototype — the recommended design behind one small storage
// interface, exercised as a self-test in a scratch world. Not product code.
//
//   node kitchen/memory/storage/prototype.mjs            runs the self-test
//   node kitchen/memory/storage/prototype.mjs --out <dir>  keeps the world
//
// Engine: node:sqlite (DatabaseSync, WAL, FTS5) — the benchmark's winner.
// Two tables, matching K26's tiers:
//   shared_bounties  — ONLY the anyone + project-agents fields (K26 Step 5).
//                      Zero machine-local columns: the shared schema cannot
//                      hold a machine-local field at all.
//   local_bounties   — the this-machine tier (folder, branch, dirty files,
//                      scan findings, waiting, rejected attempts, caches).
//   bounties_fts     — FTS5 over the shared fields, for `find`.
//
// Shared store adapter: a committed shared file `shared.jsonl` in a Git
// repository — the recommended shared store (free, offline, public-in-a-
// public-repository per the owner's standing decision). The stand-in is a
// bare repo `shared.git` plus per-machine clones under the scratch root.
// Push appends one JSONL line per shared record and commits; pull imports
// every line. Nothing is pushed anywhere real.
//
// The self-test proves waves/K27.md Step 4's three claims:
//   (a) drafts write nothing to the shared store; posting syncs the shared
//       tier once; machine-local state stays local.
//   (b) a second machine with an empty local DB syncs from the shared store
//       and answers listOpen / boundedOverview / find / readOne / hookStart /
//       instructionBlock correctly — with zero machine-local fields anywhere
//       in the shared store or machine 2's local tier.
//   (c) deleting machine 1's local DB and rebuilding restores the shared
//       mental model; only machine-local detail is lost.
//
// --out honouring the ownership-marker guard: a non-empty directory without
// .k27-storage-owned is refused with exit 1.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MARKER = '.k27-storage-owned';
const OPEN_STAGES = new Set(['drafted', 'confirmed', 'posted', 'answered']);

function prepareRoot() {
  const i = process.argv.indexOf('--out');
  if (i === -1) return { root: mkdtempSync(join(tmpdir(), 'kitchen-K27-')), cleanup: true };
  const out = process.argv[i + 1];
  if (existsSync(out)) {
    const entries = readdirSync(out);
    if (entries.length > 0 && !entries.includes(MARKER)) {
      console.error(`refusing: --out ${out} exists, is non-empty and has no ${MARKER} marker`);
      process.exit(1);
    }
  } else mkdirSync(out, { recursive: true });
  if (!existsSync(join(out, MARKER))) writeFileSync(join(out, MARKER), `created by kitchen/memory/storage/prototype.mjs at ${new Date().toISOString()}\n`);
  return { root: out, cleanup: false };
}

const git = (repo, gargs) => {
  const run = spawnSync('git', ['-c', 'user.name=k27-proto', '-c', 'user.email=k27@proto.invalid', '-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-C', repo, ...gargs], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${gargs.join(' ')}: ${run.stderr}`);
  return (run.stdout ?? '').trim();
};

// ---------- the storage interface ----------

const SHARED_FIELDS = ['id', 'stage', 'title', 'why', 'partOf', 'createdAt', 'endedAt', 'task', 'note', 'resumeNote', 'github', 'events', 'attempt', 'allowedBy', 'reward'];
const LOCAL_ONLY_FIELDS = ['folder', 'branch', 'commit', 'changed', 'scanFindings', 'waiting', 'attempts', 'conflicts', 'snapshot', 'manifestSha256', 'githubApproval', 'githubCache'];

async function openStore(dir) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(dir, 'box-memory.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(`
CREATE TABLE IF NOT EXISTS shared_bounties(
  id TEXT PRIMARY KEY, stage TEXT NOT NULL, title TEXT NOT NULL,
  why TEXT, partOf TEXT, createdAt TEXT NOT NULL, endedAt TEXT,
  task TEXT, note TEXT, resumeNote TEXT,
  github TEXT, events TEXT, attempt TEXT, allowedBy TEXT, reward TEXT
);
CREATE TABLE IF NOT EXISTS local_bounties(
  id TEXT PRIMARY KEY,
  folder TEXT, branch TEXT, commitSha TEXT, changed TEXT,
  scanFindings TEXT, waiting TEXT, attemptsLocal TEXT,
  githubCache TEXT, conflicts TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS bounties_fts USING fts5(id UNINDEXED, title, why, partOf, task, note);
`);
  const q = (sql) => db.prepare(sql);
  const st = {
    listOpen: q(`SELECT id,title,stage FROM shared_bounties WHERE stage IN ('drafted','confirmed','posted','answered') ORDER BY createdAt`),
    endedCount: q(`SELECT COUNT(*) c FROM shared_bounties WHERE stage NOT IN ('drafted','confirmed','posted','answered')`),
    recentEnded: q(`SELECT id,title,stage,endedAt FROM shared_bounties WHERE stage NOT IN ('drafted','confirmed','posted','answered') ORDER BY endedAt DESC LIMIT 5`),
    readShared: q('SELECT * FROM shared_bounties WHERE id=?'),
    readLocal: q('SELECT * FROM local_bounties WHERE id=?'),
    insShared: q(`INSERT OR REPLACE INTO shared_bounties VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
    insLocal: q(`INSERT OR REPLACE INTO local_bounties VALUES(?,?,?,?,?,?,?,?,?,?)`),
    insFts: q(`INSERT OR REPLACE INTO bounties_fts VALUES(?,?,?,?,?,?)`),
    updStage: q('UPDATE shared_bounties SET stage=?, endedAt=? WHERE id=?'),
    allShared: q('SELECT * FROM shared_bounties ORDER BY createdAt'),
    localIds: q('SELECT id FROM local_bounties')
  };
  const sharedRow = (s) => [s.id, s.stage, s.title, s.why ?? null, s.partOf ?? null, s.createdAt, s.endedAt ?? null, s.task ?? null, s.note ?? null, s.resumeNote ?? null, JSON.stringify(s.github ?? null), JSON.stringify(s.events ?? []), JSON.stringify(s.attempt ?? null), JSON.stringify(s.allowedBy ?? null), JSON.stringify(s.reward ?? null)];
  return {
    db,
    // --- writes ---
    createDraft(rec) { // a draft writes ONLY local; nothing shared exists yet
      st.insLocal.run(rec.id, rec.folder ?? null, rec.branch ?? null, rec.commitSha ?? null, JSON.stringify(rec.changed ?? []), JSON.stringify(rec.scanFindings ?? []), JSON.stringify(rec.waiting ?? null), JSON.stringify(rec.attemptsLocal ?? []), JSON.stringify(rec.githubCache ?? null), JSON.stringify(rec.conflicts ?? null));
      // keep the draft's identity locally so reads can find it pre-post
      st.insShared.run(...sharedRow({ id: rec.id, stage: rec.stage, title: rec.title, createdAt: rec.createdAt, events: [] }));
    },
    writeLocal(id, patch) {
      const cur = st.readLocal.get(id) ?? {};
      const val = (k, d) => JSON.stringify(patch[k] ?? (cur[k] ? JSON.parse(cur[k]) : d));
      st.insLocal.run(id, patch.folder ?? cur.folder ?? null, patch.branch ?? cur.branch ?? null, patch.commitSha ?? cur.commitSha ?? null, val('changed', []), val('scanFindings', []), val('waiting', null), val('attemptsLocal', []), val('githubCache', null), val('conflicts', null));
    },
    // postShared is the only path that builds the shared record — the tool
    // derives the split; the interface cannot accept a local field.
    postShared(shared) {
      for (const key of Object.keys(shared)) {
        if (!SHARED_FIELDS.includes(key)) throw new Error(`refused machine-local key in shared record: ${key}`);
      }
      st.insShared.run(...sharedRow(shared));
      st.insFts.run(shared.id, shared.title, shared.why ?? '', shared.partOf ?? '', shared.task ?? '', shared.resumeNote ?? shared.note ?? '');
    },
    // --- reads (the seven operations) ---
    listOpen: () => st.listOpen.all(),
    boundedOverview: () => ({ open: st.listOpen.all(), endedCount: st.endedCount.get().c, recentEnded: st.recentEnded.all() }),
    find(query) {
      const match = query.split(/\s+/).map(t => `"${t.replaceAll('"', '')}"`).join(' OR ');
      return db.prepare('SELECT s.id, s.title, s.stage FROM bounties_fts f JOIN shared_bounties s ON s.id = f.id WHERE bounties_fts MATCH ? LIMIT 20').all(match);
    },
    readOne(id) {
      const s = st.readShared.get(id);
      const l = st.readLocal.get(id);
      if (s === undefined && l === undefined) return undefined;
      return {
        ...(s === undefined ? {} : { ...s, github: JSON.parse(s.github), events: JSON.parse(s.events), attempt: JSON.parse(s.attempt), allowedBy: JSON.parse(s.allowedBy), reward: JSON.parse(s.reward) }),
        ...(l === undefined ? {} : { local: { ...l, changed: JSON.parse(l.changed), scanFindings: JSON.parse(l.scanFindings), waiting: JSON.parse(l.waiting), attemptsLocal: JSON.parse(l.attemptsLocal), githubCache: JSON.parse(l.githubCache), conflicts: JSON.parse(l.conflicts) } })
      };
    },
    hookStart: () => st.listOpen.all().map(r => `${r.id} ${r.stage}`).join(' ') || 'no open bounties',
    instructionBlock() {
      const open = st.listOpen.all();
      return `<!-- box-bounty -->\nbox bounty can hand a task to an outside solver and bring solutions back\nas facts — \`box bounty describe\` says what it does, what it costs and when it\nbeats doing the work yourself. Using it is always your call; the owner's\npermission applies.${open.length > 0 ? `\nopen bounties: ${open.map(r => r.id).join(', ')}` : ''}\n<!-- /box-bounty -->\n`;
    },
    // --- shared-store adapter: shared.jsonl committed in a git clone ---
    exportShared(cloneDir) {
      const file = join(cloneDir, 'shared.jsonl');
      const lines = st.allShared.all().map(r => JSON.stringify({ id: r.id, stage: r.stage, title: r.title, why: r.why, partOf: r.partOf, createdAt: r.createdAt, endedAt: r.endedAt, task: r.task, note: r.note, resumeNote: r.resumeNote, github: JSON.parse(r.github), events: JSON.parse(r.events), attempt: JSON.parse(r.attempt), allowedBy: JSON.parse(r.allowedBy), reward: JSON.parse(r.reward) }));
      writeFileSync(file, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
      git(cloneDir, ['add', 'shared.jsonl']);
      try { git(cloneDir, ['commit', '-qm', 'sync shared bounties']); git(cloneDir, ['push', '-q', 'origin', 'main']); } catch { /* nothing new */ }
      return lines.length;
    },
    importShared(cloneDir) {
      git(cloneDir, ['pull', '-q']);
      const file = join(cloneDir, 'shared.jsonl');
      if (!existsSync(file)) return 0;
      let n = 0;
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line.trim() === '') continue;
        const s = JSON.parse(line);
        this.postShared(s);
        n++;
      }
      return n;
    },
    localRowCount: () => st.localIds.all().length,
    close: () => db.close()
  };
}

// ---------- self-test ----------

const { root, cleanup } = prepareRoot();
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`  ok — ${msg}`);

try {
  console.log(`K27 prototype self-test · ${new Date().toISOString()} · node ${process.version} · scratch ${root}`);
  // Shared stand-in: a bare repo and two per-machine clones.
  const sharedBare = join(root, 'shared.git');
  mkdirSync(sharedBare, { recursive: true });
  git(sharedBare, ['init', '--bare', '-b', 'main', '-q']);
  const cloneOf = (name) => {
    const dir = join(root, name);
    spawnSync('git', ['clone', '-q', sharedBare, dir], { encoding: 'utf8' });
    git(dir, ['config', 'user.name', `k27-${name}`]);
    return dir;
  };
  const m1clone = cloneOf('m1-clone');
  const m2clone = cloneOf('m2-clone');
  // m2 clone needs a first commit to pull against later; m1 pushes soon after.

  const m1dir = join(root, 'm1-db');
  const m2dir = join(root, 'm2-db');
  mkdirSync(m1dir); mkdirSync(m2dir);

  // --- (a) machine 1: draft writes nothing shared; post syncs once ---
  const m1 = await openStore(m1dir);
  const rec = {
    id: 'bt-k27proto001', stage: 'drafted', title: 'Finish the nested-comment fixture',
    createdAt: '2026-10-17T09:00:00Z',
    folder: 'C:\\proj\\box-bounty\\bt-k27proto001', branch: 'oauth-wip', commitSha: 'a'.repeat(40),
    changed: ['src/auth/session.js'], scanFindings: [{ at: '2026-10-17T09:00:00Z', where: 'create', hits: [] }],
    waiting: null, attemptsLocal: [{ n: 1, outcome: 'set-aside', report: ['rejected solver text'] }], githubCache: null, conflicts: null
  };
  m1.createDraft(rec);
  const sharedFile = join(m1clone, 'shared.jsonl');
  if (existsSync(sharedFile) && readFileSync(sharedFile, 'utf8').trim() !== '') fail('draft leaked into the shared file');
  ok('(a1) draft wrote no shared record — shared store still empty');

  // post: the tool derives the shared record — only K26's anyone+agents fields
  const shared = {
    id: rec.id, stage: 'posted', title: rec.title, createdAt: rec.createdAt, endedAt: null,
    why: 'the recursion case is design work beyond this session',
    partOf: 'oauth migration', task: 'Finish the nested-comment fixture in the parser…',
    note: 'Tried splitting the tokeniser first…',
    resumeNote: 'halfway through the session-store move; migrateSession written, revokeSession and cleanupExpired still call memoryMap',
    github: { repository: 'o/r', issue: { number: 7 }, state: 'posted' },
    events: [{ stage: 'posted', at: '2026-10-17T09:05:00Z', destination: 'github' }],
    attempt: null, allowedBy: { decision: 'allowed', level: 'project' }, reward: { amount: 25 }
  };
  m1.postShared(shared);
  const pushed = m1.exportShared(m1clone);
  if (pushed !== 1) fail(`expected 1 shared record, got ${pushed}`);
  const sharedLines = readFileSync(sharedFile, 'utf8');
  for (const f of LOCAL_ONLY_FIELDS) {
    if (sharedLines.includes(`"${f}"`)) fail(`machine-local field "${f}" present in the shared store`);
  }
  ok('(a2) post synced the shared tier once; zero machine-local fields in the shared store');
  const m1local = m1.readOne(rec.id).local;
  if (m1local?.folder !== rec.folder || m1local?.branch !== 'oauth-wip' || m1local.attemptsLocal.length !== 1) fail('local record lost machine state');
  ok('(a3) machine-local record holds folder, branch, changed, scanFindings, rejected attempts');

  // --- (b) machine 2: empty local DB, syncs from shared, answers correctly ---
  const m2 = await openStore(m2dir);
  const imported = m2.importShared(m2clone);
  if (imported !== 1) fail(`m2 imported ${imported} records`);
  const open = m2.listOpen();
  if (open.length !== 1 || open[0].id !== rec.id) fail('m2 listOpen wrong');
  ok('(b1) m2 listOpen answers the posted bounty');
  const ov = m2.boundedOverview();
  if (ov.endedCount !== 0 || ov.open.length !== 1) fail('m2 boundedOverview wrong');
  ok('(b2) m2 boundedOverview: 1 open, 0 ended');
  const hits = m2.find('tokeniser nested-comment');
  if (!hits.some(h => h.id === rec.id)) fail('m2 find missed');
  ok('(b3) m2 find by purpose text hits the record');
  const one = m2.readOne(rec.id);
  if (one.partOf !== 'oauth migration' || !one.resumeNote.includes('session-store')) fail('m2 readOne wrong');
  if ('local' in one) fail('m2 readOne carries machine-local fields');
  ok('(b4) m2 readOne returns the shared record with no local tier');
  if (!m2.hookStart().includes(rec.id)) fail('m2 hookStart wrong');
  if (!m2.instructionBlock().includes(`open bounties: ${rec.id}`)) fail('m2 instructionBlock wrong');
  ok('(b5) m2 hookStart + instructionBlock carry the open bounty');
  if (m2.localRowCount() !== 0) fail('m2 has machine-local rows it should not');
  ok('(b6) m2 local tier is empty — no machine-local fields on machine 2');

  // --- (c) delete m1's local DB, rebuild from shared: shared model restored ---
  m1.close();
  rmSync(m1dir, { recursive: true, force: true });
  const m1bDir = join(root, 'm1-db-rebuilt');
  mkdirSync(m1bDir);
  const m1b = await openStore(m1bDir);
  m1b.importShared(cloneOf('m1-clone-rebuilt'));
  const restored = m1b.readOne(rec.id);
  if (restored === undefined || restored.why !== shared.why || restored.partOf !== 'oauth migration') fail('rebuilt store lost the shared mental model');
  if ('local' in restored) fail('rebuilt store unexpectedly kept machine-local fields');
  ok('(c) deleting the local DB and rebuilding restored the shared mental model; only machine-local detail lost');

  m2.close(); m1b.close();
  console.log('\nPASS — prototype self-test green');
} finally {
  if (cleanup) {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); }
    catch (e) { console.error(`warning: scratch cleanup failed (${e.message}) — remove ${root} by hand`); }
  }
}
