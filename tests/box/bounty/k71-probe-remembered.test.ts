// K71: the `gh version` probe was one process start in every command that reaches GitHub. A gh that passed it is remembered in the
// project's local store (keyed by its path, stamped by its size and modification time), so a later command in another process does not
// ask again. The stand-in gh records every call it receives, `version` included.
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
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
