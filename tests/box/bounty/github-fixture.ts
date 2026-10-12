import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { expect } from 'vitest';
import { BountyRefused, finalizeBounty, planBounty } from '../../../packages/box-bounty/index.js';
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

export function fixture(run: (context: GithubFixture) => void, title = 'Repair app', files: Record<string, string> = { 'app.txt': 'broken\n', '.env': 'NEVER_PUBLIC_SECRET\n', 'check.cjs': "process.exit(require('fs').readFileSync('app.txt','utf8') === 'fixed\\n' ? 0 : 1);\n" }, resumeNote?: string, publicNote?: string) {
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
  if (process.platform === 'win32') write(bin, 'gh.cmd', `@"${process.execPath}" "${join(bin, 'standin.cjs')}" %*\r\n`);
  else { write(bin, 'gh', `#!/bin/sh\nexec '${process.execPath}' '${join(bin, 'standin.cjs')}' "$@"\n`); chmodSync(join(bin, 'gh'), 0o755); }
  const oldPath = process.env.PATH;
  const oldState = process.env['BT6_GH_STATE'];
  process.env.PATH = `${bin}${delimiter}${oldPath ?? ''}`;
  process.env['BT6_GH_STATE'] = stateFile;
  const state = (): GhState => JSON.parse(readFileSync(stateFile, 'utf8')) as GhState;
  const update = (change: Partial<GhState>) => writeFileSync(stateFile, JSON.stringify({ ...state(), ...change }));
  /** Register a pull request head already reachable on the remote. */
  const prCommit = (sha: string, author = 'solver', files = ['app.txt'], base = `box-bounty/${created.id}`) => {
    const n = state().prs.length + 1;
    git(repo, ['push', 'https://github.com/owner/project.git', `+${sha}:refs/pull/${n}/head`]);
    update({ prs: [...state().prs, { number: n, user: { login: author }, base: { ref: base, repo: { full_name: 'owner/project' } }, head: { sha }, files: files.map(filename => ({ filename })) }] });
  };
  const pr = (author = 'owner', extra: Record<string, string> = {}, base = `box-bounty/${created.id}`, history = `box-bounty/${created.id}`): string => {
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
  try { run({ repo, bare, scratch, id: created.id, folder: created.outDir, state, update, pr, prCommit, bin }); }
  finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldState === undefined) delete process.env['BT6_GH_STATE']; else process.env['BT6_GH_STATE'] = oldState;
  }
}

export function refused(action: () => unknown, reason: string) {
  try { action(); expect.unreachable('expected a refusal'); }
  catch (error) { expect(error).toBeInstanceOf(BountyRefused); expect(error).toMatchObject({ reason }); }
}
