import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../../packages/box-bounty/index.js';
import { ROOT } from './support.js';

const BS = String.fromCharCode(92);

// Guard: no tracked test file may hold bytes the tool's own pre-publish scan
// would read as a secret. Planted fixture values are built at run time from
// parts precisely so this file and its siblings never carry a contiguous
// secret-shaped literal — the wave's first push was rejected over exactly
// that. A new literal fails here naming file:line before it can be pushed.
describe('the test suite carries no secret-shaped literal of its own', () => {
  it('scanText finds nothing in the tracked files under tests/', () => {
    const root = ROOT.replaceAll(BS, '/').replace(/\/+$/, '');
    const listed = spawnSync('git', ['-c', `safe.directory=${root}`, 'ls-files', '-z', 'tests/'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    expect(listed.status, listed.stderr).toBe(0);
    const hits = listed.stdout.split('\0').filter(Boolean)
      .flatMap(path => scanText(path, readFileSync(join(ROOT, ...path.split('/')), 'utf8')));
    expect(hits.map(hit => `${hit.path}:${hit.line} ${hit.rule}`)).toEqual([]);
  });
});
