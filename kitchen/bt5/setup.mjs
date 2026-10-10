// kitchen/bt5/setup.mjs — the declared setup for the BT5 nit bounty. `--setup`
// takes a single command, and a cold snapshot needs three — the repository-
// local pnpm bootstrap, the pinned install, then the build — so this script is
// the one program `create --setup` names. It runs them inside the shipped
// snapshot (this file's own location anchors the repository root), stdio
// inherited, first failure stops it.
//
// The bootstrap comes first because a shipped snapshot carries no
// node_modules: `scripts/tooling` must be installed (`npm ci`) before
// `scripts/pnpm.mjs` can even start — the step a warm checkout hides. (BT5
// journey finding: `create --setup` failed setup-failed on exactly this.)

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

// `npm` is a .cmd shim on Windows and cannot be spawned bare, so that step
// goes through the platform shell as one verbatim line (an argv array would
// only be concatenated unescaped — DEP0190). The line is fixed literals;
// nothing outside this file is quoted into it.
for (const [program, args, throughShell] of [
  ['npm', ['ci', '--prefix', 'scripts/tooling', '--ignore-scripts'], process.platform === 'win32'],
  [process.execPath, ['scripts/pnpm.mjs', 'install', '--frozen-lockfile'], false],
  [process.execPath, ['scripts/workspace.mjs', 'build'], false]
]) {
  const line = [program, ...args].join(' ');
  console.log(`setup: ${line}`);
  const run = throughShell
    ? spawnSync(line, { cwd: root, stdio: 'inherit', windowsHide: true, shell: true })
    : spawnSync(program, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
