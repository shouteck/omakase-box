// BT97: Git's own boundary checks are product behaviour, not kitchen config.
// These tests use real Git object transfer wherever the behaviour is fsck: a
// local-path clone can bypass the pack parser, so the GitHub stand-in's URL is
// rewritten to a file:// URL for product clone/fetch calls.
import childProcess, { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BountyRefused, changeConfig, finalizeBounty, loadRecord, loadTaken, lookBounty, planBounty, postBounty, takeBounty } from '../../../packages/box-bounty/index.js';
import { fixture, postedFixture } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, runRoot, write } from './support.js';

const posix = (path: string): string => path.replaceAll('\\', '/');

function withEnv<T>(values: Readonly<Record<string, string | undefined>>, run: () => T): T {
  const before = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) {
    before.set(key, process.env[key]);
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try { return run(); }
  finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function scratchHome(repo: string): string {
  const home = runRoot('bt97-home');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, '.gitconfig'), `[safe]\n\tdirectory = ${posix(repo)}\n`);
  return home;
}

function ownershipSupported(repo: string): boolean {
  const probe = spawnSync('git', ['-C', repo, 'rev-parse', '--git-dir'], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' }
  });
  return (probe.stderr ?? '').includes('dubious ownership');
}

function ownershipFixture(): { repo: string; marker: string; task: string } {
  const marker = join(runRoot('bt97-ownership-marker'), 'filter-ran');
  const repo = makeRepo({
    'app.txt': 'fixed\n',
    'TASK.md': 'Make the app pass.\n',
    '.gitattributes': 'app.txt filter=bt97\n',
    'filter.cjs': `let input='';process.stdin.on('data',c=>input+=c).on('end',()=>{require('node:fs').writeFileSync(${JSON.stringify(posix(marker))},'ran');process.stdout.write(input)});\n`
  });
  git(repo, ['config', 'filter.bt97.clean', 'node filter.cjs']);
  return { repo, marker, task: join(repo, 'TASK.md') };
}

// Rewrite only the product's GitHub HTTPS transport to the fixture's bare
// remote as a file:// URL. The outer fixture rewrites the same URL to a local
// path; that is fine for most tests, but local-path transport does not pack and
// therefore cannot prove fetch-side fsck. Other local git plumbing is untouched.
function packTransport<T>(repository: string, bare: string, run: () => T): T {
  const previous = childProcess.spawnSync;
  const https = `https://github.com/${repository}.git`;
  const packed = pathToFileURL(bare).href;
  const proxy = new Proxy(previous, {
    apply(target, receiver, args) {
      const mapped = [...args];
      if (/(?:^|[\\/])git(?:\.exe)?$/i.test(String(args[0])) && Array.isArray(args[1])) {
        mapped[1] = args[1].map(arg => arg === https ? packed : arg);
      }
      return Reflect.apply(target, receiver, mapped);
    }
  });
  childProcess.spawnSync = proxy;
  syncBuiltinESMExports();
  try { return run(); }
  finally {
    childProcess.spawnSync = previous;
    syncBuiltinESMExports();
  }
}

function hostileGitmodulesCommit(repo: string, bare: string, scratch: string, id: string): { sha: string; blob: string; files: string[] } {
  const solver = join(scratch, 'bt97-hostile-solver');
  git(repo, ['clone', '--quiet', '--single-branch', '--branch', `box-bounty/${id}`, bare, solver]);
  write(solver, 'app.txt', 'fixed\n');
  write(solver, '.gitmodules', '[submodule "x"]\n\tpath = x\n\turl = https://example.invalid/x.git\n\tupdate = !touch bt97-pwned\n');
  git(solver, ['add', '-A']);
  git(solver, ['commit', '-qm', 'hostile gitmodules']);
  const sha = git(solver, ['rev-parse', 'HEAD']);
  const blob = git(solver, ['rev-parse', 'HEAD:.gitmodules']);
  git(solver, ['push', 'origin', `HEAD:refs/pull/1/head`]);
  return { sha, blob, files: ['app.txt', '.gitmodules'] };
}

function literalObject(repo: string, type: 'commit' | 'tree', bytes: Buffer): string {
  const result = spawnSync('git', ['-c', `safe.directory=${posix(repo)}`, '-C', repo, 'hash-object', '-t', type, '--literally', '-w', '--stdin'], { input: bytes, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`hash-object ${type} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function legacyBranchCommit(solver: string, kind: 'badTimezone' | 'missingSpaceBeforeDate' | 'zeroPaddedFilemode'): string {
  const parent = git(solver, ['rev-parse', 'HEAD']);
  const author = kind === 'badTimezone'
    ? 'Legacy Author <legacy@example.invalid> 1234567890 +251800'
    : kind === 'missingSpaceBeforeDate'
      ? 'Legacy Author <legacy@example.invalid>1234567890 +0000'
      : 'Legacy Author <legacy@example.invalid> 1234567890 +0000';
  let tree = git(solver, ['rev-parse', 'HEAD^{tree}']);
  if (kind === 'zeroPaddedFilemode') {
    const blob = git(solver, ['rev-parse', 'HEAD:app.txt']);
    tree = literalObject(solver, 'tree', Buffer.concat([Buffer.from(`0100644 app.txt\0`, 'utf8'), Buffer.from(blob, 'hex')]));
  }
  const text = `tree ${tree}\nparent ${parent}\nauthor ${author}\ncommitter ${author}\n\nlegacy ${kind}\n`;
  return literalObject(solver, 'commit', Buffer.from(text, 'utf8'));
}

function pushLegacyBranch(bare: string, scratch: string, id: string, kind: 'badTimezone' | 'missingSpaceBeforeDate' | 'zeroPaddedFilemode'): void {
  const solver = join(scratch, `bt97-legacy-${kind}`);
  git(scratch, ['clone', '--quiet', '--single-branch', '--branch', `box-bounty/${id}`, bare, solver]);
  const sha = legacyBranchCommit(solver, kind);
  git(solver, ['push', 'origin', `${sha}:refs/heads/box-bounty/${id}`]);
}

function hostileBranch(bare: string, scratch: string, id: string): { blob: string } {
  const solver = join(scratch, 'bt97-hostile-branch-solver');
  git(scratch, ['clone', '--quiet', '--single-branch', '--branch', `box-bounty/${id}`, bare, solver]);
  write(solver, '.gitmodules', '[submodule "x"]\n\tpath = x\n\turl = https://example.invalid/x.git\n\tupdate = !touch bt97-pwned\n');
  git(solver, ['add', '.gitmodules']);
  git(solver, ['commit', '-qm', 'hostile branch object']);
  const blob = git(solver, ['rev-parse', 'HEAD:.gitmodules']);
  git(solver, ['push', 'origin', `HEAD:refs/heads/box-bounty/${id}`]);
  return { blob };
}

const BOARD_STANDIN = fileURLToPath(new URL('./board-standin.cjs', import.meta.url));
let boardFolder: string;
let board: string;
let boardServer: ChildProcess;
const boardRoutes = (next: Record<string, { status: number; body: unknown }>) => writeFileSync(join(boardFolder, 'routes.json'), JSON.stringify(next));

beforeAll(async () => {
  boardFolder = runRoot('bt97-board');
  mkdirSync(boardFolder, { recursive: true });
  boardServer = spawn(process.execPath, [BOARD_STANDIN, boardFolder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => boardServer.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { boardServer.kill(); });
beforeEach(() => { writeFileSync(join(boardFolder, 'requests.jsonl'), ''); boardRoutes({}); });

const listed = (bare: string, id: string, over: Record<string, unknown> = {}) => {
  const base = git(bare, ['rev-parse', `refs/heads/box-bounty/${id}`]);
  boardRoutes({ [`/bounties/${id}.json`]: { status: 200, body: { bounty: { id, state: 'open', reward: { amount: 45 }, pays_on_merge: true, owner: { login: 'owner' }, repository: { name: 'owner/project' }, answer: { branch: `box-bounty/${id}`, base_commit: base }, ...over } } } });
  return base;
};
const allowSolving = () => { changeConfig(null, 'set', 'board', board); changeConfig(null, 'set', 'solving', 'allowed'); };

interface Advisory {
  readonly id: string;
  readonly cve: string;
  readonly address: string;
  readonly fixedVersions: string[];
}

const ADVISORIES = JSON.parse(readFileSync(new URL('../../../packages/box-bounty/git-advisories.json', import.meta.url), 'utf8')) as Advisory[];
const FIXED_VERSIONS = [...new Set(ADVISORIES.flatMap(advisory => advisory.fixedVersions))];

function gitVersionPreload(): { preload: string; probeLog: string } {
  const folder = runRoot('bt97-git-version');
  mkdirSync(folder, { recursive: true });
  const preload = join(folder, 'git-version.cjs');
  const probeLog = join(folder, 'probes.txt');
  writeFileSync(preload, `
const fs = require('node:fs');
const childProcess = require('node:child_process');
const real = childProcess.spawnSync;
childProcess.spawnSync = function(command, args, options) {
  const argv = Array.isArray(args) ? args.map(String) : [];
  if (/(^|[\\\\/])git(?:\\.exe)?$/i.test(String(command)) && argv.length === 1 && argv[0] === 'version') {
    const version = process.env.BT97_GIT_VERSION;
    if (process.env.BT97_GIT_PROBE_LOG) fs.appendFileSync(process.env.BT97_GIT_PROBE_LOG, version + '\\n');
    const stdout = 'git version ' + version + '\\n';
    return { pid: process.pid, output: [null, stdout, ''], stdout, stderr: '', status: 0, signal: null };
  }
  return real.apply(this, arguments);
};
require('node:module').syncBuiltinESMExports();
`);
  writeFileSync(probeLog, '');
  return { preload, probeLog };
}

function cliWithGitVersion(cwd: string, args: readonly string[], version: string) {
  const { preload, probeLog } = gitVersionPreload();
  const run = spawnSync(process.execPath, ['--require', posix(preload), CLI_DIST, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, BT97_GIT_VERSION: version, BT97_GIT_PROBE_LOG: probeLog },
    timeout: 120000
  });
  return { run, probeLog };
}

function upgradeWarnings(output: string, version: string): string[] {
  const prefix = `your Git ${version} is older than the releases that fix known clone vulnerabilities (`;
  const suffix = `); the tool's own calls avoid them, but your agent's own Git commands in a bounty's workspace do not; upgrade from https://git-scm.com`;
  return output.split(/\r?\n/).flatMap(line => line.startsWith(prefix) && line.endsWith(suffix) ? [line.slice(prefix.length, line.length - suffix.length)] : []);
}

function expectProbe(runProbeLog: string, version: string): void {
  expect(readFileSync(runProbeLog, 'utf8').split(/\r?\n/).filter(Boolean)).toContain(version);
}

describe('BT97 ownership boundary', { timeout: 120000 }, () => {
  // @guards R1
  it('create refuses git-repository-not-trusted before a repository-owned filter can run', () => {
    const { repo, marker, task } = ownershipFixture();
    if (!ownershipSupported(repo)) return; // the matrix's fallback needs a real second account, which hosted tests do not have
    const run = () => planBounty({ repoPath: repo, why: 'ownership probe', taskPath: task });
    expect(() => withEnv({ GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' }, run)).toThrow(expect.objectContaining({
      reason: 'git-repository-not-trusted',
      message: expect.stringContaining('owned by another account')
    }));
    expect(existsSync(marker)).toBe(false);
  });

  // @guards R1
  it('the same create works when the test scratch HOME itself trusts the repository', () => {
    const { repo, marker, task } = ownershipFixture();
    if (!ownershipSupported(repo)) return;
    const home = scratchHome(repo);
    const result = withEnv({ GIT_TEST_ASSUME_DIFFERENT_OWNER: '1', HOME: home, USERPROFILE: home }, () => finalizeBounty(planBounty({ repoPath: repo, why: 'ownership probe', taskPath: task })));
    expect(result.plan.snapshot.commit).toMatch(/^[a-f\d]{40}$/);
    expect(existsSync(marker)).toBe(true);
  });
});

describe('BT97 stranger-object intake', { timeout: 120000 }, () => {
  // @guards R1
  it('look refuses git-objects-rejected for a solution carrying hostile .gitmodules objects, and collects nothing', () => fixture(context => {
    postBounty(context.repo, context.id, 'github');
    const hostile = hostileGitmodulesCommit(context.repo, context.bare, context.scratch, context.id);
    context.update({ prs: [{ number: 1, user: { login: 'solver' }, base: { ref: `box-bounty/${context.id}`, repo: { full_name: 'owner/project' } }, head: { sha: hostile.sha }, files: hostile.files.map(filename => ({ filename })) }] });
    packTransport('owner/project', context.bare, () => {
      expect(() => lookBounty(context.repo, context.id, 1)).toThrow(expect.objectContaining({ reason: 'git-objects-rejected' }));
    });
    expect(loadRecord(context.repo, context.id).attempts ?? []).toEqual([]);
  }));

  // @guards R1
  it('a normal solution still collects through the same packed transport', () => fixture(context => {
    postBounty(context.repo, context.id, 'github');
    context.pr('solver');
    const seen = packTransport('owner/project', context.bare, () => lookBounty(context.repo, context.id, 1));
    expect(seen.attempt.commit).toBe(context.state().prs[0]!.head.sha);
    expect(seen.files).toContain('app.txt');
  }));

  // @guards R1
  it('take refuses git-objects-rejected when the stranger bounty branch carries hostile objects', () => postedFixture(({ bare, id, scratch }) => {
    allowSolving();
    hostileBranch(bare, scratch, id);
    listed(bare, id);
    packTransport('owner/project', bare, () => {
      expect(() => takeBounty(id)).toThrow(expect.objectContaining({ reason: 'git-objects-rejected' }));
    });
    expect(loadTaken(id)).toBeNull();
  }));

  for (const kind of ['badTimezone', 'missingSpaceBeforeDate', 'zeroPaddedFilemode'] as const) {
    // @guards R1
    it(`take accepts a legacy ${kind} object with Git's warning visible`, () => postedFixture(({ bare, id, scratch }) => {
      allowSolving();
      pushLegacyBranch(bare, scratch, id, kind);
      listed(bare, id);
      const result = packTransport('owner/project', bare, () => takeBounty(id));
      expect(result.kind).toBe('taken');
      const text = result.lines.join('\n');
      expect(text).toMatch(new RegExp(`warning[^\\n]*${kind}`));
    }));
  }
});

describe('BT97 intake policy sealing and protocol', { timeout: 120000 }, () => {
  // @guards R1
  it('an inherited fetch.fsck skipList or severity downgrade cannot make solution intake pass', () => fixture(context => {
    postBounty(context.repo, context.id, 'github');
    const hostile = hostileGitmodulesCommit(context.repo, context.bare, context.scratch, context.id);
    context.update({ prs: [{ number: 1, user: { login: 'solver' }, base: { ref: `box-bounty/${context.id}`, repo: { full_name: 'owner/project' } }, head: { sha: hostile.sha }, files: hostile.files.map(filename => ({ filename })) }] });
    const home = runRoot('bt97-weakening-home');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, '.gitconfig'), `[fetch "fsck"]\n\thasDotgit = ignore\n\tgitmodulesUpdate = ignore\n\tskipList = ${posix(join(home, 'skip'))}\n`);
    writeFileSync(join(home, 'skip'), `${hostile.blob}\n`);
    packTransport('owner/project', context.bare, () => {
      expect(() => withEnv({ HOME: home, USERPROFILE: home }, () => lookBounty(context.repo, context.id, 1))).toThrow(expect.objectContaining({ reason: 'git-objects-rejected' }));
    });
  }));

  // @guards R1
  it('an inherited fetch.fsck skipList or severity downgrade cannot make take intake pass', () => postedFixture(({ bare, id, scratch }) => {
    allowSolving();
    const hostile = hostileBranch(bare, scratch, id);
    listed(bare, id);
    const home = runRoot('bt97-take-weakening-home');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, '.gitconfig'), `[fetch "fsck"]\n\thasDotgit = ignore\n\tgitmodulesUpdate = ignore\n\tskipList = ${posix(join(home, 'skip'))}\n`);
    writeFileSync(join(home, 'skip'), `${hostile.blob}\n`);
    packTransport('owner/project', bare, () => {
      expect(() => withEnv({ HOME: home, USERPROFILE: home }, () => takeBounty(id))).toThrow(expect.objectContaining({ reason: 'git-objects-rejected' }));
    });
    expect(loadTaken(id)).toBeNull();
  }));

  // @guards R1
  it('take carries GIT_ALLOW_PROTOCOL=https for the stranger clone, never for owner SSH-capable calls', () => postedFixture(({ bare, id }) => {
    allowSolving();
    listed(bare, id);
    const seen: { args: string[]; env: NodeJS.ProcessEnv | undefined }[] = [];
    const previous = childProcess.spawnSync;
    const capture = new Proxy(previous, {
      apply(target, receiver, args) {
        if (/(?:^|[\\/])git(?:\.exe)?$/i.test(String(args[0])) && Array.isArray(args[1])) {
          seen.push({ args: args[1].map(String), env: (args[2] as { env?: NodeJS.ProcessEnv } | undefined)?.env });
        }
        return Reflect.apply(target, receiver, args);
      }
    });
    childProcess.spawnSync = capture;
    syncBuiltinESMExports();
    try { packTransport('owner/project', bare, () => takeBounty(id)); }
    finally {
      childProcess.spawnSync = previous;
      syncBuiltinESMExports();
    }
    const clone = seen.find(call => call.args.includes('clone'));
    expect(clone?.env?.['GIT_ALLOW_PROTOCOL']).toBe('https');
    const ownerCalls = seen.filter(call => !call.args.includes('clone') && call.args.some(arg => arg.includes('github.com') || arg.includes('git@github.com')));
    expect(ownerCalls.every(call => call.env?.['GIT_ALLOW_PROTOCOL'] === undefined)).toBe(true);
  }));
});

describe('BT97 old Git version line', { timeout: 120000 }, () => {
  const oldGit = '2.45.3';
  const newGit = '2.45.4';

  // @guards R1
  it('the pinned advisory data names the three clone advisories and their fixed versions', () => {
    expect(ADVISORIES).toEqual([
      { id: 'GHSA-8h77-4q3w-gfgv', cve: 'CVE-2024-32002', address: 'https://github.com/git/git/security/advisories/GHSA-8h77-4q3w-gfgv', fixedVersions: ['2.39.4', '2.40.2', '2.41.1', '2.42.2', '2.43.4', '2.44.1', '2.45.1'] },
      { id: 'GHSA-xfc6-vwr8-r389', cve: 'CVE-2024-32004', address: 'https://github.com/git/git/security/advisories/GHSA-xfc6-vwr8-r389', fixedVersions: ['2.39.4', '2.40.2', '2.41.1', '2.42.2', '2.43.4', '2.44.1', '2.45.1'] },
      { id: 'GHSA-vwqx-4fm8-6qc9', cve: 'CVE-2025-48384', address: 'https://github.com/git/git/security/advisories/GHSA-vwqx-4fm8-6qc9', fixedVersions: ['2.43.7', '2.44.4', '2.45.4', '2.46.4', '2.47.3', '2.48.2', '2.49.1', '2.50.1'] }
    ]);
    expect(FIXED_VERSIONS).toHaveLength(15);
  });

  const expectOneAdvisoryLine = (output: string, version: string) => {
    const warnings = upgradeWarnings(output, version);
    expect(warnings, `old-Git warning count in:\n${output}`).toHaveLength(1);
    const entries = warnings[0]!.split(',').map(entry => entry.trim()).filter(entry => entry !== '');
    expect(new Set(entries).size).toBe(entries.length);
    expect([...entries].sort()).toEqual([...FIXED_VERSIONS].sort());
  };

  // @guards R1
  it('an older stand-in Git prints the exact upgrade line once on bare omakase-box and on take', () => postedFixture(({ bare, id, repo, scratch }) => {
    allowSolving();
    listed(bare, id);
    const empty = join(scratch, 'nowhere');
    mkdirSync(empty, { recursive: true });

    const overview = cliWithGitVersion(repo, [], oldGit);
    expectProbe(overview.probeLog, oldGit);
    expect(overview.run.status, overview.run.stderr).toBe(0);
    expect(overview.run.stdout).toContain('omakase-box can hand work to an outside solver');
    expectOneAdvisoryLine(`${overview.run.stdout}\n${overview.run.stderr}`, oldGit);

    const taken = cliWithGitVersion(empty, ['take', id], oldGit);
    expectProbe(taken.probeLog, oldGit);
    expect(taken.run.status, taken.run.stderr).toBe(0);
    expect(taken.run.stdout).toContain(`${id} — taken:`);
    expectOneAdvisoryLine(`${taken.run.stdout}\n${taken.run.stderr}`, oldGit);
  }));

  // @guards R1
  it('a fixed stand-in Git prints no upgrade line on bare omakase-box or take', () => postedFixture(({ bare, id, repo, scratch }) => {
    allowSolving();
    listed(bare, id);
    const empty = join(scratch, 'nowhere-new');
    mkdirSync(empty, { recursive: true });

    const overview = cliWithGitVersion(repo, [], newGit);
    expectProbe(overview.probeLog, newGit);
    expect(overview.run.status, overview.run.stderr).toBe(0);
    expect(overview.run.stdout).toContain('omakase-box can hand work to an outside solver');
    expect(upgradeWarnings(`${overview.run.stdout}\n${overview.run.stderr}`, newGit)).toEqual([]);

    const taken = cliWithGitVersion(empty, ['take', id], newGit);
    expectProbe(taken.probeLog, newGit);
    expect(taken.run.status, taken.run.stderr).toBe(0);
    expect(taken.run.stdout).toContain(`${id} — taken:`);
    expect(upgradeWarnings(`${taken.run.stdout}\n${taken.run.stderr}`, newGit)).toEqual([]);
  }));
});
