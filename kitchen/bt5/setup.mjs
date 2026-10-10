// kitchen/bt5/setup.mjs — the declared setup for the BT5 nit bounty. `--setup`
// takes a single command, and the snapshot needs two — the pinned install then
// the build — so this script is the one program `create --setup` names. It
// runs them verbatim inside the shipped snapshot (this file's own location
// anchors the repository root), stdio inherited, first failure stops it.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

for (const args of [
  ['scripts/pnpm.mjs', 'install', '--frozen-lockfile'],
  ['scripts/workspace.mjs', 'build']
]) {
  const run = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
