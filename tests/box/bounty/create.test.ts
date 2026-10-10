import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, finalizeBounty, planBounty, renderPreview } from '../../../packages/box-bounty/index.js';
import type { BountyManifest, CreateOptions } from '../../../packages/box-bounty/index.js';
import { git, listTree, makeRepo, runRoot, write } from './support.js';

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
    why: 'stuck after two approaches',
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
    expect(manifest.verification?.check?.result).toBe('fail');
    expect(manifest.verification?.check?.exit).toBe(1);
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
    // --why lives only in the record — never in bounty.json, the listing or
    // the shipped folder — so the reasons for handing off can be learned.
    const record = JSON.parse(readFileSync(result.recordPath, 'utf8')) as { why?: string };
    expect(record.why).toBe('stuck after two approaches');
    expect(JSON.stringify(manifest)).not.toContain('stuck after two approaches');
    expect(listing).not.toContain('stuck after two approaches');
  });

  // Host-only (K10): the declared setup spells the host's npm recipe 'npm.cmd',
  // and the command launcher refuses .cmd files off Windows by design — this is
  // a host-specific recipe, not a portable executable claim (station card, A4).
  it.skipIf(process.platform !== 'win32')('creates a mechanical bounty on a Node repository with npm setup', () => {
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
    expect(manifest.verification?.check?.result).toBe('fail');
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
    expect(readManifest(result.outDir).verification?.check?.exit).toBe(1);
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

  it('names a setup step that exits non-zero', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    try {
      finalizeBounty(planBounty(options(repo, {
        setup: ['node', '-e', 'process.exit(3)'],
        check: ['node', '-e', 'process.exit(1)']
      })));
      expect.unreachable('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      const refusal = error as BountyRefused;
      expect(refusal.reason).toBe('setup-failed');
      expect(refusal.message).toContain('exited 3');
    }
  });

  it('refuses an out directory that is not empty', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    const outDir = join(runRoot('out'), 'bounty');
    mkdirSync(outDir, { recursive: true });
    write(outDir, 'stale.txt', 'left behind\n');
    try {
      finalizeBounty(planBounty(options(repo, { outDir })));
      expect.unreachable('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect((error as BountyRefused).reason).toBe('out-dir-not-empty');
    }
    expect(readFileSync(join(outDir, 'stale.txt'), 'utf8')).toBe('left behind\n'); // untouched
  });

  it('refuses --out inside the repository, so a bounty folder can never ship inside the next', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    try {
      planBounty(options(repo, { outDir: join(repo, 'bounty-out') }));
      expect.unreachable('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect((error as BountyRefused).reason).toBe('out-inside-repo');
    }
  });

  it('refuses a negation line in .boxignore instead of silently ignoring it', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n', '.boxignore': '!keep-this.txt\n' });
    try {
      planBounty(options(repo));
      expect.unreachable('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect((error as BountyRefused).reason).toBe('invalid-boxignore');
    }
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
    const listing = readFileSync(join(result.outDir, 'README.md'), 'utf8');
    expect(listing).toContain('a person will read your answer');
    expect(listing).toContain('no `.git` and no history.\n\n## How you know you are done'); // sections stay separated
  });
});

describe('BT3b — fewer things to supply', () => {
  it('refuses create without --why by name — missing-why, never a usage wall', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    for (const why of [undefined, '   '] as (string | undefined)[]) {
      try {
        planBounty({ repoPath: repo, why: why ?? '', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'bounty') });
        expect.unreachable('expected refusal');
      } catch (error) {
        expect(error).toBeInstanceOf(BountyRefused);
        expect((error as BountyRefused).reason).toBe('missing-why');
      }
    }
  });

  it('derives the title from the task\'s first non-empty line; --title still wins', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    write(repo, 'TASK.md', '\n\n  Make the check pass.\nwith more detail below\n');
    const derived = planBounty({ repoPath: repo, why: 'w', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'b') });
    expect(derived.title).toBe('Make the check pass.');
    const blank = planBounty({ repoPath: repo, why: 'w', title: '   ', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'b2') });
    expect(blank.title).toBe('Make the check pass.');
    const given = planBounty({ repoPath: repo, why: 'w', title: 'given title', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'b3') });
    expect(given.title).toBe('given title');
  });

  it('writes to bounties/<slug-of-title> next to the repository when --out is absent', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n' });
    const plan = planBounty({ repoPath: repo, why: 'w', title: 'Make the check pass!', taskPath: join(repo, 'TASK.md') });
    const expected = join(realpathSync(dirname(repo)), 'bounties', 'make-the-check-pass');
    expect(plan.outDir).toBe(expected);
    expect(plan.outDir.startsWith(repo)).toBe(false); // outside the checkout
    const result = finalizeBounty(plan);
    expect(result.outDir).toBe(expected);
    expect(existsSync(join(expected, 'bounty.json'))).toBe(true);
  });

  it('composes the note from evidence when no --note is given: the failing check and the files changed so far', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', '.env': 'FAKE=made-up\n', 'TASK.md': 'the task\n' });
    // Uncommitted work is the evidence: a touched source file, a new task file,
    // and a never-ship file that must never be named inside the bounty.
    write(repo, 'src/app.py', 'y\n');
    write(repo, '.env', 'FAKE=changed\n');
    write(repo, 'NEW.md', 'uncommitted\n');
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
      check: ['node', '-e', 'console.log("still red"); process.exit(7)'],
      outDir: join(runRoot('out'), 'bounty')
    }));
    const manifest = readManifest(result.outDir);
    expect(manifest.note?.file).toBe('tool-written');
    const text = manifest.note?.text ?? '';
    expect(text).toContain('written by the tool');
    expect(text).toContain('exits 7');
    expect(text).toContain('still red');
    expect(text).toContain('src/app.py');
    expect(text).toContain('NEW.md');
    expect(text).not.toContain('.env'); // removed names never ship, even in the note
    const listing = readFileSync(join(result.outDir, 'README.md'), 'utf8');
    expect(listing).toContain('written by the tool');
  });

  it('never claims the working state matches the last commit when only never-ship paths differ', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'id_rsa': 'fake-key\n', 'TASK.md': 'the task\n' });
    write(repo, 'id_rsa', 'fake-key-changed\n'); // the only diff is a path that never ships
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
      outDir: join(runRoot('out'), 'bounty')
    }));
    const text = readManifest(result.outDir).note?.text ?? '';
    expect(text).not.toContain('matches the last commit');
    expect(text).not.toContain('id_rsa'); // the name still never ships
  });

  it('names a file the working state deleted instead of claiming the tree matches the last commit', () => {
    const repo = makeRepo({ 'a.py': 'a\n', 'b.py': 'b\n', '.env': 'FAKE=made-up\n', 'TASK.md': 'the task\n' });
    rmSync(join(repo, 'b.py'));
    rmSync(join(repo, '.env')); // a deleted never-ship path: real, but never named
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
      outDir: join(runRoot('out'), 'bounty')
    }));
    const text = readManifest(result.outDir).note?.text ?? '';
    expect(text).not.toContain('matches the last commit');
    expect(text).toContain('b.py (deleted)');
    expect(text).not.toContain('.env');
  });

  it('names the shipped file a rename folded out of the diff instead of claiming only non-shipping paths differ', () => {
    const repo = makeRepo({ 'a.py': 'a\n', 'TASK.md': 'the task\n' }, (repo) => {
      // `git mv a.py .env` is a delete+add pair git pairs by similarity:
      // --name-only emits only `.env`, folding the shipped file away entirely.
      git(repo, ['mv', 'a.py', '.env']);
    });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
      outDir: join(runRoot('out'), 'bounty')
    }));
    const text = readManifest(result.outDir).note?.text ?? '';
    expect(text).not.toContain('only in files that do not ship'); // a.py shipped in the base — its loss is real change
    expect(text).toContain('a.py (deleted)'); // the folded-away rename source is still reported
    expect(text).not.toContain('.env'); // the rename target is a never-ship name — never inside the bounty
  });

  // Host-only (K10): junctions are invisible to git on Windows, so git tracks
  // jdir/f.py under that spelling while shipping emits the canonical
  // realdir/f.py — the note must classify the canonical path, not the spelling.
  it.skipIf(process.platform !== 'win32')('classifies a junction-spelled tracked file by the canonical path it ships under', () => {
    const repo = makeRepo({ '.gitignore': 'realdir/\n', 'TASK.md': 'the task\n' }, (repo) => {
      write(repo, 'realdir/f.py', 'x\n');
      symlinkSync(join(repo, 'realdir'), join(repo, 'jdir'), 'junction');
      git(repo, ['add', 'jdir/f.py']); // git records the junction spelling
      git(repo, ['-c', 'user.name=bt1-test', '-c', 'user.email=bt1@test.invalid', 'commit', '-qm', 'track the junction spelling']);
    });
    write(repo, 'realdir/f.py', 'x2\n'); // the changed bytes ship under the canonical name
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
      outDir: join(runRoot('out'), 'bounty')
    }));
    const manifest = readManifest(result.outDir);
    expect(manifest.files.map(file => file.path)).toContain('realdir/f.py'); // it ships, canonically
    const text = manifest.note?.text ?? '';
    expect(text).toContain('realdir/f.py'); // named under the path it ships as
    expect(text).not.toContain('jdir'); // the spelling is not what shipped — never named
    expect(text).not.toContain('only in files that do not ship');
  });

  it('labels a moved submodule HEAD as a submodule change, never a deleted file', () => {
    const sub = makeRepo({ 's.py': 's\n' });
    const repo = makeRepo({ 'TASK.md': 'the task\n' }, (repo) => {
      git(repo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub.split('\\').join('/'), 'sub']);
      git(repo, ['-c', 'user.name=bt1-test', '-c', 'user.email=bt1@test.invalid', 'commit', '-qm', 'add submodule']);
    });
    // Move the submodule's HEAD: the gitlink changes but no blob does. A
    // gitlink is never a blob in the snapshot tree, so it must not read as a
    // deletion.
    write(join(repo, 'sub'), 's.py', 's2\n');
    git(join(repo, 'sub'), ['add', '-A']);
    git(join(repo, 'sub'), ['-c', 'user.name=bt1-test', '-c', 'user.email=bt1@test.invalid', 'commit', '-qm', 's2']);
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
      outDir: join(runRoot('out'), 'bounty')
    }));
    const text = readManifest(result.outDir).note?.text ?? '';
    expect(text).toContain('sub (submodule changed)');
    expect(text).not.toContain('sub (deleted)');
  });

  it('a repo with nothing to report gets a plain note, not an error', () => {
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'the task\n' });
    const result = finalizeBounty(planBounty({
      repoPath: repo,
      why: 'w',
      taskPath: join(repo, 'TASK.md'),
      outDir: join(runRoot('out'), 'bounty')
    }));
    const text = readManifest(result.outDir).note?.text ?? '';
    expect(text).toContain('written by the tool');
    expect(text).toContain('nothing else to report');
  });

  // Host-only (K10): junction semantics exist only on Windows — the same class
  // the pass proved against post --to in BT2, here against --out.
  it.skipIf(process.platform !== 'win32')('refuses --out under a junction pointing into the repository — a nonexistent tail cannot slip the check', () => {
    const repo = repoWithTask({ 'src/x.py': 'x\n', 'target/.keep': 'x\n' });
    const link = join(runRoot('link'), 'via-junction');
    symlinkSync(join(repo, 'target'), link, 'junction');
    try {
      // link/sub does not exist — only the junction ancestor does.
      planBounty(options(repo, { outDir: join(link, 'sub') }));
      expect.unreachable('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect((error as BountyRefused).reason).toBe('out-inside-repo');
    }
  });
});
