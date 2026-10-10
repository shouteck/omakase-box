// kitchen/bt5/check.mjs — the mechanical check for the BT5 nit bounty
// (kitchen/bt5/TASK.md). It proves the recorded bug is gone:
//
//   .box/limits.json { "allowedDestinations": [] }  — an empty list means no
//   destination is allowed — made two renderings dangle:
//     - `bounty describe` printed
//         where post --to may deliver: only inside
//       with nothing after "inside" (and a trailing space);
//     - the `destination-not-allowed` refusal printed empty parens "()".
//
// The script spins scratch git repositories in the OS temp dir and drives the
// BUILT cli (packages/box-cli/dist/cli.js) at them — the same surface a solver
// gets after the declared setup. It FAILS on the un-fixed code.
// Needs node and git on PATH; everything it creates is removed on exit.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = join(ROOT, 'packages', 'box-cli', 'dist', 'cli.js');

const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
};

const run = (program, args, cwd) =>
  spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true });
// The cli resolves --task-style file args against the working directory, so
// every call runs with cwd inside the scratch repo (no --repo flag needed).
const cli = (args, repo) => run(process.execPath, [CLI, ...args], repo);
const git = (repo, args) => {
  const res = run('git', ['-C', repo, ...args]);
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return (res.stdout ?? '').trim();
};
const write = (repo, rel, content) => {
  const target = join(repo, ...rel.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};
const makeRepo = (dir, limits) => {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-b', 'main', '-q']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  write(dir, 'TASK.md', 'a task\n');
  write(dir, '.box/limits.json', JSON.stringify(limits));
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.name=bt5-check', '-c', 'user.email=bt5-check@invalid', 'commit', '-qm', 'base']);
  return dir;
};
const draftConfirmed = (repo, outDir) => {
  const created = cli(['bounty', 'create', '--task', 'TASK.md', '--why', 'probe the refusal', '--out', outDir], repo);
  if (created.status !== 0) return { error: `create exited ${created.status}: ${created.stderr}` };
  const id = /bt-[a-f0-9]{12}/.exec(created.stdout ?? '')?.[0];
  if (id === undefined) return { error: `no bounty id in create output: ${created.stdout}` };
  const confirmed = cli(['bounty', 'confirm', id], repo);
  if (confirmed.status !== 0) return { error: `confirm exited ${confirmed.status}: ${confirmed.stderr}` };
  return { id };
};

const scratch = mkdtempSync(join(tmpdir(), 'box-bt5-check-'));
try {
  if (!existsSync(CLI)) {
    check('built cli exists', false, `${CLI} is missing — run the declared setup (install + build) first`);
  } else {
    // --- the empty list: the bug under test --------------------------------
    const empty = makeRepo(join(scratch, 'empty-dests'), { allowedDestinations: [] });

    const describe = cli(['bounty', 'describe'], empty);
    check('describe exits 0', describe.status === 0, `exit ${describe.status}: ${describe.stderr}`);
    const line = (describe.stdout ?? '').split('\n').find(l => l.includes('where post --to may deliver:'));
    check('describe prints the destinations line', line !== undefined, describe.stdout);
    if (line !== undefined) {
      check('the destinations line is not dangling', !/only inside\s*$/.test(line), JSON.stringify(line));
      check('the destinations line prints no empty parens', !line.includes('()'), JSON.stringify(line));
      check('an empty list is not claimed to mean any local folder', !line.includes('any local folder'), JSON.stringify(line));
    }

    const drafted = draftConfirmed(empty, join(scratch, 'empty-out'));
    check('a bounty drafts and confirms in the scratch repo', drafted.error === undefined, drafted.error);
    if (drafted.error === undefined) {
      const posted = cli(['bounty', 'post', drafted.id, '--to', join(scratch, 'deliver')], empty);
      check('post --to is refused destination-not-allowed', posted.status === 3 && (posted.stderr ?? '').includes('destination-not-allowed'), `exit ${posted.status}: ${posted.stderr}`);
      check('the refusal prints no empty parens', !(posted.stderr ?? '').includes('()'), posted.stderr);
    }

    // --- control: a non-empty list still renders and refuses correctly -----
    const drop = join(scratch, 'drops');
    const some = makeRepo(join(scratch, 'some-dests'), { allowedDestinations: [drop] });
    const describe2 = cli(['bounty', 'describe'], some);
    const line2 = (describe2.stdout ?? '').split('\n').find(l => l.includes('where post --to may deliver:'));
    check('control: a listed destination is named on the line', line2 !== undefined && /only inside \S/.test(line2), JSON.stringify(line2));

    const drafted2 = draftConfirmed(some, join(scratch, 'some-out'));
    if (drafted2.error === undefined) {
      const posted2 = cli(['bounty', 'post', drafted2.id, '--to', join(scratch, 'elsewhere')], some);
      check('control: --to outside the list is refused', posted2.status === 3 && (posted2.stderr ?? '').includes('destination-not-allowed'), `exit ${posted2.status}: ${posted2.stderr}`);
      check('control: the refusal names the allowed directory', (posted2.stderr ?? '').includes('drops'), posted2.stderr);
    } else {
      check('control: a bounty drafts and confirms', false, drafted2.error);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

if (failures.length > 0) {
  console.log(`check: ${failures.length} failed — ${failures.join('; ')}`);
  process.exit(1);
}
console.log('check: PASS — an empty allowedDestinations list renders honestly and still refuses every destination');
