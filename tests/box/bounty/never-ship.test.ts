import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, finalizeBounty, planBounty } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { listTree, makeRepo, runRoot, write } from './support.js';

// Never-ship is attacked on each file's real path: tracked, untracked, case-aliased,
// reached through a link or junction, nested, and owner-listed. A link that points
// outside the repository is refused by name, never followed. Every secret here is
// made-up bytes written at run time — nothing real is read or shipped.

function options(repo: string): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, title: 'a task', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'bounty') };
}

function ship(files: Record<string, string>, mutate?: (repo: string) => void): { shipped: string[]; plan: ReturnType<typeof planBounty>; outDir: string } {
  const repo = makeRepo({ 'src/app.py': 'x\n', ...files }, mutate);
  const plan = planBounty(options(repo));
  const result = finalizeBounty(plan);
  return { shipped: listTree(join(result.outDir, 'repo')), plan, outDir: result.outDir };
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

  it('removes a secret reached through a junction inside the repository', () => {
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

  it('refuses a link that points outside the repository, by name, without following it', () => {
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
    const manifest = readFileSync(join(result.outDir, 'bounty.json'), 'utf8');
    const listing = readFileSync(join(result.outDir, 'README.md'), 'utf8');
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
});
