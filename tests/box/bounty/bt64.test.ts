// BT64 — one repository folder, one spelling. On Windows a folder can be
// reached by its 8.3 short name and its long name. The never-publish list
// was keyed by the spelling the command was given, while create reaches the
// folder through Git's long spelling: a list written through one spelling
// did not hold a create through the other, and the listed path shipped
// (found on GitHub's Windows machine by K50, run 42802182752, whose temp
// folder is C:\Users\RUNNER~1). The snapshot compared long-resolved files
// against a short root and refused a junction inside as an escape.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { changePublishList, finalizeBounty, planBounty, settingsFile } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { git, makeRepo, write } from './support.js';

// The folder's own 8.3 spelling, discovered (`for %~sI`, as bt26 does), never
// assumed. Null where the volume hands back none.
const shortOf = (path: string): string | null => {
  const run = spawnSync('cmd.exe', ['/d', '/c', `for %I in (${path}) do @echo %~sI`], { encoding: 'utf8' });
  const short = run.status === 0 ? run.stdout.trim() : '';
  return short !== '' && short.toLowerCase() !== path.toLowerCase() && existsSync(short) ? short : null;
};
const NO_ALIAS = 'this filesystem hands back no 8.3 short names — the two-spelling class does not exist here';

const options = (repo: string): CreateOptions => {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md') };
};
const ships = (repo: string, prefix: string): boolean => planBounty(options(repo)).files.some(file => file.path.startsWith(prefix));
const publishingKeys = (): string[] => Object.keys((JSON.parse(readFileSync(settingsFile(), 'utf8')) as { publishing?: Record<string, unknown> }).publishing ?? {});

// The lesson as a check, on every system: the folder gets its spelling from
// folder.ts only. A new realpathSync call elsewhere in the package fails here
// by file and line; the two kept calls are named with their reasons.
const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/box-bounty');
const KEPT = [
  /realpathSync\(isAbsolute\(token\)/, // git.ts: an existence probe; it compares nothing
  /realpathSync\(resolveProgram\(name\)\.path\)/, // git.ts: a program's own path, never compared with the root
];
it('no file in the bounty package resolves a folder except through folder.ts', () => {
  const offenders: string[] = [];
  for (const name of readdirSync(PACKAGE).filter(entry => entry.endsWith('.ts') && entry !== 'folder.ts')) {
    let inBlock = false; // inside /* ... */: prose may name the function
    readFileSync(join(PACKAGE, name), 'utf8').split('\n').forEach((line, index) => {
      const opens = line.includes('/*');
      const wasIn = inBlock || opens;
      if (opens && !line.includes('*/', line.indexOf('/*'))) inBlock = true;
      if (inBlock && !opens && line.includes('*/')) inBlock = false;
      if (wasIn || /^\s*\/\//.test(line) || /^import /.test(line)) return;
      if (/(?<![.\w])realpathSync\b/.test(line.replace(/\/\/.*$/, '')) && !KEPT.some(kept => kept.test(line))) offenders.push(`${name}:${index + 1}`);
    });
  }
  expect(offenders).toEqual([]);
});

// Host-only (BT64): 8.3 short names exist only on Windows.
describe.skipIf(process.platform !== 'win32')('a never-publish entry holds however the repository folder is spelled', () => {
  it('written through the short spelling, it holds a create through the long one', context => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'private/notes.txt': 'owner only\n' });
    const short = shortOf(repo);
    if (short === null) return context.skip(NO_ALIAS);
    changePublishList(short, 'never-publish', 'add', 'private');
    expect(ships(repo, 'private/')).toBe(false);
    expect(ships(short, 'private/')).toBe(false);
  });

  it('written through the long spelling, it holds a create through the short one', context => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'private/notes.txt': 'owner only\n' });
    const short = shortOf(repo);
    if (short === null) return context.skip(NO_ALIAS);
    changePublishList(repo, 'never-publish', 'add', 'private');
    expect(ships(short, 'private/')).toBe(false);
  });

  it('a list stored before BT64 under the short spelling still holds, and the next write leaves one key for the folder', context => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'private/notes.txt': 'owner only\n', 'other/b.txt': 'b\n' });
    const short = shortOf(repo);
    if (short === null) return context.skip(NO_ALIAS);
    // The older tool's key: the spelling it was given, as JavaScript realpath keeps it.
    const file = settingsFile();
    const before = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> : {};
    const publishing = { ...(before['publishing'] as Record<string, unknown> | undefined), [short]: { never: ['private'], safe: [] } };
    writeFileSync(file, JSON.stringify({ ...before, publishing }, null, 2));
    expect(ships(repo, 'private/')).toBe(false);
    changePublishList(repo, 'never-publish', 'add', 'other');
    const folder = realpathSync.native(repo).toLowerCase();
    const forThisFolder = publishingKeys().filter(key => { try { return realpathSync.native(key).toLowerCase() === folder; } catch { return false; } });
    expect(forThisFolder).toHaveLength(1);
    expect(ships(short, 'private/')).toBe(false); // the older entry was carried, not dropped
    expect(ships(short, 'other/')).toBe(false);
  });

  it('written through a lower-case or a trailing-separator spelling, it holds a create through the plain one', () => {
    for (const spell of [(path: string) => path.toLowerCase(), (path: string) => `${path}\\`]) {
      const repo = makeRepo({ 'src/app.py': 'x\n', 'private/notes.txt': 'owner only\n' });
      changePublishList(spell(repo), 'never-publish', 'add', 'private');
      expect(ships(repo, 'private/'), spell(repo)).toBe(false);
    }
  });

  it('a junction whose target is spelled short ships under its canonical path, not as an escape', context => {
    let noAlias = false;
    const repo = makeRepo({ '.gitignore': 'realdir/\n', 'TASK.md': 'the task\n' }, inner => {
      write(inner, 'realdir/f.py', 'x\n');
      // As on the runner, where every path under the temp folder was spelled short.
      const target = shortOf(join(inner, 'realdir'));
      noAlias = target === null;
      symlinkSync(target ?? join(inner, 'realdir'), join(inner, 'jdir'), 'junction');
      git(inner, ['add', 'jdir/f.py']);
      git(inner, ['-c', 'user.name=bt64-test', '-c', 'user.email=bt64@test.invalid', 'commit', '-qm', 'track the junction spelling']);
    });
    const short = shortOf(repo);
    if (short === null || noAlias) return context.skip(NO_ALIAS);
    const plan = finalizeBounty(planBounty({ repoPath: short, why: 'w', taskPath: join(short, 'TASK.md') }));
    expect(plan.plan.files.map(entry => entry.path)).toContain('realdir/f.py');
  });
});
