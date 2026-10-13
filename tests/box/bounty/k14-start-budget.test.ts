// K14: the guard that keeps process starts down. Every bounty command is run
// once through the built CLI on the standard fixture, with a NODE_OPTIONS
// preload counting each child_process start underneath it. The table is the
// counts this wave reached — a command that grows a Git or gh launch fails
// here, not in a timing test a busy machine could flake.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, it } from 'vitest';
import { fixture } from './github-fixture.js';
import { CLI_DIST, git, runRoot, write } from './support.js';

// The spy, loaded into each CLI process (and inherited by its children):
// append one JSON line per child_process start to <K14_BUDGET_DIR>/<pid>.jsonl.
// The directory variable is this test's own — an external instrumented run's
// spy writes under its own name and cannot double a count here — and the
// loaded-once guard keeps a double --require from hooking spawn twice.
const SPY = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const dir = process.env.K14_BUDGET_DIR;
if (dir && !globalThis.__k14BudgetSpy) {
  globalThis.__k14BudgetSpy = true;
  const file = path.join(dir, String(process.pid) + '.jsonl');
  const line = (program, args) => {
    try { fs.appendFileSync(file, JSON.stringify([String(program), ...(args ?? []).map(String)]) + '\n'); } catch {}
  };
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
    const orig = cp[name];
    cp[name] = function (program, args) {
      line(program, Array.isArray(args) ? args : []);
      return orig.apply(this, arguments);
    };
  }
  for (const name of ['exec', 'execSync']) {
    const orig = cp[name];
    cp[name] = function (command) { line('sh:' + command, []); return orig.apply(this, arguments); };
  }
}
`;

interface Starts { readonly git: number; readonly gh: number; readonly other: readonly string[] }

// Classify every recorded start: Git is a basename of git or git.exe; gh is
// the stand-in by any launcher (a cmd line carrying gh is counted as gh, not
// cmd); anything else is listed so a stray process fails the check by name.
function tally(dir: string): Starts {
  let git = 0; let gh = 0; const other: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    for (const text of readFileSync(join(dir, name), 'utf8').split('\n')) {
      if (text.trim() === '') continue;
      let row: string[];
      try { row = JSON.parse(text) as string[]; } catch { other.push('(unparsed)'); continue; }
      const [program = '', ...args] = row;
      const base = basename(program).toLowerCase();
      if (base === 'git' || base === 'git.exe') git += 1;
      else if (base === 'gh' || base === 'gh.exe' || base === 'gh.cmd' || (base === 'cmd.exe' || base === 'cmd') && args.join(' ').includes('gh')) gh += 1;
      else other.push(`${base === '' ? program : base} ${args.slice(0, 2).join(' ')}`.trim());
    }
  }
  return { git, gh, other };
}

// The counts this wave reaches, one entry per command in the journey below.
// BT7b adds one `git version` probe per process to every command that uses
// Git, one `gh --version` per process to every command that reaches the
// stand-in, and one `rev-list` to every command that runs while an open
// bounty has a recorded solution commit (attempt or seen pull-request head)
// — the merged-solution check.
const BUDGET: Record<string, { git: number; gh: number }> = {
  'help': { git: 0, gh: 0 },
  'describe': { git: 2, gh: 0 },
  'describe-rules': { git: 2, gh: 0 },
  'create-preview': { git: 11, gh: 0 },
  'create': { git: 18, gh: 0 },
  'status-drafted': { git: 2, gh: 0 },
  'close-draft': { git: 3, gh: 0 },
  'confirm-preview': { git: 18, gh: 3 },
  'confirm-github': { git: 18, gh: 3 },
  'post-github': { git: 21, gh: 8 },
  'status-posted': { git: 2, gh: 5 },
  'status-comments': { git: 3, gh: 7 },
  'look-pr': { git: 19, gh: 2 },
  'look': { git: 6, gh: 0 },
  'look-full': { git: 6, gh: 0 },
  'apply': { git: 15, gh: 5 },
  'status-applied': { git: 2, gh: 0 },
  'close-ended': { git: 4, gh: 5 },
  'create-local': { git: 18, gh: 0 },
  'confirm-local': { git: 2, gh: 0 },
  'post-dir': { git: 2, gh: 0 },
  'look-from': { git: 16, gh: 0 },
  'close-reason': { git: 4, gh: 0 },
  'status-end': { git: 2, gh: 0 }
};

it('every bounty command stays within its Git and gh start budget', () => fixture(context => {
  const { repo, scratch, id } = context;
  const spy = join(runRoot('k14-spy'), 'spy.cjs');
  writeFileSync(spy, SPY);
  const env = {
    ...process.env,
    // Compose, never replace: the gh stand-in rides this same NODE_OPTIONS
    // (fixture()'s withGhEnv already put its --require here), so a lone spy
    // preload would leave gh.exe without its script — every github leg then
    // refuses not-signed-in and no budget is exercised. The spy listens on
    // K14_BUDGET_DIR, a name only this test sets, so an inherited preload
    // still cannot write into the counted directory.
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${spy.replaceAll('\\', '/')}`.trim()
  };
  const runs: { label: string; exit: number | null; git: number; gh: number; other: readonly string[]; stderr: string }[] = [];
  const run = (label: string, ...args: string[]) => {
    const dir = join(runRoot(`k14-spy-${label}`), 'starts');
    mkdirSync(dir, { recursive: true });
    const r = spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env: { ...env, K14_BUDGET_DIR: dir }, timeout: 120000 });
    const counted = tally(dir);
    runs.push({ label, exit: r.status, ...counted, stderr: r.stderr ?? '' });
    return r;
  };

  // A second drafted bounty gives close its own target; every later call
  // carries an explicit id so nothing is ambiguous.
  run('help', 'help');
  run('describe', 'describe');
  run('describe-rules', 'describe', '--rules');
  run('create-preview', 'create', '--task', 'TASK.md', '--why', 'second', '--preview');
  run('create', 'create', '--task', 'TASK.md', '--why', 'second', '--title', 'Second');
  const second = readdirSync(join(repo, '.box', 'bounties')).map(file => file.replace('.json', '')).find(name => name.startsWith('bt-') && name !== id)!;
  run('status-drafted', 'status');
  run('close-draft', 'close', second);
  run('confirm-preview', 'confirm', id, '--to', 'github', '--preview');
  run('confirm-github', 'confirm', id, '--to', 'github');
  run('post-github', 'post', id, '--to', 'github');
  context.pr('solver');
  run('status-posted', 'status', id);
  run('status-comments', 'status', id, '--comments');
  // `look <n>` collects the pull request itself — what `answer --pr` did —
  // then showing the same attempt again is the cheap read.
  run('look-pr', 'look', id, '1');
  run('look', 'look', id, '1');
  run('look-full', 'look', id, '1', '--full');
  run('apply', 'apply', id, '1');
  run('status-applied', 'status', id);
  run('close-ended', 'close', id);

  // The local-folder leg: the fixture's limits name github only, so the
  // owner grants the deliveries folder before the draft is confirmed there.
  const deliveries = join(scratch, 'deliveries');
  write(repo, '.box/limits.json', JSON.stringify({ allowedDestinations: ['github', deliveries] }));
  run('create-local', 'create', '--task', 'TASK.md', '--why', 'third', '--title', 'Third');
  const third = readdirSync(join(repo, '.box', 'bounties')).map(file => file.replace('.json', '')).find(name => name.startsWith('bt-') && name !== id && name !== second)!;
  run('confirm-local', 'confirm', third);
  run('post-dir', 'post', third, '--to', deliveries);
  const returned = join(scratch, 'returned');
  cpSync(join(deliveries, third), returned, { recursive: true });
  write(returned, 'repo/app.txt', 'fixed differently\n');
  run('look-from', 'look', third, '--from', returned);
  run('close-reason', 'close', third, '--reason', 'not landing');
  run('status-end', 'status');

  for (const step of runs) {
    const budget = BUDGET[step.label];
    if (budget === undefined) { expect.unreachable(`${step.label} has no budget entry`); }
    expect(step.exit, `${step.label} itself failed: ${step.stderr.slice(0, 300)}`).toBe(0);
    expect(step.other, `${step.label} started stray processes`).toEqual([]);
    expect(step.git, `${step.label} Git starts (budget ${budget.git})`).toBeLessThanOrEqual(budget.git);
    expect(step.gh, `${step.label} gh starts (budget ${budget.gh})`).toBeLessThanOrEqual(budget.gh);
  }
}, 'Repair app'), 180000);
