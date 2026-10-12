import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, linkSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { expect } from 'vitest';
import { answerGitHub, BountyRefused, confirmBounty, finalizeBounty, planBounty, postBounty } from '../../../packages/box-bounty/index.js';
import { git, makeRepo, runRoot, write } from './support.js';
import { resolveProgram } from '../../../packages/box-package/commands.js';

export function withoutGh(run: () => void): void {
  const parentPath = process.env.PATH;
  const parentExecPath = process.env.GIT_EXEC_PATH;
  const gitProgram = resolveProgram('git').path;
  const commandShell = process.platform === 'win32' ? resolveProgram('cmd.exe').path : undefined;
  const bin = runRoot('BT6a-ci-no-gh');
  try {
    if (process.platform === 'win32') {
      const core = spawnSync(gitProgram, ['--exec-path'], { encoding: 'utf8' });
      expect(core.status).toBe(0);
      const corePath = core.stdout.trim();
      // Git for Windows' PATH executable is a launcher that needs its install
      // layout. Use the actual binary and its libraries, never its PATH directory.
      copyFileSync(join(corePath, 'git.exe'), join(bin, 'git.exe'));
      for (const file of readdirSync(corePath)) {
        if (file.toLowerCase().endsWith('.dll')) copyFileSync(join(corePath, file), join(bin, file));
      }
      copyFileSync(process.execPath, join(bin, 'node.exe'));
      if (commandShell !== undefined) copyFileSync(commandShell, join(bin, 'cmd.exe'));
      process.env.GIT_EXEC_PATH = corePath;
    } else {
      const programs: [string, string][] = [['git', gitProgram], ['node', process.execPath]];
      for (const [name, target] of programs) {
        const quoted = "'" + target.replaceAll("'", "'\\''") + "'";
        write(bin, name, `#!/bin/sh\nexec ${quoted} "$@"\n`);
        chmodSync(join(bin, name), 0o755);
      }
    }
    process.env.PATH = bin;
    expect(() => resolveProgram('gh')).toThrow();
    const toolsWork = () => {
      expect(spawnSync('git', ['--version'], { encoding: 'utf8' }).status).toBe(0);
      expect(spawnSync('node', ['-p', '"BT6a-ci-node"'], { encoding: 'utf8' }).stdout.trim()).toBe('BT6a-ci-node');
    };
    toolsWork();
    run();
    toolsWork();
    expect(() => resolveProgram('gh')).toThrow();
  } finally {
    if (parentPath === undefined) delete process.env.PATH; else process.env.PATH = parentPath;
    if (parentExecPath === undefined) delete process.env.GIT_EXEC_PATH; else process.env.GIT_EXEC_PATH = parentExecPath;
    rmSync(bin, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

export interface GhState {
  visibility: string;
  private: boolean;
  auth: boolean;
  malformed?: boolean;
  fail?: string | undefined;
  loseIssueResponse?: boolean;
  account: string;
  repository: string;
  issues: { number: number; html_url: string; title: string; body: string; state: string; labels?: { name: string }[]; user: { login: string } }[];
  comments: { body: string; user: { login: string }; created_at?: string }[];
  prs: { number: number; user: { login: string }; base: { ref: string; repo: { full_name: string } }; head: { sha: string }; files: { filename: string }[] }[];
  labels: { name: string }[];
  calls: string[][];
}

const STANDIN = String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
const path = process.env.BT6_GH_STATE;
const state = JSON.parse(fs.readFileSync(path, 'utf8'));
state.calls.push(args);
const save = () => fs.writeFileSync(path, JSON.stringify(state));
const fail = () => { save(); console.error('ghp_DO_NOT_LEAK_THIS_TOKEN_VALUE1234567890'); process.exit(1); };
if (args[0] === 'auth') { if (!state.auth) fail(); save(); process.exit(0); }
const endpoint = args[args.indexOf('--hostname') + 2];
const input = args.includes('--input') ? JSON.parse(fs.readFileSync(args[args.indexOf('--input') + 1], 'utf8')) : null;
if (state.fail && endpoint.includes(state.fail)) fail();
let result;
if (endpoint === 'user') result = { login: state.account };
else if (endpoint === 'repos/' + state.repository) result = state.malformed ? { visibility: 'ghp_DO_NOT_LEAK_THIS_TOKEN_VALUE1234567890' } : { full_name: state.repository, private: state.private, visibility: state.visibility };
else if (endpoint.includes('/pulls/')) {
  const n = Number(endpoint.split('/pulls/')[1].split('/')[0]);
  const pr = state.prs.find(pr => pr.number === n);
  if (!pr) fail();
  result = endpoint.includes('/files') ? pr.files : pr;
} else if (endpoint.includes('/pulls?')) result = state.prs.filter(pr => endpoint.includes(pr.base.ref));
else if (endpoint.includes('/labels/')) {
  const name = decodeURIComponent(endpoint.split('/labels/')[1].split('?')[0]);
  result = state.labels.find(label => label.name === name);
  if (!result) fail();
} else if (endpoint.includes('/labels')) {
  if (input) { result = { name: input.name }; state.labels.push(result); } else result = state.labels;
} else if (endpoint.includes('/comments')) {
  if (input) { result = { ...input, user: { login: state.account } }; state.comments.push(result); } else result = state.comments;
} else if (endpoint.includes('/issues/')) {
  const n = Number(endpoint.split('/issues/')[1].split('?')[0]);
  result = state.issues.find(issue => issue.number === n);
  if (input) Object.assign(result, input);
} else if (endpoint.includes('/issues')) {
  if (input) {
    result = { number: state.issues.length + 1, html_url: 'https://github.com/' + state.repository + '/issues/' + (state.issues.length + 1), ...input, labels: (input.labels ?? []).map(name => ({ name })), state: 'open', user: { login: state.account } };
    state.issues.push(result);
    if (state.loseIssueResponse) { state.loseIssueResponse = false; fail(); }
  } else result = state.issues;
} else fail();
save(); console.log(JSON.stringify(result));
`;

// The Windows stand-in costs ONE process per call, not the two a gh.cmd
// carries (cmd.exe plus its node child): `gh.exe` is node.exe itself, and a
// NODE_OPTIONS --require preload recognises the renamed binary, runs the
// same state machine and exits before node looks for a script. Any other
// node process sees a different execPath and the preload does nothing.
const GH_PRELOAD = String.raw`
if (/(^|[\\/])gh\.exe$/i.test(process.execPath)) {
  // Node resolves argv[1] to an absolute path before preloads run; rebuild the
  // argv the stand-in expects: [exe, 'gh.exe', <first arg>, <rest>...].
  const args = process.argv.slice(2);
  if (process.argv[1] !== undefined) args.unshift(require('node:path').basename(process.argv[1]));
  process.argv.splice(1, process.argv.length - 1, 'gh.exe', ...args);
  require(process.env.BT6_GH_STANDIN);
  process.exit(0);
}
`;

// A hard link, not a copy: the link launches as the very file every node.exe
// launch already runs, so each `gh` call starts like node itself. A copied
// binary pays a fresh scan on every spawn — measured 139 ms against 41 ms on
// this host — which pushed gh-heavy tests past their timeouts.
function linkGh(target: string, link: string): void {
  try { linkSync(target, link); }
  catch { copyFileSync(target, link); } // cross-volume or no link right: copy still works
}

export interface GithubFixture {
  readonly repo: string;
  readonly bare: string;
  readonly scratch: string;
  readonly id: string;
  readonly folder: string;
  readonly state: () => GhState;
  readonly update: (change: Partial<GhState>) => void;
  /** A solver clone of the bounty branch with `app.txt` fixed plus `extra`
      files, pushed as the next pull request's head. `history` picks where the
      clone branches from — the default is the bounty branch itself. */
  readonly pr: (author?: string, extra?: Record<string, string>, base?: string, history?: string) => string;
  /** Register an arbitrary local commit as the next pull request's head. */
  readonly prCommit: (sha: string, author?: string, files?: string[], base?: string) => void;
  readonly bin: string;
}

const DEFAULT_FILES: Record<string, string> = { 'app.txt': 'broken\n', '.env': 'NEVER_PUBLIC_SECRET\n', 'check.cjs': "process.exit(require('fs').readFileSync('app.txt','utf8') === 'fixed\\n' ? 0 : 1);\n" };

interface World {
  readonly repo: string;
  readonly bare: string;
  readonly scratch: string;
  readonly id: string;
  readonly folder: string;
  readonly stateFile: string;
  readonly bin: string;
}

// The repo, bare "GitHub" remote, gh stand-in and drafted bounty every
// fixture-style test starts from — one helper, so `fixture` and the shared
// posted world build exactly the same thing.
function makeWorld(title: string, files: Record<string, string>, resumeNote?: string, publicNote?: string): World {
  const repo = makeRepo(files);
  const scratch = runRoot('bt6a');
  const bare = join(scratch, 'remote.git');
  git(repo, ['init', '--bare', bare]);
  git(repo, ['remote', 'add', 'origin', 'git@github.com:owner/project.git']);
  git(repo, ['config', `url.${bare.replaceAll('\\', '/')}.insteadOf`, 'https://github.com/owner/project.git']);
  // The repository is already public: what is on the remote now is what a
  // bounty can point solvers at. The bare remote stands in for github.com.
  git(repo, ['push', 'https://github.com/owner/project.git', 'main']);
  write(repo, '.box/limits.json', JSON.stringify({ allowedDestinations: ['github'] }));
  write(repo, 'TASK.md', 'Repair the app.\n');
  if (resumeNote !== undefined) {
    write(repo, '.box/bt7-local-context.txt', resumeNote);
    write(repo, 'local-job-context-73c5.txt', 'unfinished local work\n');
  }
  if (publicNote !== undefined) write(repo, 'PUBLIC_NOTE.md', publicNote);
  const created = finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), title, why: 'need another pair of eyes', outDir: join(scratch, 'bounty'), ...(resumeNote === undefined ? {} : { resumeNote }), ...(publicNote === undefined ? {} : { notePath: join(repo, 'PUBLIC_NOTE.md') }) }));
  const stateFile = join(scratch, 'state.json');
  const initial: GhState = { visibility: 'public', private: false, auth: true, account: 'owner', repository: 'owner/project', issues: [], comments: [], prs: [], labels: [], calls: [] };
  writeFileSync(stateFile, JSON.stringify(initial));
  const bin = join(scratch, 'bin');
  write(bin, 'standin.cjs', STANDIN);
  if (process.platform === 'win32') {
    linkGh(process.execPath, join(bin, 'gh.exe'));
    write(bin, 'gh-preload.cjs', GH_PRELOAD);
  } else { write(bin, 'gh', `#!/bin/sh\nexec '${process.execPath}' '${join(bin, 'standin.cjs')}' "$@"\n`); chmodSync(join(bin, 'gh'), 0o755); }
  return { repo, bare, scratch, id: created.id, folder: created.outDir, stateFile, bin };
}

// The gh stand-in's environment for the length of `run`, restored after.
// On Windows the preload and the stand-in path ride NODE_OPTIONS /
// BT6_GH_STANDIN so the gh.exe copy of node can find its script.
function withGhEnv<T>(world: World, run: () => T): T {
  const oldPath = process.env.PATH;
  const oldState = process.env['BT6_GH_STATE'];
  const oldStandin = process.env['BT6_GH_STANDIN'];
  const oldNodeOptions = process.env['NODE_OPTIONS'];
  process.env.PATH = `${world.bin}${delimiter}${oldPath ?? ''}`;
  process.env['BT6_GH_STATE'] = world.stateFile;
  process.env['BT6_GH_STANDIN'] = join(world.bin, 'standin.cjs');
  if (process.platform === 'win32') {
    const preload = join(world.bin, 'gh-preload.cjs').replaceAll('\\', '/');
    process.env['NODE_OPTIONS'] = `${oldNodeOptions ?? ''} --require ${preload}`.trim();
  }
  try { return run(); }
  finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldState === undefined) delete process.env['BT6_GH_STATE']; else process.env['BT6_GH_STATE'] = oldState;
    if (oldStandin === undefined) delete process.env['BT6_GH_STANDIN']; else process.env['BT6_GH_STANDIN'] = oldStandin;
    if (oldNodeOptions === undefined) delete process.env['NODE_OPTIONS']; else process.env['NODE_OPTIONS'] = oldNodeOptions;
  }
}

function contextFor(world: World): GithubFixture {
  const { repo, bare, scratch, id, folder, stateFile, bin } = world;
  const state = (): GhState => JSON.parse(readFileSync(stateFile, 'utf8')) as GhState;
  const update = (change: Partial<GhState>) => writeFileSync(stateFile, JSON.stringify({ ...state(), ...change }));
  /** Register a pull request head already reachable on the remote. */
  const prCommit = (sha: string, author = 'solver', files = ['app.txt'], base = `box-bounty/${id}`) => {
    const n = state().prs.length + 1;
    git(repo, ['push', 'https://github.com/owner/project.git', `+${sha}:refs/pull/${n}/head`]);
    update({ prs: [...state().prs, { number: n, user: { login: author }, base: { ref: base, repo: { full_name: 'owner/project' } }, head: { sha }, files: files.map(filename => ({ filename })) }] });
  };
  const pr = (author = 'owner', extra: Record<string, string> = {}, base = `box-bounty/${id}`, history = `box-bounty/${id}`): string => {
    const solver = join(scratch, `solver-${state().prs.length}`);
    // Cloned from the bare remote's path — the solver's own origin — so a
    // pull request is pushed exactly like a fork or a branch in-repository.
    git(repo, ['clone', '--single-branch', '--branch', history, bare, solver]);
    write(solver, 'app.txt', 'fixed\n');
    for (const [path, content] of Object.entries(extra)) write(solver, path, content);
    git(solver, ['add', '-A']);
    git(solver, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit', '-qm', 'fix']);
    const sha = git(solver, ['rev-parse', 'HEAD']);
    const n = state().prs.length + 1;
    git(solver, ['push', 'origin', `HEAD:refs/pull/${n}/head`]);
    update({ prs: [...state().prs, { number: n, user: { login: author }, base: { ref: base, repo: { full_name: 'owner/project' } }, head: { sha }, files: ['app.txt', ...Object.keys(extra)].map(filename => ({ filename })) }] });
    return sha;
  };
  return { repo, bare, scratch, id, folder, state, update, pr, prCommit, bin };
}

// The drafted world every fixture test starts from is built once per file
// and copied per test, exactly like the posted world below: makeWorld's
// clone, push and draft are the same forty Git starts whether the test looks
// at them or not. The copy carries its own repo, remote and state — a test
// mutating it cannot touch the master or another copy.
const fixtureMasters = new Map<string, World>();

export function fixture(run: (context: GithubFixture) => void, title = 'Repair app', files: Record<string, string> = DEFAULT_FILES, resumeNote?: string, publicNote?: string) {
  const key = JSON.stringify({ title, files, resumeNote: resumeNote ?? null, publicNote: publicNote ?? null });
  let master = fixtureMasters.get(key);
  if (master === undefined) { master = makeWorld(title, files, resumeNote, publicNote); fixtureMasters.set(key, master); }
  const world = cloneWorld(master, runRoot('bt6a'), join(runRoot('bt6a-repo'), 'repo'));
  withGhEnv(world, () => run(contextFor(world)));
}

// A posted bounty with a pull request waiting, built ONCE per test file and
// copied per test: the clone, confirm, post, solver branch and collection —
// roughly forty Git starts each — happen once; a test that only needs the
// posted world gets a full copy and pays nothing. A test mutating its copy
// cannot touch the master or another copy: the copy carries its own repo,
// remote, record, state file and solver branches.
interface PostedOptions {
  /** The account the waiting pull request is recorded from. */
  readonly prAuthor?: string;
  /** Collect the waiting PR too — the test starts with one recorded attempt. */
  readonly collected?: boolean;
  /** The repository's file set — the default world when omitted. */
  readonly files?: Record<string, string>;
}

interface PostedWorld extends World {
  readonly prSha: string;
}

const postedMasters = new Map<string, PostedWorld>();

function buildPostedMaster(options: Required<PostedOptions>): PostedWorld {
  const world = makeWorld('Repair app', options.files);
  const context = contextFor(world);
  const prSha = withGhEnv(world, () => {
    confirmBounty(world.repo, world.id, 'github');
    postBounty(world.repo, world.id, 'github');
    const sha = context.pr(options.prAuthor);
    if (options.collected) answerGitHub(world.repo, world.id, 1);
    return sha;
  });
  return { ...world, prSha };
}

function cloneWorld<M extends World & { readonly prSha?: string }>(master: M, scratch: string, repo: string): M {
  // preserveTimestamps is not cosmetic: .git/index caches each file's stat
  // data, and a copy with fresh mtimes makes the first index read rewrite it —
  // a fingerprint drift no tool action caused. The refresh below warms the
  // fields timestamps cannot carry (ctime, inode): the copy's index then
  // matches its own worktree, as a warm checkout's would.
  cpSync(master.scratch, scratch, { recursive: true, preserveTimestamps: true });
  cpSync(master.repo, repo, { recursive: true, preserveTimestamps: true });
  git(repo, ['update-index', '--refresh']);
  const bare = join(scratch, 'remote.git');
  const bin = join(scratch, 'bin');
  const stateFile = join(scratch, 'state.json');
  const folder = join(scratch, 'bounty');
  // The copy's own remote indirection names its own bare remote, never the
  // master's: otherwise every git transport would reach the shared world.
  const configPath = join(repo, '.git', 'config');
  writeFileSync(configPath, readFileSync(configPath, 'utf8').replaceAll(master.bare.replaceAll('\\', '/'), bare.replaceAll('\\', '/')));
  // The record names the bounty folder by absolute path — the copy's own.
  const recordPath = join(repo, '.box', 'bounties', `${master.id}.json`);
  writeFileSync(recordPath, JSON.stringify({ ...JSON.parse(readFileSync(recordPath, 'utf8')), folder }, null, 2) + '\n');
  // The gh launcher needs no path rewrite on Windows — gh.exe is node itself
  // and finds its script through BT6_GH_STANDIN, which withGhEnv rebinds to
  // this copy. The cp above made a byte copy, though: relink so each launch
  // pays node's own start cost, never a fresh-binary scan. POSIX launchers
  // embed the path and are rewritten instead.
  if (process.platform === 'win32') { rmSync(join(bin, 'gh.exe')); linkGh(process.execPath, join(bin, 'gh.exe')); }
  else { write(bin, 'gh', `#!/bin/sh\nexec '${process.execPath}' '${join(bin, 'standin.cjs')}' "$@"\n`); chmodSync(join(bin, 'gh'), 0o755); }
  // The posted world (issue, PRs, comments) is part of the copy; the call log
  // is each test's own observation, so it starts empty.
  writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(readFileSync(stateFile, 'utf8')), calls: [] }));
  return { repo, bare, scratch, id: master.id, folder, stateFile, bin, prSha: master.prSha } as M;
}

export function postedFixture(run: (context: GithubFixture & { readonly waitingPr: string }) => void, options: PostedOptions = {}) {
  const settled = { prAuthor: options.prAuthor ?? 'owner', collected: options.collected ?? false, files: options.files ?? DEFAULT_FILES };
  const key = JSON.stringify(settled);
  let master = postedMasters.get(key);
  if (master === undefined) { master = buildPostedMaster(settled); postedMasters.set(key, master); }
  const world = cloneWorld(master, runRoot('posted-scratch'), join(runRoot('posted-repo'), 'repo'));
  withGhEnv(world, () => run({ ...contextFor(world), waitingPr: world.prSha }));
}

export function refused(action: () => unknown, reason: string) {
  try { action(); expect.unreachable('expected a refusal'); }
  catch (error) { expect(error).toBeInstanceOf(BountyRefused); expect(error).toMatchObject({ reason }); }
}
