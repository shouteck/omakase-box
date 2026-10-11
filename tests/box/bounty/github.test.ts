import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerGitHub, applyBounty, BountyRefused, confirmBounty, finalizeBounty, listGitHubAnswers, loadRecord, planBounty, postBounty, previewGitHub, rejectBounty, renderDescribe, renderHelp, renderOpenLine, renderStatus, undoBounty, withdrawBounty } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, fingerprint, git, makeRepo, runRoot, write } from './support.js';
import { answerBounty } from '../../../packages/box-bounty/index.js';
import { resolveProgram } from '../../../packages/box-package/commands.js';
import { git as objectGit, gitWriteBlob } from '../../../packages/box-bounty/git.js';

interface State {
  visibility: string;
  private: boolean;
  auth: boolean;
  malformed?: boolean;
  fail?: string | undefined;
  loseIssueResponse?: boolean;
  account: string;
  repository: string;
  issues: { number: number; html_url: string; title: string; body: string; state: string; labels?: { name: string }[]; user: { login: string } }[];
  comments: { body: string; user: { login: string } }[];
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

function fixture(run: (context: { repo: string; bare: string; id: string; folder: string; state: () => State; update: (change: Partial<State>) => void; pr: (author?: string, extra?: Record<string, string>, base?: string) => void; bin: string }) => void, title = 'Repair app') {
  const repo = makeRepo({ 'app.txt': 'broken\n', '.env': 'NEVER_PUBLIC_SECRET\n', 'check.cjs': "process.exit(require('fs').readFileSync('app.txt','utf8') === 'fixed\\n' ? 0 : 1);\n" });
  const scratch = runRoot('bt6');
  const bare = join(scratch, 'remote.git');
  git(repo, ['init', '--bare', bare]);
  git(repo, ['remote', 'add', 'origin', 'git@github.com:owner/project.git']);
  git(repo, ['config', `url.${bare.replaceAll('\\', '/')}.insteadOf`, 'https://github.com/owner/project.git']);
  write(repo, '.box/limits.json', JSON.stringify({ allowedDestinations: ['github'] }));
  write(repo, 'TASK.md', 'Repair the app.\n');
  const created = finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), title, why: 'need another pair of eyes', outDir: join(scratch, 'bounty') }));
  const stateFile = join(scratch, 'state.json');
  const initial: State = { visibility: 'public', private: false, auth: true, account: 'owner', repository: 'owner/project', issues: [], comments: [], prs: [], labels: [], calls: [] };
  writeFileSync(stateFile, JSON.stringify(initial));
  const bin = join(scratch, 'bin');
  write(bin, 'standin.cjs', STANDIN);
  if (process.platform === 'win32') write(bin, 'gh.cmd', `@"${process.execPath}" "${join(bin, 'standin.cjs')}" %*\r\n`);
  else { write(bin, 'gh', `#!/bin/sh\nexec '${process.execPath}' '${join(bin, 'standin.cjs')}' "$@"\n`); chmodSync(join(bin, 'gh'), 0o755); }
  const oldPath = process.env.PATH;
  const oldState = process.env['BT6_GH_STATE'];
  process.env.PATH = `${bin}${delimiter}${oldPath ?? ''}`;
  process.env['BT6_GH_STATE'] = stateFile;
  const state = (): State => JSON.parse(readFileSync(stateFile, 'utf8')) as State;
  const update = (change: Partial<State>) => writeFileSync(stateFile, JSON.stringify({ ...state(), ...change }));
  const pr = (author = 'owner', extra: Record<string, string> = {}, base = `box-bounty/${created.id}`) => {
    const solver = join(scratch, `solver-${state().prs.length}`);
    git(repo, ['clone', '--single-branch', '--branch', `box-bounty/${created.id}`, bare, solver]);
    write(solver, 'app.txt', 'fixed\n');
    for (const [path, content] of Object.entries(extra)) write(solver, path, content);
    git(solver, ['add', '-A']);
    git(solver, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit', '-qm', 'fix']);
    const n = state().prs.length + 1;
    const sha = git(solver, ['rev-parse', 'HEAD']);
    git(solver, ['push', 'origin', `HEAD:refs/pull/${n}/head`]);
    update({ prs: [...state().prs, { number: n, user: { login: author }, base: { ref: base, repo: { full_name: 'owner/project' } }, head: { sha }, files: [{ filename: 'app.txt' }, ...Object.keys(extra).map(filename => ({ filename }))] }] });
  };
  try { run({ repo, bare, id: created.id, folder: created.outDir, state, update, pr, bin }); }
  finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldState === undefined) delete process.env['BT6_GH_STATE']; else process.env['BT6_GH_STATE'] = oldState;
  }
}

function refused(action: () => unknown, reason: string) {
  try { action(); expect.unreachable('expected a refusal'); }
  catch (error) { expect(error).toBeInstanceOf(BountyRefused); expect(error).toMatchObject({ reason }); }
}

describe('GitHub bounty destination, entirely offline', () => {
  it('publishes only the shipped set in one parentless commit, records one issue and is idempotent', () => fixture(({ repo, bare, id, folder, state }) => {
    const before = fingerprint(repo);
    const preview = previewGitHub(repo, id);
    expect(preview).toContain('public. Anyone can read');
    confirmBounty(repo, id, 'github');
    const result = postBounty(repo, id, 'github');
    const pub = result.record.github!;
    expect(git(bare, ['rev-list', '--count', `refs/heads/${pub.branch}`])).toBe('1');
    expect(git(bare, ['rev-list', '--parents', '-n', '1', pub.commit])).toBe(pub.commit);
    const manifest = JSON.parse(readFileSync(join(folder, 'bounty.json'), 'utf8')) as { files: { path: string }[] };
    expect(git(bare, ['ls-tree', '-r', '--name-only', pub.commit]).split('\n').sort()).toEqual(manifest.files.map(file => file.path).sort());
    for (const file of manifest.files) expect(spawnSync('git', ['-C', bare, 'cat-file', 'blob', `${pub.commit}:${file.path}`]).stdout).toEqual(readFileSync(join(folder, 'repo', file.path)));
    expect(git(bare, ['rev-list', '--all', '--objects'])).not.toContain('.env');
    expect(state().issues).toHaveLength(1);
    expect(state().issues[0]!.body).toContain('Repair the app.');
    expect(state().issues[0]!.body).toContain('What was already tried');
    expect(state().issues[0]!.body).toContain('reward: $0');
    expect(state().issues[0]!.body).toContain('licence: no licence file');
    expect(state().issues[0]!.body).not.toContain('level');
    expect(state().issues[0]!.body).not.toContain('There is no reward.');
    expect(state().issues[0]!.body).not.toContain('NEVER_PUBLIC_SECRET');
    // Every bounty issue carries the box-bounty label — created when missing.
    expect(state().issues[0]!.labels).toEqual([{ name: 'box-bounty' }]);
    expect(state().labels).toEqual([{ name: 'box-bounty' }]);
    expect(preview).toContain(state().issues[0]!.body);
    postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
    expect(renderStatus(repo)).toContain(pub.issue!.url);
    expect(renderOpenLine(repo)).toContain(pub.branch);
    expect(fingerprint(repo)).toEqual(before);
  }));

  it.each([
    ['private repository', 'github-private-repository', { private: true, visibility: 'private' }],
    ['unreadable visibility', 'github-visibility-unreadable', { malformed: true }],
    ['visibility error', 'github-visibility-unreadable', { fail: 'repos/owner/project' }],
    ['not signed in', 'github-not-signed-in', { auth: false }]
  ])('refuses %s without changing anything', (_label, reason, mutation) => fixture(({ repo, bare, id, update, state }) => {
    confirmBounty(repo, id, 'github');
    update(mutation as Partial<State>);
    const before = fingerprint(repo);
    const record = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    refused(() => postBounty(repo, id, 'github'), String(reason));
    expect(fingerprint(repo)).toEqual(before);
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(record);
    expect(spawnSync('git', ['-C', bare, 'show-ref'], { encoding: 'utf8' }).stdout).toBe('');
    expect(state().issues).toHaveLength(0);
  }));

  it('refuses missing limits, no confirmation, missing gh, a non-GitHub remote, and mismatched pushurl', () => fixture(({ repo, bare, id, state }) => {
    refused(() => postBounty(repo, id, 'github'), 'not-confirmed');
    confirmBounty(repo, id, 'github');
    write(repo, '.box/limits.json', '{}');
    refused(() => postBounty(repo, id, 'github'), 'destination-not-allowed');
    write(repo, '.box/limits.json', '{"allowedDestinations":["github"]}');
    const path = process.env.PATH;
    process.env.PATH = [dirname(resolveProgram('git').path), dirname(process.execPath)].join(delimiter);
    refused(() => postBounty(repo, id, 'github'), 'github-cli-missing');
    process.env.PATH = path;
    git(repo, ['remote', 'set-url', 'origin', bare]);
    refused(() => postBounty(repo, id, 'github'), 'github-remote-required');
    git(repo, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
    git(repo, ['remote', 'set-url', '--push', 'origin', 'git@github.com:other/project.git']);
    refused(() => postBounty(repo, id, 'github'), 'github-remote-mismatch');
    expect(state().issues).toHaveLength(0);
  }));

  it('refuses changed repository or manifest after confirmation', () => fixture(({ repo, id, folder }) => {
    confirmBounty(repo, id, 'github');
    writeFileSync(join(folder, 'bounty.json'), readFileSync(join(folder, 'bounty.json'), 'utf8') + ' ');
    refused(() => postBounty(repo, id, 'github'), 'manifest-tampered');
  }));

  it('binds the repository reviewed at confirm, even when a new origin is public', () => fixture(({ repo, id, update }) => {
    confirmBounty(repo, id, 'github');
    git(repo, ['remote', 'set-url', 'origin', 'git@github.com:other/public.git']);
    update({ repository: 'other/public' });
    const before = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    refused(() => postBounty(repo, id, 'github'), 'github-repository-changed');
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(before);
  }));

  it('recovers a branch-only post and an issue created with a lost response without duplicates', () => fixture(({ repo, bare, id, state, update }) => {
    confirmBounty(repo, id, 'github');
    update({ fail: '/issues' });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    expect(loadRecord(repo, id).github!.state).toBe('branch-pushed');
    expect(git(bare, ['show-ref'])).toContain(`refs/heads/box-bounty/${id}`);
    const publication = loadRecord(repo, id).github!;
    expect(git(repo, ['rev-parse', `refs/box-bounty/${id}-github`])).toBe(publication.commit);
    git(repo, ['gc', '--prune=now', '-q']);
    expect(git(repo, ['cat-file', '-t', publication.commit])).toBe('commit');
    update({ fail: undefined, loseIssueResponse: true });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    expect(state().issues).toHaveLength(1);
    postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
  }));

  it('withdraw removes a branch after a failed issue post', () => fixture(({ repo, bare, id, update }) => {
    confirmBounty(repo, id, 'github'); update({ fail: '/issues' });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    update({ fail: undefined }); withdrawBounty(repo, id);
    expect(spawnSync('git', ['-C', bare, 'show-ref'], { encoding: 'utf8' }).stdout).toBe('');
  }));

  it('withdraw discovers and closes an issue after its successful creation response was lost', () => fixture(({ repo, bare, id, update, state }) => {
    confirmBounty(repo, id, 'github'); update({ loseIssueResponse: true });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    expect(loadRecord(repo, id).github!.issue).toBeNull();
    expect(state().issues).toHaveLength(1);
    const actual = state().issues[0]!;
    update({ issues: [{ ...actual, number: 2, html_url: 'https://github.com/owner/project/issues/2', user: { login: 'stranger' } }, actual] });
    withdrawBounty(repo, id);
    expect(loadRecord(repo, id).github!.issue!.number).toBe(1);
    expect(state().issues.find(issue => issue.number === 1)!.state).toBe('closed');
    expect(state().issues.find(issue => issue.number === 2)!.state).toBe('open');
    expect(state().comments).toHaveLength(1);
    expect(state().comments[0]!.body).toContain('Withdrawn.');
    expect(spawnSync('git', ['-C', bare, 'show-ref'], { encoding: 'utf8' }).stdout).toBe('');
    expect(spawnSync('git', ['-C', repo, 'show-ref', '--verify', '--quiet', `refs/box-bounty/${id}-github`]).status).toBe(1);
  }));

  it('lists facts, collects the signed-in author, applies, closes, removes the branch and records undo', () => fixture(({ repo, bare, id, state, pr }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github'); pr();
    expect(listGitHubAnswers(repo, id)).toContain('#1 by owner: "app.txt"');
    const before = fingerprint(repo);
    expect(answerGitHub(repo, id, 1).outcome).toBe('answered');
    expect(fingerprint(repo)).toEqual(before);
    const applied = applyBounty(repo, id);
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('fixed\n');
    expect(state().issues[0]!.state).toBe('closed');
    expect(state().comments[0]!.body).toContain(applied.mergeCommit);
    expect(git(bare, ['branch', '--list'])).toBe('');
    applyBounty(repo, id);
    expect(state().comments).toHaveLength(1);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(applied.mergeCommit);
    undoBounty(repo, id); const head = git(repo, ['rev-parse', 'HEAD']); undoBounty(repo, id);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(state().comments).toHaveLength(2);
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('broken\n');
  }));

  it.each(['stranger', 'renovate[bot]'])('collects and applies an answer from outside author %s — nothing a solver wrote runs', author => fixture(({ repo, id, pr }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github');
    const sentinel = join(runRoot('bt6-sentinel'), 'ran');
    pr(author, { 'check.cjs': `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran'); process.exit(0);` });
    const before = fingerprint(repo);
    const result = answerGitHub(repo, id, 1);
    expect(result.outcome).toBe('answered');
    expect(result.report.join('\n')).toContain(`GitHub account ${author}`);
    expect(result.report.join('\n')).toContain('nothing in the solution was run');
    expect(result.report.join('\n')).toContain('current code:');
    expect(existsSync(sentinel)).toBe(false);
    expect(fingerprint(repo)).toEqual(before);
    // Any account's answer may be applied — the solver's script lands as bytes,
    // never as a process.
    expect(applyBounty(repo, id, 1).outcome).toBe('applied');
    expect(readFileSync(join(repo, 'check.cjs'), 'utf8')).toContain('process.exit(0)');
    expect(existsSync(sentinel)).toBe(false);
  }));

  it('refuses a pull request with a Git symlink without materializing it or changing local state', () => fixture(({ repo, bare, id, update }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github');
    const publication = loadRecord(repo, id).github!;
    const env = { GIT_INDEX_FILE: join(runRoot('bt6-link-index'), 'index') };
    objectGit(repo, ['read-tree', publication.commit], env);
    const oid = gitWriteBlob(repo, Buffer.from('../outside'));
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `120000,${oid},evil-link`], env);
    const tree = objectGit(repo, ['write-tree'], env);
    const sha = objectGit(repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit-tree', tree, '-p', publication.commit, '-m', 'link']);
    git(repo, ['push', bare, `${sha}:refs/pull/1/head`]);
    update({ prs: [{ number: 1, user: { login: 'owner' }, base: { ref: publication.branch, repo: { full_name: publication.repository } }, head: { sha }, files: [{ filename: 'evil-link' }] }] });
    const before = fingerprint(repo);
    const record = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    refused(() => answerGitHub(repo, id, 1), 'answer-unsafe-path');
    expect(fingerprint(repo)).toEqual(before);
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(record);
  }));

  it('keeps titles and hostile pull-request text out of shell command arguments', () => fixture(({ repo, id, state, update, pr }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github');
    expect(state().issues[0]!.title).toContain('$(echo title)&');
    expect(state().calls.every(args => !args.some(arg => arg.includes('$(echo title)')))).toBe(true);
    pr();
    update({ prs: state().prs.map(value => ({ ...value, head: { ...value.head, ref: '$(echo HEAD)&' }, title: 'ghp_DO_NOT_LEAK_THIS_TOKEN_VALUE1234567890' })) });
    expect(answerGitHub(repo, id, 1).outcome).toBe('answered');
    expect(JSON.stringify(loadRecord(repo, id))).not.toContain('ghp_');
  }, 'Repair app $(echo title)&'));

  it('refreshes outside state from the record alone and retains dated facts when GitHub is unavailable', () => fixture(({ repo, id, pr, update }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github');
    expect(renderStatus(repo)).toContain('none open');
    pr();
    const refreshed = renderStatus(repo);
    expect(refreshed).toContain('#1 by owner: "app.txt"');
    expect(refreshed).toContain('issue open');
    expect(refreshed).toContain(`answer ${id} --pr`);
    expect(renderOpenLine(repo)).toContain('#1 by owner');
    const observedAt = loadRecord(repo, id).github!.outside!.at;
    update({ fail: '/issues' });
    const stale = renderStatus(repo);
    expect(stale).toContain('github-status-unavailable');
    expect(stale).toContain(observedAt);
    expect(stale).toContain('#1 by owner');
  }));

  it.each([
    ['wrong base', 'github-pr-wrong-branch', {}, 'main'],
    ['never-ship addition', 'answer-never-ship', { '.env': 'bad' }, undefined],
    ['hostile author', 'github-response-invalid', {}, undefined]
  ])('refuses %s without changing the record or worktree', (label, reason, extra, base) => fixture(({ repo, id, pr }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github');
    pr(label === 'hostile author' ? 'ghp_DO_NOT_LEAK_THIS_TOKEN_VALUE1234567890' : 'owner', extra, base);
    const before = fingerprint(repo);
    const record = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    refused(() => answerGitHub(repo, id, 1), reason);
    expect(fingerprint(repo)).toEqual(before);
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(record);
  }));

  it('refuses a missing PR and leaks no credential from gh errors or fields', () => fixture(({ repo, id, state, update, pr }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github');
    refused(() => answerGitHub(repo, id, 999), 'github-pr-missing');
    pr('owner', { 'ghp_DO_NOT_LEAK_THIS_TOKEN_VALUE1234567890.txt': 'data' });
    expect(listGitHubAnswers(repo, id)).not.toContain('ghp_');
    update({ fail: '/comments' });
    rejectBounty(repo, id, 'not wanted');
    expect(JSON.stringify(loadRecord(repo, id))).not.toContain('ghp_');
    expect(renderStatus(repo)).not.toContain('ghp_');
    expect(loadRecord(repo, id).github!.pending).toContain('local reject stands');
    update({ fail: undefined }); rejectBounty(repo, id, 'not wanted');
    expect(state().comments).toHaveLength(1);
    expect(state().comments[0]!.body).toContain('not wanted');
  }));

  it('keeps the local apply when the outside update fails, and resumes without another merge', () => fixture(({ repo, id, pr, update, state }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github'); pr(); answerGitHub(repo, id, 1);
    update({ fail: '/comments' });
    const applied = applyBounty(repo, id);
    expect(loadRecord(repo, id).github!.pending).toContain('local apply stands');
    update({ fail: undefined }); applyBounty(repo, id);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(applied.mergeCommit);
    expect(state().comments).toHaveLength(1);
    expect(loadRecord(repo, id).github!.pending).toBeNull();
  }));

  it('undo preserves unfinished apply facts and outside cleanup rather than clearing them', () => fixture(({ repo, bare, id, pr, update, state }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github'); pr(); answerGitHub(repo, id, 1);
    update({ fail: '/comments' });
    const applied = applyBounty(repo, id);
    const undone = undoBounty(repo, id);
    expect(loadRecord(repo, id).github!.pending).toContain('local undo stands');
    expect(state().issues[0]!.state).toBe('open');
    update({ fail: undefined }); undoBounty(repo, id);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(undone.undoCommit);
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('broken\n');
    expect(state().comments).toHaveLength(2);
    expect(state().comments[0]!.body).toContain(applied.mergeCommit);
    expect(state().comments[1]!.body).toContain(undone.undoCommit);
    expect(state().issues[0]!.state).toBe('closed');
    expect(git(bare, ['branch', '--list'])).toBe('');
    expect(loadRecord(repo, id).github!.pending).toBeNull();
    expect(loadRecord(repo, id).github!.state).toBe('closed');
  }));

  it('a stranger comment carrying an exact decision marker cannot suppress the tool fact', () => fixture(({ repo, id, pr, update, state }) => {
    confirmBounty(repo, id, 'github'); postBounty(repo, id, 'github'); pr(); answerGitHub(repo, id, 1);
    update({ fail: '/comments' });
    const applied = applyBounty(repo, id);
    const body = `Applied as commit ${applied.mergeCommit}.\n\n<!-- box-bounty:${id}:apply -->`;
    update({ fail: undefined, comments: [{ body, user: { login: 'stranger' } }] });
    applyBounty(repo, id);
    expect(state().comments.filter(comment => comment.user.login === 'owner')).toEqual([{ body, user: { login: 'owner' } }]);
    expect(state().issues[0]!.state).toBe('closed');
  }));

  it('states the public-only, free, unwatched and no-execution facts before preparation', () => {
    const text = renderDescribe(null) + renderHelp();
    expect(text).toContain('already-public'); expect(text).toContain('free'); expect(text).toContain('Nobody is known');
    expect(text).toContain('nothing a solver wrote is ever run');
  });

  it('runs the whole folder journey with no gh and no GitHub remote', () => fixture(({ repo, state }) => {
    git(repo, ['remote', 'remove', 'origin']);
    write(repo, '.box/limits.json', '{}');
    process.env.PATH = [dirname(resolveProgram('git').path), dirname(process.execPath)].join(delimiter);
    expect(() => resolveProgram('gh')).toThrow();
    const created = finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'local work', outDir: join(runRoot('bt6-no-gh'), 'bounty') }));
    const id = created.id;
    confirmBounty(repo, id);
    const destination = postBounty(repo, id, join(runRoot('bt6-local'), 'drop')).destination;
    write(destination, 'repo/app.txt', 'fixed\n');
    expect(answerBounty(repo, id, destination).outcome).toBe('answered');
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(undoBounty(repo, id).outcome).toBe('undone');
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('broken\n');
    expect(state().calls).toHaveLength(0);
    expect(existsSync(join(created.outDir, 'bounty.json'))).toBe(true);
  }));

  it('routes the built CLI preview, post, status and PR commands through the adapter', () => fixture(({ repo, id, state, pr }) => {
    const cli = (...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8' });
    const before = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    const preview = cli('confirm', id, '--to', 'github', '--preview');
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain('Issue body:');
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(before);
    expect(cli('confirm', id, '--to', 'github').status).toBe(0);
    expect(cli('post', id, '--to', 'github').status).toBe(0);
    pr();
    expect(cli('status').stdout).toContain('#1 by owner');
    expect(cli('answer', id).stdout).toContain('#1 by owner');
    const collected = cli('answer', id, '--pr', '1');
    expect(collected.status).toBe(0); expect(collected.stdout).toContain('answered');
    expect(cli('apply', id).status).toBe(0);
    expect(state().issues[0]!.state).toBe('closed');
    expect(cli('undo', id).status).toBe(0);
  }));
});
