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
// Mix C (BT29) repeats the ended mix with every record genuinely posted: each
// record carries the `github` block `post` writes (kind 'history') plus one
// collected attempt, and the Nth CLI-created record is given the same block on
// disk before OPEN is re-synced by a record write — the case a per-ended-record
// compact line escapes the bound.
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
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const CLI = join(REPO, 'packages', 'box-cli', 'dist', 'cli.js');
if (!existsSync(CLI)) throw new Error('build first: node scripts/workspace.mjs build');

const NS = [1, 10, 100, 1000];
// mix 'ended': up to five open records, the rest ended — the steady state of a
// project that has used the tool for a while. N = 1 cannot hold five opens.
const OPEN_IN_ENDED_MIX = 5;
const ALL_MIXES = ['all-open', 'five-open-rest-ended', 'five-open-rest-ended-posted'];
// Optional argv filter — `node measure.mjs five-open-rest-ended-posted` —
// for a targeted rerun (a before/after on one mix); bare still runs all.
const MIXES = process.argv[2] === undefined ? ALL_MIXES : process.argv[2].split(',').filter(mix => ALL_MIXES.includes(mix));
if (MIXES.length === 0) throw new Error(`no such mix: ${process.argv[2]}`);
const postedMix = (mix) => mix === 'five-open-rest-ended-posted';

const root = mkdtempSync(join(tmpdir(), 'kitchen-K25-'));
const settings = join(root, 'settings');
mkdirSync(settings, { recursive: true });
// Mix C's posted records are genuine refresh targets — but a measurement must
// never reach the real GitHub, and a real `gh` call that hangs on auth or the
// network blows the per-command timeout. A first-on-PATH shim that exits 1
// instantly keeps every refresh a fast named failure ('github-cli-missing' or
// 'github-command-failed' — the same lines an offline project would show).
const shim = join(root, 'gh-shim');
mkdirSync(shim, { recursive: true });
writeFileSync(join(shim, 'gh.cmd'), '@echo off\r\nexit /b 1\r\n');
writeFileSync(join(shim, 'gh'), '#!/bin/sh\nexit 1\n');
const env = { ...process.env, BOX_BOUNTY_SETTINGS_DIR: settings, NO_COLOR: '1', PATH: `${shim}${delimiter}${process.env.PATH ?? ''}` };

const git = (repo, args) => {
  const run = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-c', 'user.name=k25-measure', '-c', 'user.email=k25@measure.invalid', '-C', repo, ...args], { encoding: 'utf8', env });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
};

const box = (repo, args) => {
  const started = performance.now();
  // Mix C exposes a real cost worth naming: `status --json` refreshes the
  // issue-format cache per ended posted record (the document carries the
  // --full fact set) and each refresh persists — a write that re-syncs the
  // open surfaces over every record. That is O(N) calls plus O(N²) record
  // reads at N = 1,000, so the timeout is generous; the wall time is
  // reported, never asserted.
  const run = spawnSync(process.execPath, [CLI, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env, timeout: 1800000, maxBuffer: 256 * 1024 * 1024 });
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
const sha40 = (seed) => (seed % 0x100000000).toString(16).padStart(8, '0').repeat(5);

// The `github` block `post` writes for a history post (checked against a real
// posted record in .box/bounties/): repository, account, branch, commit,
// title, body, issue, state, kind 'history', base, pushed, wipCommit, wip,
// outside, formatRead/formatReadAt, pending — plus one collected attempt.
const githubFor = (record, i, open) => ({
  repository: 'measure/example',
  account: 'measure-account',
  branch: `box-bounty/${record.id}`,
  commit: sha40(i + 1),
  title: `[box bounty ${record.id}] ${record.title}`,
  body: `# Bounty: ${record.title}\n\nid ${record.id} · created ${record.createdAt} by box-bounty@0.1.0\n\n<!-- box-bounty:${record.id} -->\n`,
  issue: { number: i + 1, url: `https://github.com/measure/example/issues/${i + 1}` },
  state: open ? 'posted' : 'closed',
  kind: 'history',
  base: sha40(i + 0x10000),
  pushed: [{ sha: sha40(i + 1), subject: `box bounty ${record.id}: work in progress` }],
  wipCommit: null,
  wip: null,
  outside: { at: recordAt(i, 3), issueState: open ? 'open' : 'closed', answers: `GitHub answers for ${record.id} against box-bounty/${record.id}:\n  none open; wait for one or close the bounty` },
  formatRead: 'matches-record',
  formatReadAt: recordAt(i, 3),
  pending: null
});
const attemptFor = (record, i) => ({
  n: 1,
  pullRequest: i + 1,
  at: recordAt(i, 3),
  seenAt: recordAt(i, 3),
  author: 'solver-a',
  commit: sha40(i + 0x20000),
  changed: ['src/parser/tree.ts'],
  added: [],
  deleted: [],
  outcome: 'answered',
  conflicts: null,
  report: [`report — attempt 1 for ${record.id}`, '  change: 1 commit(s) — 1 changed, 0 added, 0 deleted', '  flags: none', '  nothing in the solution was run and this report says nothing about whether it works']
});

// One record file in exactly today's shape — the same fields a posted bounty
// carries after BT24 (no snapshot). Ended records keep a merge hash in the
// applied event the way apply writes it; rejected records keep a reason.
const writeRecord = (repo, i, stage, posted = false) => {
  const events = [
    { stage: 'drafted', at: recordAt(i, 0), command: 'create' },
    { stage: 'confirmed', at: recordAt(i, 1), command: 'confirm' },
    { stage: 'posted', at: recordAt(i, 2), command: 'post', destination: posted ? `https://github.com/measure/example/issues/${i + 1}` : 'folder' }
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
  if (posted) {
    record.github = githubFor(record, i, isOpenStage(stage));
    record.attempts = [attemptFor(record, i)];
  }
  const dir = join(repo, '.box', 'bounties');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${record.id}.json`), JSON.stringify(record, null, 2) + '\n');
};

// Compact-open stages, mirrored from record.ts — only 'posted' is needed here.
const isOpenStage = (stage) => !['applied', 'rejected', 'withdrawn', 'undone'].includes(stage);

const size = (text) => ({ lines: text.split('\n').filter(line => line.trim() !== '').length, characters: text.length, tokens: Math.round(text.length / 4) });

const measureCommand = (repo, args) => {
  const run = box(repo, args);
  return { ...size(run.out), ms: run.ms };
};

// Optional surface skip — `K25_SKIP='status --json'` — for a rerun that
// only needs the changed surfaces; bare still measures everything. A
// skipped cell prints `skipped`, not a number, so the table never lies.
const SKIP = new Set((process.env.K25_SKIP ?? '').split(',').filter(s => s !== ''));
const measure = (repo, name, fn) => SKIP.has(name) ? { skipped: true } : fn();

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
    writeRecord(repo, i, stage, postedMix(mix));
    if (open) direct++;
  }
  // Enable the maintained block before the one real write so the block is
  // produced by the record-write sync, exactly as on a live project.
  box(repo, ['config', 'set', 'instructions', 'true']);
  const created = box(repo, ['create', '--task', 'TASK.md', '--why', 'the recursion case is design work beyond this session', '--resume', RESUME_NOTE]);
  const oneId = /bt-[a-f\d]{12}/.exec(created.out)?.[0];
  if (oneId === undefined) throw new Error(`create did not print an id: ${created.out}`);
  if (postedMix(mix)) {
    // Mix C's Nth record is genuinely posted too: the CLI wrote it as a
    // draft, so give it the same github block and attempt on disk, then let
    // a record write re-sync OPEN through the tool's own write path.
    const file = join(repo, '.box', 'bounties', `${oneId}.json`);
    const record = JSON.parse(readFileSync(file, 'utf8'));
    record.stage = 'posted';
    record.events = [...record.events, { stage: 'posted', at: new Date().toISOString(), command: 'post', destination: `https://github.com/measure/example/issues/${n}` }];
    record.github = githubFor(record, n - 1, true);
    record.attempts = [attemptFor(record, n - 1)];
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    box(repo, ['status', oneId]); // refresh persists the record, re-syncing OPEN
  }
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
      const sync = measure(repo, 'instruction-block sync (command ms)', () => measureCommand(repo, ['config', 'set', 'instructions', 'true']));
      const block = /<!-- box-bounty -->[\s\S]*?<!-- \/box-bounty -->/.exec(readFileSync(join(repo, 'AGENTS.md'), 'utf8'))?.[0] ?? '';
      cell['instruction-block sync (command ms)'] = sync.skipped === true ? sync : { ms: sync.ms };
      cell['instruction block (bytes in AGENTS.md)'] = { ...size(block), ms: null };
      const openFile = join(repo, '.box', 'bounties', 'OPEN');
      cell['.box/bounties/OPEN'] = { ...size(existsSync(openFile) ? readFileSync(openFile) .toString() : ''), ms: null };
      cell['hook start'] = measure(repo, 'hook start', () => measureCommand(repo, ['hook', 'start']));
      cell['box bounty (overview)'] = measure(repo, 'box bounty (overview)', () => measureCommand(repo, []));
      cell['status'] = measure(repo, 'status', () => measureCommand(repo, ['status']));
      cell['status --json'] = measure(repo, 'status --json', () => measureCommand(repo, ['status', '--json']));
      cell['status <one open id>'] = measure(repo, 'status <one open id>', () => measureCommand(repo, ['status', oneId]));
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
        const text = c.skipped === true ? '(skipped)' : c.lines === undefined ? `(${pad(c.ms, 5)} ms)` : `${pad(c.lines, 4)} ln / ${pad(c.characters, 7)} ch / ${pad(c.tokens, 6)} tk / ${pad(c.ms ?? 0, 5)} ms`;
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
