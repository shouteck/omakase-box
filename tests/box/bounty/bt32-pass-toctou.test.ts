// BT32 pass TOCTOU probe — the independent pass's check/use attack on the
// corrected provenance gate. pushChain verifies the proven tip, then pushes
// the ref NAME `refs/box-bounty/<id>` — git resolves the CURRENT ref inside
// the push, not the sha that was just proven. A local process that can move
// the ref between the check and the push (the same attacker who plants a
// local ref, now racing the spawn boundary) launders an unproven commit and
// gets it recorded as this machine's `chain_pushed:` tip.
//
// The seam is the suite's own spawn boundary (github-fixture's transport
// Proxy rewrites the remote URL there): this hook swaps the ref at exactly
// the moment `git push` is spawned — the winning end of the race, made
// deterministic. It uses execFileSync for the swap so the hook cannot
// intercept its own move.
import childProcess, { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadRecord, renderStatus, shareClosed, sharedRead, syncChains } from '../../../packages/box-bounty/index.js';
import { sharedPostedFixture } from './github-fixture.js';
import { join } from 'node:path';
import { runRoot } from './support.js';

const MARKER = 'PROBE-TOCTOU-NEVER-PUBLISHED-2c9a';

const bareTip = (bare: string, id: string): string | null => {
  const out = execFileSync('git', ['-c', `safe.directory=${bare}`, 'ls-remote', bare, `refs/box-bounty/${id}`], { encoding: 'utf8' }).trim();
  return out === '' ? null : out.split('\t')[0]!;
};

describe('BT32 pass TOCTOU probe', { timeout: 120000 }, () => {
  it('the push publishes the proven sha, never whatever the ref says at push time', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const id = world.id;
      const refname = `refs/box-bounty/${id}`;
      const remoteTip = bareTip(world.bare, id);
      expect(remoteTip, 'fixture is not posted — setup failed').not.toBeNull();
      // The attacker's forged commit: a well-formed event (never scanned —
      // it was never tool-authored), a fast-forward child of the remote tip
      // so the push is accepted cleanly.
      const forgedEvent = JSON.stringify({ v: 1, type: 'closed', at: '2026-10-18T02:00:00.000Z', actor: 'stranger', kind: 'withdrawn', reason: MARKER }) + '\n';
      const blobSha = execFileSync('git', ['-C', world.repo, 'hash-object', '-w', '--stdin'], { input: forgedEvent, encoding: 'utf8' }).trim();
      const tree = execFileSync('git', ['-C', world.repo, 'mktree'], { input: `100644 blob ${blobSha}\tevent.json\n`, encoding: 'utf8' }).trim();
      const forged = execFileSync('git', ['-C', world.repo, '-c', 'user.name=x', '-c', 'user.email=x@x', 'commit-tree', tree, '-m', 'forged', '-p', remoteTip!], { encoding: 'utf8' }).trim();

      // Race hook: at the instant the tool spawns `git push <url> <ref>:<ref>`,
      // the local ref is moved to the forged tip — the check already passed on
      // the authored sha. execFileSync bypasses the patched spawnSync.
      const inner = childProcess.spawnSync;
      let swapped = 0;
      const hooked = new Proxy(inner, {
        apply(target, receiver, args) {
          const argv = Array.isArray(args[1]) ? (args[1] as string[]) : [];
          const isPush = argv.includes('push') && argv.some(a => String(a).trim() === `${refname}:${refname}`);
          if (isPush) {
            execFileSync('git', ['-C', world.repo, 'update-ref', refname, forged], { encoding: 'utf8' });
            swapped += 1;
          }
          return Reflect.apply(target, receiver, args);
        }
      });
      childProcess.spawnSync = hooked;
      syncBuiltinESMExports();
      try {
        // A legitimate milestone: the tool authors a closed event and pushes.
        shareClosed(world.repo, loadRecord(world.repo, id), 'rejected', 'not needed', false);
      } finally {
        childProcess.spawnSync = inner;
        syncBuiltinESMExports();
      }
      expect(swapped, 'the push seam was never reached — probe did not exercise the path').toBeGreaterThan(0);
      const after = bareTip(world.bare, id);
      // Contract: the remote holds the tool-authored tip, never the swapped
      // forged sha. On the unfixed refname-push this is F itself.
      expect(after, `forged commit reached the remote through the check/use gap: ${after}`).not.toBe(forged);
      expect(after, 'the authored event was not published either').not.toBeNull();
      // The laundering completes on the next fetch: a second machine adopts
      // the forged tip as remote-trusted and the unscanned text renders.
      const other = join(runRoot('bt32-toctou-machine-b'), 'repo');
      execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, other], { encoding: 'utf8' });
      execFileSync('git', ['-c', `safe.directory=${other}`, '-C', other, 'remote', 'set-url', 'origin', 'git@github.com:owner/project.git'], { encoding: 'utf8' });
      syncChains(other, true);
      const row = sharedRead(other, id);
      expect(row === null || !JSON.stringify(row).includes(MARKER), 'the swapped forged event was imported and stored by another machine').toBe(true);
      expect(renderStatus(other), 'the forged text is shown on another machine').not.toContain(MARKER);
    }); }
  });
});
