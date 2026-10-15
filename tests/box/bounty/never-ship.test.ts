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
  it('removes a secret that is tracked', () => {
    const { shipped, plan } = ship({ 'secrets/api.key': 'fake-tracked-key\n' });
    expect(shipped).not.toContain('secrets/api.key');
    expect(plan.ruleRemovals).toEqual([{ rule: 'secrets-dir', removed: 1, paths: ['secrets/api.key'] }]);
  });

  it('removes an untracked secret', () => {
    const { shipped, plan } = ship({}, repo => write(repo, 'token.pem', 'fake-untracked\n'));
    expect(shipped).not.toContain('token.pem');
    expect(plan.ruleRemovals).toEqual([{ rule: 'private-key', removed: 1, paths: ['token.pem'] }]);
  });

  it('removes a secret reached through a different letter case', () => {
    const { shipped, plan } = ship({}, repo => {
      write(repo, 'SECRETS/Api.KEY', 'fake-case\n');
      write(repo, '.ENV', 'fake-env\n');
      write(repo, 'config/.Env.Production', 'fake-env2\n');
      write(repo, 'UPPER/key.PEM', 'fake-pem\n');
    });
    const lowered = shipped.map(path => path.toLowerCase());
    expect(lowered.some(path => path.includes('secrets/') || path.includes('/.env') || path === '.env' || path.endsWith('.pem'))).toBe(false);
    const rules = plan.ruleRemovals.map(entry => entry.rule);
    expect(rules).toContain('secrets-dir');
    expect(rules).toContain('dot-env');
    expect(rules).toContain('private-key');
  });

  // Host-only: needs a real junction — on Linux the link stays a link and the
  // snapshot refuses it as 'unreadable-path' before never-ship rules run.
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

  it('removes a secret in a nested folder', () => {
    const { shipped } = ship({ 'a/b/c/deep/.env.local': 'fake-nested\n', 'a/b/c/deep/notes.txt': 'ok\n' });
    expect(shipped).toContain('a/b/c/deep/notes.txt');
    expect(shipped).not.toContain('a/b/c/deep/.env.local');
  });

  it('removes what only the owner list matches', () => {
    const { shipped, plan } = ship({
      'proprietary/algo.py': 'fake-proprietary\n',
      'licenses/dataset.lic': 'fake-license\n',
      '.boxignore': '# keep these inside\nproprietary/\n*.lic\n'
    });
    expect(shipped).not.toContain('proprietary/algo.py');
    expect(shipped).not.toContain('licenses/dataset.lic');
    expect(shipped).toContain('.boxignore');
    expect(plan.ruleRemovals).toEqual([{ rule: 'owner-list', removed: 2, paths: ['licenses/dataset.lic', 'proprietary/algo.py'] }]);
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

  it('catches credential stores and key-material spellings', () => {
    const { shipped } = ship({
      '.aws/credentials': 'fake\n',
      '.npmrc': '//registry/:_authToken=fake\n',
      'keys/id_ed25519': 'fake\n',
      'keys/id_rsa.pub': 'fake\n',
      'tls/server.crt': 'fake\n',
      'tls/server.cer': 'fake\n',
      'store/p12bundle.p12': 'fake\n',
      'notes.txt': 'keep\n'
    });
    expect(shipped).toEqual(['TASK.md', 'notes.txt', 'src/app.py']);
  });

  it('catches env-file suffixes, key backups, cert bundles and secrets-dir variants', () => {
    const { shipped } = ship({
      'prod.env': 'fake\n',
      'config/staging.env': 'fake\n',
      'id_rsa_backup': 'fake\n',
      'keys/id_rsa.old': 'fake\n',
      '.yarnrc': 'fake\n',
      '.yarnrc.yml': 'fake\n',
      'tls/ca.cert': 'fake\n',
      'tls/bundle.p7b': 'fake\n',
      'tls/bundle.p7c': 'fake\n',
      'tls/material.asc': 'fake\n',
      'secrets-backup/api.txt': 'fake\n',
      'mysecrets/db.txt': 'fake\n',
      'secretary/minutes.txt': 'kept — plural-only rule must not hit ordinary words\n'
    });
    expect(shipped).toEqual(['TASK.md', 'secretary/minutes.txt', 'src/app.py']);
  });

  it('folds owner-list patterns before matching, on both sides', () => {
    const { shipped, plan } = ship({
      'secretdir/inside.txt': 'fake\n',
      'data/file.key2': 'fake\n',
      '.boxignore': 'SecretDir/\n*.KEY2\n',
      'open.txt': 'keep\n'
    });
    expect(shipped).toEqual(['.boxignore', 'TASK.md', 'open.txt', 'src/app.py']);
    expect(plan.ruleRemovals).toEqual([{ rule: 'owner-list', removed: 2, paths: ['data/file.key2', 'secretdir/inside.txt'] }]);
  });

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
