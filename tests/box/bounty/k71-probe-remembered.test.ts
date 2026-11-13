// K71: the `gh version` probe was one process start in every command that reaches GitHub. A gh that passed it is remembered in the
// project's local store (keyed by its path, stamped by its size and modification time), so a later command in another process does not
// ask again. The stand-in gh records every call it receives, `version` included.
import childProcess, { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';
import { expect, it } from 'vitest';
import { refreshSharedMemory } from '../../../packages/box-bounty/chain.js';
import { postedFixture } from './github-fixture.js';
import { CLI_DIST } from './support.js';

it('a gh that passed the version probe is not probed again by the next command', () => postedFixture(({ repo, id, state }) => {
  const versionCalls = (): number => state().calls.filter(call => call[0] === 'version').length;
  const run = () => spawnSync(process.execPath, [CLI_DIST, 'bounty', 'status', id, '--comments'], { cwd: repo, encoding: 'utf8', env: process.env, timeout: 60000 });
  const before = versionCalls();
  expect(run().status).toBe(0);
  const first = versionCalls() - before;
  expect(first, 'the first command in a world probes once').toBe(1);
  expect(run().status).toBe(0);
  expect(run().status).toBe(0);
  expect(versionCalls() - before, 'the next two commands, in two more processes, ask nothing').toBe(first);
}));

// K71: the remote-tracking namespaces and the local ones were listed by two `for-each-ref` starts; one start now lists all four.
it('refreshing shared memory lists the chain refs with one for-each-ref start, however many namespaces it reads', () => postedFixture(({ repo }) => {
  const real = childProcess.spawnSync;
  const listings: string[][] = [];
  childProcess.spawnSync = ((command: string, args: readonly string[], options: never) => {
    if (basename(String(command)).toLowerCase().replace('.exe', '') === 'git' && (args ?? []).includes('for-each-ref')) listings.push([...args]);
    return (real as unknown as (...a: unknown[]) => unknown)(command, args, options);
  }) as typeof childProcess.spawnSync;
  syncBuiltinESMExports();
  try { refreshSharedMemory(repo); } finally { childProcess.spawnSync = real; syncBuiltinESMExports(); }
  expect(listings, 'one listing').toHaveLength(1);
  const patterns = listings[0]!.filter(arg => arg.startsWith('refs/box-bounty'));
  // K73: the old name is no longer read, so the one listing names the two record namespaces.
  expect(patterns.sort()).toEqual(['refs/box-bounty-records', 'refs/box-bounty-records-origin'].sort());
}));
