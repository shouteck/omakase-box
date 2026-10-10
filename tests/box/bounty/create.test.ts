import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, finalizeBounty, planBounty, renderPreview } from '../../../packages/box-bounty/index.js';
import type { BountyManifest, CreateOptions } from '../../../packages/box-bounty/index.js';
import { listTree, makeRepo, runRoot, write } from './support.js';

// The create flow end to end: preview first, the check really run inside a clean
// copy of the snapshot, a passing check refused, and every outcome named.

function repoWithTask(files: Record<string, string>): string {
  const repo = makeRepo(files);
  write(repo, 'TASK.md', 'Make the check pass.\n');
  return repo;
}

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  return {
    repoPath: repo,
    title: 'make the check pass',
    taskPath: join(repo, 'TASK.md'),
    outDir: join(runRoot('out'), 'bounty'),
    ...extra
  };
}

const readManifest = (outDir: string): BountyManifest => JSON.parse(readFileSync(join(outDir, 'bounty.json'), 'utf8')) as BountyManifest;

describe('bounty create end to end', () => {
  it('creates a complete mechanical bounty on a Python repository', () => {
    const repo = repoWithTask({
      'app/main.py': 'def greet():\n    return "hi"\n',
      'check.py': 'import sys\nsys.exit(1)\n',
      'NOTE.md': 'I tried renaming; still red.\n'
    });
    const outDir = join(runRoot('out'), 'bounty');
    const plan = planBounty(options(repo, { check: ['python', 'check.py'], notePath: join(repo, 'NOTE.md'), outDir }));
    const preview = renderPreview(plan);
    expect(preview).toContain('would ship:');
    expect(preview).toContain('check: python check.py');
    expect(preview).toContain('level: mechanical');
    expect(preview).toContain(outDir);
    const result = finalizeBounty(plan);
    expect(result.id).toMatch(/^bt-[a-f0-9]{12}$/);
    const manifest = readManifest(result.outDir);
    expect(manifest.kind).toBe('box-bounty');
    expect(manifest.title).toBe('make the check pass');
    expect(manifest.level).toBe('mechanical');
    expect(manifest.task.text).toContain('Make the check pass');
    expect(manifest.note?.text).toContain('still red');
    expect(manifest.check).toEqual({ argv: ['python', 'check.py'] });
    expect(manifest.snapshot.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(manifest.verification?.check.result).toBe('fail');
    expect(manifest.verification?.check.exit).toBe(1);
    expect(manifest.files.map(file => file.path)).toContain('app/main.py');
    const entry = manifest.files.find(file => file.path === 'check.py');
    expect(entry?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.counts.files).toBe(manifest.files.length);
    const listing = readFileSync(join(result.outDir, 'README.md'), 'utf8');
    expect(listing).toContain('# Bounty: make the check pass');
    expect(listing).toContain('What is wanted');
    expect(listing).toContain('still red');
    expect(listing).toContain('exits 1');
    expect(listTree(result.outDir)).toEqual(expect.arrayContaining(['README.md', 'bounty.json', 'repo/check.py', 'repo/app/main.py']));
  });

  it('creates a mechanical bounty on a Node repository with npm setup', () => {
    const repo = repoWithTask({
      'package.json': JSON.stringify({ name: 'node-fixture', version: '1.0.0', scripts: { test: 'node check.js' } }) + '\n',
      'check.js': 'process.exit(1)\n',
      'src/index.js': 'export const x = 1;\n'
    });
    const result = finalizeBounty(planBounty(options(repo, {
      setup: ['npm.cmd', 'install', '--ignore-scripts'],
      check: ['node', 'check.js']
    })));
    const manifest = readManifest(result.outDir);
    expect(manifest.verification?.setup).toHaveLength(1);
    expect(manifest.verification?.setup[0]?.result).toBe('pass');
    expect(manifest.verification?.check.result).toBe('fail');
  });

  it('proves setup runs before the check inside the snapshot copy', () => {
    // The check fails BECAUSE setup ran: it exits 1 only when the marker setup
    // wrote exists. If setup had not run, the check would pass and create would
    // refuse — so a created bounty is proof of ordering.
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    const result = finalizeBounty(planBounty(options(repo, {
      setup: ['node', '-e', 'require("node:fs").writeFileSync("prepped.txt","1")'],
      check: ['node', '-e', 'process.exit(require("node:fs").existsSync("prepped.txt") ? 1 : 0)']
    })));
    expect(readManifest(result.outDir).verification?.check.exit).toBe(1);
  });

  it('refuses a check that already passes and leaves no folder', () => {
    const repo = repoWithTask({ 'check.py': 'import sys\nsys.exit(0)\n' });
    const outDir = join(runRoot('out'), 'bounty');
    const plan = planBounty(options(repo, { check: ['python', 'check.py'], outDir }));
    try {
      finalizeBounty(plan);
      expect.unreachable('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      const refusal = error as BountyRefused;
      expect(refusal.reason).toBe('check-already-passes');
      expect(refusal.message).toContain('nothing to solve');
    }
    expect(existsSync(outDir)).toBe(false);
  });

  it('names the program when the check cannot run', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    try {
      finalizeBounty(planBounty(options(repo, { check: ['definitely-not-a-real-program-bt1', 'x'] })));
      expect.unreachable('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      const refusal = error as BountyRefused;
      expect(refusal.reason).toBe('check-unrunnable');
      expect(refusal.message).toContain('definitely-not-a-real-program-bt1');
    }
  });

  it('creates a reviewed bounty when no check is given, and the listing says a person reads the answer', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    const result = finalizeBounty(planBounty(options(repo)));
    const manifest = readManifest(result.outDir);
    expect(manifest.level).toBe('reviewed');
    expect(manifest.verification).toBeNull();
    expect(readFileSync(join(result.outDir, 'README.md'), 'utf8')).toContain('a person will read your answer');
  });
});
