// BT55: a file's name cannot break the tool. Two faults a solver's file name can cause, both from BACKLOG:
// (1) `ls-tree --format=%(path)` still quotes a name that holds a quote character even under -z (Git 2.43 and 2.45 both do), so one
//     merged file named a"b.txt made every later `create` refuse `unreadable-path` on Linux and macOS (Git refuses such a name on
//     Windows, so the command-level test cannot run there); the listing parser is tested on every system through a commit built by
//     plumbing, which needs no working-tree file;
// (2) on Windows a refused merge could leave a solver's non-ASCII file behind in the owner's tree (`rmSync` on Node 24.11.0).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBounty, finalizeBounty, planBounty } from '../../../packages/box-bounty/index.js';
import { parseTreeListing } from '../../../packages/box-bounty/git.js';
import { applyGitHub, collectPullRequest, postToGitHub } from './github-solver.js';
import { fingerprint, git, makeRepo, ownerSays, runRoot, write } from './support.js';

/** A commit whose tree holds these names, built by plumbing: no working-tree file, so a name the file system refuses still works. */
function commitWithNames(repo: string, names: readonly string[]): string {
  const blob = spawnSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: 'content\n', encoding: 'utf8' }).stdout.trim();
  const head = git(repo, ['rev-parse', 'HEAD^{tree}']);
  const existing = spawnSync('git', ['-C', repo, 'ls-tree', '-z', head], { encoding: 'utf8' }).stdout;
  const records = `${existing}${names.map(name => `100644 blob ${blob}\t${name}\0`).join('')}`;
  const tree = spawnSync('git', ['-C', repo, 'mktree', '-z'], { input: records, encoding: 'utf8' }).stdout.trim();
  return git(repo, ['-c', 'user.name=bt55', '-c', 'user.email=bt55@test.invalid', 'commit-tree', tree, '-p', 'HEAD', '-m', 'names']);
}

describe('BT55 fault 1: a quote in a name stops every later create', () => {
  const NAMES = ['a"b.txt', 'with space.txt', 'tab\there.txt', 'new\nline.txt', 'café.txt', 'back\\slash.txt', '"quoted".txt'];

  it('A. the listing parser returns every name exactly, with its type and size, on every system', () => {
    const repo = makeRepo({ 'plain.txt': 'x\n' });
    const commit = commitWithNames(repo, NAMES);
    const listing = spawnSync('git', ['-C', repo, '-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', '-l', commit], { encoding: 'utf8' }).stdout;
    const entries = parseTreeListing(listing);
    expect(entries.map(entry => entry.path).sort()).toEqual([...NAMES, 'plain.txt'].sort());
    for (const entry of entries) {
      expect(entry.type, entry.path).toBe('blob');
      expect(entry.size, entry.path).toBe(entry.path === 'plain.txt' ? 2 : 8);
    }
  });

  it('A2. a gitlink and a size column wider than the blobs are read as they are', () => {
    const entries = parseTreeListing(`160000 commit ${'a'.repeat(40)}       -\tsub\u0000100644 blob ${'b'.repeat(40)}  123456\tbig file.bin\u0000`);
    expect(entries).toEqual([{ type: 'commit', size: null, path: 'sub' }, { type: 'blob', size: 123456, path: 'big file.bin' }]);
  });

  // Git refuses a name holding a quote on Windows (NTFS), so this runs where the file can exist: Linux and macOS.
  it.skipIf(process.platform === 'win32')('1. create succeeds once a file named a"b.txt is committed (on master it refuses unreadable-path)', () => {
    const repo = makeRepo({ 'plain.txt': 'x\n', 'TASK.md': 'task\n' });
    write(repo, 'a"b.txt', 'quoted\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=bt55', '-c', 'user.email=bt55@test.invalid', 'commit', '-qm', 'a quoted name']);
    const created = createBounty({ repoPath: repo, why: 'a reason', taskPath: join(repo, 'TASK.md') });
    expect(created.id).toMatch(/^bt-[a-f\d]{12}$/);
  });

  it.skipIf(process.platform === 'win32')('2. create with a working-tree change still succeeds with that file committed (snapshot.ts reads the same listing)', () => {
    const repo = makeRepo({ 'plain.txt': 'x\n', 'TASK.md': 'task\n' });
    write(repo, 'a"b.txt', 'quoted\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=bt55', '-c', 'user.email=bt55@test.invalid', 'commit', '-qm', 'a quoted name']);
    write(repo, 'plain.txt', 'changed\n');
    const plan = planBounty({ repoPath: repo, why: 'a reason', taskPath: join(repo, 'TASK.md') });
    expect(finalizeBounty(plan).id).toMatch(/^bt-/);
    expect(plan.files.map(file => file.path)).toContain('a"b.txt');
  });
});

describe('BT55 fault 2: a refused merge leaves nothing of the solution in the owner\'s tree', () => {
  it('3. a refused apply whose solution adds a non-ASCII file and a non-ASCII folder leaves the worktree and git status as before', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    write(repo, 'TASK.md', 'the task\n');
    ownerSays(repo, 'allowed');
    const result = finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md') }));
    const { destination } = postToGitHub(repo, result.id);
    // The repository moved on while the bounty was out, on the same lines: the solution will conflict.
    write(repo, 'src/app.py', 'moved on\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=bt55', '-c', 'user.email=bt55@test.invalid', 'commit', '-qm', 'moved on']);
    // The tool's own summary files under .box/ are not the solution's: status is compared without them.
    const owners = (status: string): string => status.split(String.fromCharCode(10)).filter(line => !line.includes('.box/')).join(String.fromCharCode(10));
    const before = { head: git(repo, ['rev-parse', 'HEAD']), status: owners(git(repo, ['status', '--porcelain'])), index: git(repo, ['ls-files', '--stage']), files: fingerprint(repo).files };

    const dir = join(runRoot('bt55-returned'), 'returned');
    cpSync(destination, dir, { recursive: true });
    write(dir, 'repo/src/app.py', 'fixed\n');
    write(dir, 'repo/café.txt', 'a non-ASCII file\n');
    write(dir, 'repo/папка/файл.txt', 'a file in a non-ASCII folder\n');
    collectPullRequest(repo, result.id, dir);

    expect(applyGitHub(repo, result.id).outcome).toBe('conflict');
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(before.head);
    expect(git(repo, ['ls-files', '--stage'])).toBe(before.index);
    expect(owners(git(repo, ['status', '--porcelain'])), 'git status moved').toBe(before.status);
    expect(fingerprint(repo).files, 'a file of the solution stayed in the owner\'s tree').toEqual(before.files);
    expect(existsSync(join(repo, 'café.txt')), 'café.txt stayed').toBe(false);
    expect(existsSync(join(repo, 'папка')), 'папка stayed').toBe(false);
  });
});
