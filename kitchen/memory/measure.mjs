// K25 measurement: how much the bounty tool puts in front of an agent as the
// number of bounty records grows. Builds scratch repositories with synthetic
// records at N = 1, 10, 100, 1,000 in two mixes — all open, and five open plus
// the rest ended — then measures every surface an agent reads:
//
//   - the maintained instruction-file block (bytes of the <!-- box-bounty -->
//     block in AGENTS.md after a real sync)
//   - the .box/bounties/OPEN index line
//   - `box bounty hook start` (the host hook's context output)
//   - `box bounty` (the overview)
//   - `box bounty status`, `box bounty status --json`, `box bounty status <id>`
//
// For each it records lines, characters, an approximate token count
// (Math.round(characters / 4) — an estimate, stated as one), and wall time.
// Lines, characters and token estimates are deterministic across reruns;
// wall time varies with host load and is reported, never asserted.
//
// Run after `node scripts/workspace.mjs build`:
//
//   node kitchen/memory/measure.mjs
//
// Everything happens under one %TEMP%\kitchen-K25-* root — scratch git repos
// and a scratch BOX_BOUNTY_SETTINGS_DIR — which a finally block removes.
// The owner's settings are never touched and nothing outside Git is left.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const CLI = join(REPO, 'packages', 'box-cli', 'dist', 'cli.js');
if (!existsSync(CLI)) throw new Error('build first: node scripts/workspace.mjs build');

const NS = [1, 10, 100, 1000];
// mix 'ended': up to five open records, the rest ended — the steady state of a
// project that has used the tool for a while. N = 1 cannot hold five opens.
const OPEN_IN_ENDED_MIX = 5;
const MIXES = ['all-open', 'five-open-rest-ended'];

const root = mkdtempSync(join(tmpdir(), 'kitchen-K25-'));
const settings = join(root, 'settings');
mkdirSync(settings, { recursive: true });
const env = { ...process.env, BOX_BOUNTY_SETTINGS_DIR: settings, NO_COLOR: '1' };

const git = (repo, args) => {
  const run = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-c', 'user.name=k25-measure', '-c', 'user.email=k25@measure.invalid', '-C', repo, ...args], { encoding: 'utf8', env });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
};

const box = (repo, args) => {
  const started = performance.now();
  const run = spawnSync(process.execPath, [CLI, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env, timeout: 300000, maxBuffer: 256 * 1024 * 1024 });
  const ms = Math.round(performance.now() - started);
  if (run.error) throw new Error(`box bounty ${args.join(' ')}: ${run.error}`);
  if (run.status !== 0) throw new Error(`box bounty ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
  return { out: `${run.stdout ?? ''}${run.stderr ?? ''}`, ms };
};

// A fixed 40-word --resume note and task text, so every synthetic record is the
// realistic size the brief asks for and identical across reruns.
const RESUME_NOTE = 'Resume the parser refactor on this branch: the tokeniser is split, the tree builder still reads the old stream shape, and the failing case is the nested-comment fixture the bounty was opened to finish.';
const TASK_TEXT = 'Finish the nested-comment fixture in the parser: the tree builder must accept the new token stream, keep the existing public shape, and leave the flat-comment fixtures passing exactly as they do today.';
const NOTE_TEXT = 'Tried splitting the tokeniser first; the recursion case needs the tree builder to consume the new stream, which is design work better handed off than guessed at here.';

const recordId = (i) => `bt-${(i + 1).toString(16).padStart(12, '0')}`;
const recordAt = (i, step) => new Date(Date.parse('2026-01-05T09:00:00Z') + i * 86400000 + step * 3600000).toISOString();

// One record file in exactly today's shape — the same fields a posted bounty
// carries after BT24 (no snapshot). Ended records keep a merge hash in the
// applied event the way apply writes it; rejected records keep a reason.
const writeRecord = (repo, i, stage) => {
  const events = [
    { stage: 'drafted', at: recordAt(i, 0), command: 'create' },
    { stage: 'confirmed', at: recordAt(i, 1), command: 'confirm' },
    { stage: 'posted', at: recordAt(i, 2), command: 'post', destination: 'folder' }
  ];
  if (stage === 'applied') events.push({ stage: 'applied', at: recordAt(i, 3), command: 'apply', attempt: 1, merge: '0'.repeat(40) });
  else if (stage === 'rejected') events.push({ stage: 'rejected', at: recordAt(i, 3), command: 'close', reason: 'the fixture was retired upstream' });
  const record = {
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id: recordId(i),
    title: `Finish the nested-comment fixture, part ${i + 1}`,
    why: 'the recursion case is design work beyond this session',
    noteSource: 'authored',
    resume: { kind: 'recorded', branch: 'main', commit: '(no commits yet)', changed: ['src/parser/tree.ts', 'src/parser/stream.ts'], note: RESUME_NOTE },
    stage,
    content: { task: { file: 'TASK.md', text: TASK_TEXT }, note: { file: 'NOTE.md', text: NOTE_TEXT }, tool: 'box-bounty' },
    createdAt: recordAt(i, 0),
    events
  };
  const dir = join(repo, '.box', 'bounties');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${record.id}.json`), JSON.stringify(record, null, 2) + '\n');
};

const size = (text) => ({ lines: text.split('\n').filter(line => line.trim() !== '').length, characters: text.length, tokens: Math.round(text.length / 4) });

const measureCommand = (repo, args) => {
  const run = box(repo, args);
  return { ...size(run.out), ms: run.ms };
};

// One (mix, N) world: a scratch repo, N-1 records written directly in today's
// shape, then one real `bounty create` — the Nth record — so the OPEN index
// and the instruction block are produced by the tool's own write path, not
// staged by this script.
const buildWorld = (mix, n) => {
  const repo = join(root, `${mix}-${n}`, 'repo');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, 'AGENTS.md'), '# fixture\n\nDo the task and verify it.\n');
  writeFileSync(join(repo, 'TASK.md'), `${TASK_TEXT}\n`);
  git(repo, ['init', '-b', 'main', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture base']);

  const opens = mix === 'all-open' ? n : Math.min(OPEN_IN_ENDED_MIX, n);
  let direct = 0;
  for (let i = 0; i < n - 1; i++) {
    const open = direct < opens - 1; // the CLI-created record supplies the last open slot
    const stage = mix === 'all-open' || open ? 'posted' : (i % 2 === 0 ? 'applied' : 'rejected');
    writeRecord(repo, i, stage);
    if (open) direct++;
  }
  // Enable the maintained block before the one real write so the block is
  // produced by the record-write sync, exactly as on a live project.
  box(repo, ['config', 'set', 'instructions', 'true']);
  const created = box(repo, ['create', '--task', 'TASK.md', '--why', 'the recursion case is design work beyond this session', '--resume', RESUME_NOTE]);
  const oneId = /bt-[a-f\d]{12}/.exec(created.out)?.[0];
  if (oneId === undefined) throw new Error(`create did not print an id: ${created.out}`);
  // The hook on this host writes .devin/hooks.v1.json inside the scratch repo.
  box(repo, ['hook', 'on', '--host', 'devin']);
  box(repo, ['hook', 'on', '--host', 'devin', '--confirm']);
  return { repo, oneId };
};

const pad = (value, width) => String(value).padStart(width);

const results = {};
try {
  for (const mix of MIXES) {
    results[mix] = {};
    for (const n of NS) {
      const { repo, oneId } = buildWorld(mix, n);
      const cell = {};
      // The maintained block: re-run the sync (measures its cost at this N),
      // then size the block itself inside AGENTS.md.
      const sync = measureCommand(repo, ['config', 'set', 'instructions', 'true']);
      const block = /<!-- box-bounty -->[\s\S]*?<!-- \/box-bounty -->/.exec(readFileSync(join(repo, 'AGENTS.md'), 'utf8'))?.[0] ?? '';
      cell['instruction-block sync (command ms)'] = { ms: sync.ms };
      cell['instruction block (bytes in AGENTS.md)'] = { ...size(block), ms: null };
      const openFile = join(repo, '.box', 'bounties', 'OPEN');
      cell['.box/bounties/OPEN'] = { ...size(existsSync(openFile) ? readFileSync(openFile) .toString() : ''), ms: null };
      cell['hook start'] = measureCommand(repo, ['hook', 'start']);
      cell['box bounty (overview)'] = measureCommand(repo, []);
      cell['status'] = measureCommand(repo, ['status']);
      cell['status --json'] = measureCommand(repo, ['status', '--json']);
      cell['status <one open id>'] = measureCommand(repo, ['status', oneId]);
      results[mix][n] = cell;
    }
  }

  // Human-readable tables: one per mix, one row per surface, N across the
  // columns, "lines / chars / ~tokens" in each cell and wall ms beside it.
  const surfaces = Object.keys(results[MIXES[0]][NS[0]]);
  for (const mix of MIXES) {
    console.log(`\n=== mix: ${mix} ===`);
    console.log(`${'surface'.padEnd(42)} | ${NS.map(n => pad(`N=${n}`, 34)).join(' | ')}`);
    for (const surface of surfaces) {
      const cells = NS.map(n => {
        const c = results[mix][n][surface];
        const text = c.lines === undefined ? `(${pad(c.ms, 5)} ms)` : `${pad(c.lines, 4)} ln / ${pad(c.characters, 7)} ch / ${pad(c.tokens, 6)} tk / ${pad(c.ms ?? 0, 5)} ms`;
        return pad(text, 34);
      });
      console.log(`${surface.padEnd(42)} | ${cells.join(' | ')}`);
    }
  }
  // The machine form, for the report to quote exactly.
  console.log('\n=== json ===');
  console.log(JSON.stringify(results, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}
