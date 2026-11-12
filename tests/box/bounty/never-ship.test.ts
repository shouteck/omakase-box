import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, finalizeBounty, loadRecord, planBounty } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { listTree, makeRepo, runRoot, write } from './support.js';

// Never-ship is attacked on each file's real path: tracked, untracked, case-aliased,
// reached through a link or junction, nested, and owner-listed. A link that points
// outside the repository is refused by name, never followed. Every secret here is
// made-up bytes written at run time — nothing real is read or shipped.

// Host-only marks (K10): junction semantics exist only on Windows. A junction is
// transparent to git and the filesystem scan — the target's paths enumerate
// under the link's spelling — while a Linux symlink stays a visible link and is
// refused earlier, still a refusal but under a different named reason. The two
// junction tests below assert the Windows behavior itself, so they run only
// where junctions exist.
const junctions = process.platform === 'win32';

function options(repo: string): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), };
}

function ship(files: Record<string, string>, mutate?: (repo: string) => void): { shipped: string[]; plan: ReturnType<typeof planBounty> } {
  const repo = makeRepo({ 'src/app.py': 'x\n', ...files }, mutate);
  const plan = planBounty(options(repo));
  const result = finalizeBounty(plan);
  return { shipped: result.plan.files.map(file => file.path).sort(), plan };
}

describe('never-ship holds against hostile paths', () => {

  // Host-only: needs a real junction — on Linux the link stays a link and the
  // snapshot refuses it as 'unreadable-path' before never-ship rules run.
  // @guards C1
  it.skipIf(!junctions)('removes a secret reached through a junction inside the repository', () => {
    const { shipped, plan } = ship({ 'secrets/real.key': 'fake-junction-key\n' }, repo => {
      // A junction is a directory link any Windows user can create; git traverses
      // it, so alias/real.key enumerates — only the real path decides what ships.
      symlinkSync(join(repo, 'secrets'), join(repo, 'alias'), 'junction');
    });
    expect(shipped).not.toContain('alias/real.key');
    expect(shipped).not.toContain('secrets/real.key');
    expect(plan.ruleRemovals).toEqual([{ rule: 'secrets-dir', removed: 1, paths: ['secrets/real.key'] }]);
  });

  // Host-only: the 'link-escape' name requires the junction to be traversed far
  // enough to see 'escape/loot.txt' — on Linux the link is refused first as
  // 'unreadable-path' (a refusal either way; the named reason is the platform's).
  it.skipIf(!junctions)('refuses a link that points outside the repository, by name, without following it', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const outside = runRoot('outside');
    write(outside, 'loot.txt', 'outside-bytes\n');
    symlinkSync(outside, join(repo, 'escape'), 'junction');
    try {
      planBounty(options(repo));
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      const refusal = error as BountyRefused;
      expect(refusal.reason).toBe('link-escape');
      expect(refusal.message).toContain('escape/loot.txt');
    }
  });

  // @guards C1
  it('never names a removed file inside the bounty folder', () => {
    const repo = makeRepo({
      'src/app.py': 'x\n',
      'secrets/unpronounceable-name.key': 'fake\n',
      '.boxignore': 'classified/\n',
      'classified/inner.txt': 'fake\n'
    });
    const result = finalizeBounty(planBounty(options(repo)));
    const manifest = JSON.stringify({ note: loadRecord(repo, result.id).content?.note, neverShip: result.plan.ruleRemovals.map(({ rule, removed }) => ({ rule, removed })) });
    const listing = JSON.stringify(loadRecord(repo, result.id).content);
    for (const name of ['unpronounceable-name', 'classified', 'inner.txt']) {
      expect(manifest).not.toContain(name);
      expect(listing).not.toContain(name);
    }
    const parsed = JSON.parse(manifest);
    expect(parsed.neverShip).toEqual(
      expect.arrayContaining([
        { rule: 'secrets-dir', removed: 1 },
        { rule: 'owner-list', removed: 1 }
      ])
    );
  });

  // @guards C1
  it('refuses a --task path the never-ship rules would remove', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    write(repo, '.env', 'FAKE_TOKEN=made-up\n');
    write(repo, 'TASK.md', 'the task\n');
    const base = { repoPath: repo, why: 'a reason', title: 'a task', };
    for (const options of [
      { ...base, taskPath: join(repo, '.env') },
    ]) {
      try {
        planBounty(options);
        expect.unreachable('expected a refusal');
      } catch (error) {
        expect(error).toBeInstanceOf(BountyRefused);
        const refusal = error as BountyRefused;
        expect(refusal.reason).toBe('never-ship-input');
        expect(refusal.message).toContain('dot-env');
      }
    }
  });

  // @guards C1
  it('refuses a never-ship --task even when it lives outside the repository', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const outside = runRoot('outside');
    write(outside, '.env', 'FAKE_TOKEN=made-up\n');
    try {
      planBounty({ repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(outside, '.env'), });
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect((error as BountyRefused).reason).toBe('never-ship-input');
    }
  });
});
