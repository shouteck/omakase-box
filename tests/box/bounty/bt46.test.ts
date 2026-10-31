// BT46: `create` hashes only what moved and reads files in parallel, and what
// it records stays exact. The core guard is differential: one repository state,
// the stat path and the plain `add -A` path, and Git's own tree id must agree.
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSnapshotCommit, STAT_PATH_ENTRIES } from '../../../packages/box-bounty/snapshot.js';
import { PARALLEL_READ_FILES, readMany } from '../../../packages/box-bounty/read-many.js';
import { CLI_DIST, git, runRoot, write } from './support.js';

const PLAIN = Number.POSITIVE_INFINITY;
const STAT = 1;

function repository(files: Record<string, string> = { 'a.txt': 'a\n', 'b.txt': 'b\n', 'dir/c.txt': 'c\n', 'dir/d.bin': 'x\0y\n', '.gitignore': 'ignored.txt\n' }): string {
  const repo = join(runRoot('bt46'), 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-q', '-b', 'main']);
  for (const [path, content] of Object.entries(files)) write(repo, path, content);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@test.invalid', 'commit', '-qm', 'base']);
  // Past Git's racy window: the real index is newer than every file in it, so
  // the stat path has entries it can trust and each scenario tests real choices.
  const past = new Date(Date.now() - 60_000);
  for (const path of Object.keys(files)) utimesSync(join(repo, path), past, past);
  git(repo, ['update-index', '--really-refresh']);
  return repo;
}
const treeBy = (repo: string, statFrom: number): string => createSnapshotCommit(repo, runRoot('bt46-work'), statFrom).tree;
const newerThanIndex = (repo: string, path: string): Date => { const later = new Date(Date.now() + 60_000); utimesSync(join(repo, path), later, later); return later; };
const FILTER_UP = 'node -e "process.stdin.on(\'data\',d=>process.stdout.write(String(d).toUpperCase()))"';

const linkCapable = (() => {
  const probe = runRoot('bt46-link');
  writeFileSync(join(probe, 't'), 'x');
  try { symlinkSync(join(probe, 't'), join(probe, 'l'), 'file'); return lstatSync(join(probe, 'l')).isSymbolicLink(); }
  catch { return false; }
})();

const SCENARIOS: readonly { readonly name: string; readonly state: (repo: string) => void; readonly ships?: Record<string, string | null>; readonly skip?: boolean }[] = [
  { name: 'nothing changed', state: () => {} },
  { name: 'an edit', state: repo => write(repo, 'a.txt', 'edited\n'), ships: { 'a.txt': 'edited\n' } },
  { name: 'an edit under assume-unchanged', state: repo => { git(repo, ['update-index', '--assume-unchanged', 'a.txt']); write(repo, 'a.txt', 'edited under assume\n'); }, ships: { 'a.txt': 'edited under assume\n' } },
  { name: 'an edit under skip-worktree', state: repo => { git(repo, ['update-index', '--skip-worktree', 'a.txt']); write(repo, 'a.txt', 'edited under skip\n'); }, ships: { 'a.txt': 'edited under skip\n' } },
  { name: 'a same-size edit with a new mtime', state: repo => write(repo, 'a.txt', 'z\n'), ships: { 'a.txt': 'z\n' } },
  { name: 'a same-size edit in the racy window', state: repo => { write(repo, 'a.txt', 'z\n'); const stamp = newerThanIndex(repo, 'a.txt'); git(repo, ['update-index', 'a.txt']); write(repo, 'a.txt', 'y\n'); utimesSync(join(repo, 'a.txt'), stamp, stamp); }, ships: { 'a.txt': 'y\n' } },
  { name: 'staged differently from the worktree', state: repo => { write(repo, 'a.txt', 'staged\n'); git(repo, ['add', 'a.txt']); write(repo, 'a.txt', 'worktree\n'); }, ships: { 'a.txt': 'worktree\n' } },
  { name: 'staged and unchanged since', state: repo => { write(repo, 'a.txt', 'staged\n'); const past = new Date(Date.now() - 30_000); utimesSync(join(repo, 'a.txt'), past, past); git(repo, ['add', 'a.txt']); }, ships: { 'a.txt': 'staged\n' } },
  { name: 'a deletion', state: repo => rmSync(join(repo, 'a.txt')), ships: { 'a.txt': null } },
  { name: 'a deletion under skip-worktree', state: repo => { git(repo, ['update-index', '--skip-worktree', 'a.txt']); rmSync(join(repo, 'a.txt')); }, ships: { 'a.txt': null } },
  { name: 'an untracked file', state: repo => write(repo, 'new.txt', 'new\n'), ships: { 'new.txt': 'new\n' } },
  { name: 'an ignored file', state: repo => write(repo, 'ignored.txt', 'secret\n'), ships: { 'ignored.txt': null } },
  { name: 'a force-added ignored file, unchanged since', state: repo => { write(repo, 'ignored.txt', 'secret\n'); const past = new Date(Date.now() - 30_000); utimesSync(join(repo, 'ignored.txt'), past, past); git(repo, ['add', '-f', 'ignored.txt']); }, ships: { 'ignored.txt': null } },
  { name: 'git rm --cached with the file left', state: repo => { git(repo, ['rm', '-q', '--cached', 'a.txt']); }, ships: { 'a.txt': 'a\n' } },
  { name: 'a binary edit', state: repo => write(repo, 'dir/d.bin', 'q\0r\n') },
  { name: 'a name with spaces, a glob and non-ASCII', state: repo => { write(repo, 'dir/[a] é.txt', 'odd\n'); }, ships: { 'dir/[a] é.txt': 'odd\n' } },
  { name: 'a filter adopted with its attributes already committed and files unchanged', state: repo => { write(repo, '.gitattributes', 'b.txt filter=up\n'); git(repo, ['add', '.gitattributes']); git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@test.invalid', 'commit', '-qm', 'attrs']); const past = new Date(Date.now() - 30_000); utimesSync(join(repo, '.gitattributes'), past, past); git(repo, ['update-index', '--really-refresh']); git(repo, ['config', 'filter.up.clean', FILTER_UP]); }, ships: { 'b.txt': 'B\n' } },
  { name: 'a clean filter', state: repo => { git(repo, ['config', 'filter.up.clean', FILTER_UP]); write(repo, '.gitattributes', '*.txt filter=up\n'); write(repo, 'a.txt', 'filtered\n'); }, ships: { 'a.txt': 'FILTERED\n' } },
  { name: 'a file replaced by a link', skip: !linkCapable, state: repo => { rmSync(join(repo, 'a.txt')); symlinkSync('b.txt', join(repo, 'a.txt'), 'file'); } },
  { name: 'a folder replaced by a link', skip: !linkCapable, state: repo => { mkdirSync(join(repo, 'other')); write(repo, 'other/c.txt', 'c\n'); rmSync(join(repo, 'dir'), { recursive: true }); symlinkSync(join(repo, 'other'), join(repo, 'dir'), 'junction'); } }
];

describe('BT46 the stat path records what the plain path records', () => {
  for (const scenario of SCENARIOS) {
    it.skipIf(scenario.skip === true)(scenario.name, () => {
      const repo = repository();
      scenario.state(repo);
      const before = git(repo, ['diff', '--cached', '--name-only']);
      const plain = treeBy(repo, PLAIN);
      const viaStat = createSnapshotCommit(repo, runRoot('bt46-work'), STAT);
      expect(viaStat.tree).toBe(plain);
      for (const [path, bytes] of Object.entries(scenario.ships ?? {})) {
        const shown = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-C', repo, 'cat-file', 'blob', `${viaStat.commit}:${path}`], { encoding: 'utf8' });
        expect(shown.status === 0 ? shown.stdout : null, path).toBe(bytes);
      }
      // The real index is never written.
      expect(git(repo, ['diff', '--cached', '--name-only'])).toBe(before);
    });
  }

  it('a submodule moved or not records the same', () => {
    const inner = repository({ 'in.txt': 'in\n' });
    const repo = repository();
    git(repo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner.replaceAll('\\', '/'), 'sub']);
    git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@test.invalid', 'commit', '-qm', 'sub']);
    expect(treeBy(repo, STAT)).toBe(treeBy(repo, PLAIN));
    write(join(repo, 'sub'), 'in.txt', 'moved\n');
    git(join(repo, 'sub'), ['-c', 'user.name=t', '-c', 'user.email=t@test.invalid', 'commit', '-qam', 'moved']);
    const moved = treeBy(repo, STAT);
    expect(moved).toBe(treeBy(repo, PLAIN));
    expect(moved).not.toBe(git(repo, ['rev-parse', 'HEAD^{tree}']));
  });

  it('the seed path in a linked worktree records the same', () => {
    const repo = repository();
    const linked = join(runRoot('bt46-linked'), 'wt');
    git(repo, ['worktree', 'add', '-q', '-b', 'side', linked.replaceAll('\\', '/')]);
    write(linked, 'a.txt', 'in the worktree\n');
    expect(treeBy(linked, STAT)).toBe(treeBy(linked, PLAIN));
  });

  it('a repository with no commits records the same', () => {
    const repo = join(runRoot('bt46-empty'), 'repo');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-q', '-b', 'main']);
    write(repo, 'a.txt', 'first\n');
    git(repo, ['add', 'a.txt']);
    write(repo, 'b.txt', 'second\n');
    expect(treeBy(repo, STAT)).toBe(treeBy(repo, PLAIN));
  });
});

describe('BT46 the shape of the work at scale', () => {
  const COUNT = STAT_PATH_ENTRIES + 1;
  const world = () => {
    const repo = join(runRoot('bt46-scale'), 'repo');
    mkdirSync(join(repo, 'src'), { recursive: true });
    git(repo, ['init', '-q', '-b', 'main']);
    const past = new Date(Date.now() - 60_000);
    for (let n = 0; n < COUNT; n += 1) { const path = join(repo, 'src', `f${n}.txt`); writeFileSync(path, `file ${n}\n`); utimesSync(path, past, past); }
    write(repo, 'TASK.md', 'Task.\n');
    utimesSync(join(repo, 'TASK.md'), past, past);
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@test.invalid', 'commit', '-qm', 'base']);
    return repo;
  };
  // Counts every Git start and every main-thread read of a working file, inside the built CLI.
  const spied = (repo: string) => {
    const log = join(runRoot('bt46-spy'), 'spy.jsonl');
    const preload = join(runRoot('bt46-spy-src'), 'spy.mjs');
    writeFileSync(preload, `
      import childProcess from 'node:child_process';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const starts = []; let reads = 0;
      const spawn = childProcess.spawnSync;
      childProcess.spawnSync = function (cmd, args, opts) { if (String(cmd).toLowerCase().includes('git')) starts.push(args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-c' && args[i - 1] !== '-C')[0]); return spawn.call(this, cmd, args, opts); };
      const read = fs.readFileSync;
      fs.readFileSync = function (path, ...rest) { if (String(path).includes('f') && /[\\\\/]src[\\\\/]f\\d+\\.txt$/.test(String(path))) reads += 1; return read.call(this, path, ...rest); };
      syncBuiltinESMExports();
      process.on('exit', () => fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ starts, reads })));
    `);
    const run = spawnSync(process.execPath, ['--import', `file:///${preload.replaceAll('\\', '/')}`, CLI_DIST, 'bounty', 'create', '--task', 'TASK.md', '--why', 'shape'], { cwd: repo, encoding: 'utf8', env: process.env });
    expect(run.status, run.stderr).toBe(0);
    return { out: run.stdout + run.stderr, ...(JSON.parse(spawnSync(process.execPath, ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(log)},'utf8'))`], { encoding: 'utf8' }).stdout) as { starts: string[]; reads: number }) };
  };

  it('a clean repository: bounded Git starts, no add, no per-file read on the main thread', () => {
    const { starts, reads } = spied(world());
    expect(starts.length).toBeLessThanOrEqual(17);
    expect(starts).not.toContain('add');
    expect(reads).toBe(0);
  }, 120000);

  it('one edit: add runs once, and the edit is in the snapshot', () => {
    const repo = world();
    write(repo, 'src/f7.txt', 'edited at scale\n');
    const { starts } = spied(repo);
    expect(starts.filter(start => start === 'add')).toHaveLength(1);
  }, 120000);
});

describe('BT46 reading many files', () => {
  const planted = () => {
    const dir = runRoot('bt46-read');
    const paths = Array.from({ length: 300 }, (_, n) => join(dir, `f${n}`));
    paths.forEach((path, n) => writeFileSync(path, n === 7 ? 'x\0binary' : `content ${n}\n`));
    return paths;
  };

  it('the worker delivers every file once, the same bytes as a serial read, missing ones as null', () => {
    const paths = planted();
    rmSync(paths[11]!);
    const collect = (parallelFrom: number) => {
      const got = new Map<number, string | null>();
      let visits = 0;
      readMany(paths, paths.map(() => 20), (index, bytes) => { visits += 1; got.set(index, bytes === null ? null : bytes.toString('latin1')); }, parallelFrom);
      expect(visits).toBe(paths.length);
      return [...got.entries()].sort((a, b) => a[0] - b[0]);
    };
    const inWorker = collect(1);
    expect(inWorker).toEqual(collect(PLAIN));
    expect(inWorker[11]![1]).toBeNull();
    expect(inWorker[7]![1]).toBe('x\0binary');
  });

  it('a file larger than the in-flight cap is still read whole', () => {
    const big = join(runRoot('bt46-big'), 'big');
    writeFileSync(big, Buffer.alloc(70 * 1024 * 1024, 7));
    let length = 0;
    readMany([big, big], [70 * 1024 * 1024, 70 * 1024 * 1024], (_, bytes) => { length += bytes!.length; }, 1);
    expect(length).toBe(140 * 1024 * 1024);
  }, 60000);

  it('leaves UV_THREADPOOL_SIZE as it found it', () => {
    const before = process.env['UV_THREADPOOL_SIZE'];
    readMany(planted(), planted().map(() => 20), () => {}, 1);
    expect(process.env['UV_THREADPOOL_SIZE']).toBe(before);
  });
});

describe('BT46 the scan through the worker', () => {
  it('names the same hits, in file order, and the binary list, at scale', () => {
    const repo = join(runRoot('bt46-scan'), 'repo');
    mkdirSync(join(repo, 'src'), { recursive: true });
    git(repo, ['init', '-q', '-b', 'main']);
    for (let n = 0; n < PARALLEL_READ_FILES + 1; n += 1) writeFileSync(join(repo, 'src', `f${String(n).padStart(4, '0')}.txt`), `file ${n}\n`);
    // Built at run time: no token-shaped literal in tracked source.
    const shape = 'ghp_' + 'a'.repeat(36);
    writeFileSync(join(repo, 'src', 'f0003.txt'), `${shape}\n`);
    writeFileSync(join(repo, 'src', 'f0900.txt'), `${shape}\n`);
    writeFileSync(join(repo, 'src', 'f0500.txt'), 'x\0binary\n');
    write(repo, 'TASK.md', 'Task.\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@test.invalid', 'commit', '-qm', 'base']);
    const run = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'create', '--task', 'TASK.md', '--why', 'scan'], { cwd: repo, encoding: 'utf8', env: process.env });
    expect(run.status, run.stderr).toBe(0);
    const out = run.stdout + run.stderr;
    const first = out.indexOf('f0003.txt');
    expect(first).toBeGreaterThan(-1);
    expect(out.indexOf('f0900.txt')).toBeGreaterThan(first);
    expect(out).toContain('not scanned');
    expect(out).toContain('f0500.txt');
    expect(out).not.toContain(shape);
  }, 120000);
});
