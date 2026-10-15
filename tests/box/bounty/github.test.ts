import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBounty, closeBounty, finalizeBounty, listGitHubAnswers, loadRecord, lookBounty, planBounty, postBounty, previewGitHub, renderDescribe, renderHelp, renderOpenLine, renderStatus } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, fingerprint, git, runRoot, write } from './support.js';
import { resolveProgram, runDeclaredCheck } from '../../../packages/box-package/commands.js';
import { git as objectGit, gitWriteBlob } from '../../../packages/box-bounty/git.js';
import { fixture, leakCanary, postedFixture, refused, withoutGh } from './github-fixture.js';
import type { GhState } from './github-fixture.js';

describe('GitHub bounty destination, entirely offline', () => {
  it('isolates co-located runnable gh, git and node and restores lookup after failure', () => fixture(({ repo, state }) => {
    const gh = resolveProgram('gh').path;
    withoutGh(() => {
      const poison = join(dirname(resolveProgram('git').path), process.platform === 'win32' ? 'gh.exe' : 'gh');
      copyFileSync(gh, poison);
      const previousGhProgram = process.env['BT15_GH_PROGRAM'];
      process.env['BT15_GH_PROGRAM'] = poison;
      try {
        expect(dirname(resolveProgram('gh').path)).toBe(dirname(resolveProgram('git').path));
        expect(dirname(resolveProgram('node').path)).toBe(dirname(resolveProgram('git').path));
        const probe = runDeclaredCheck({ name: 'parent gh', program: 'gh', args: ['auth', 'status'], cwd: '.', context: 'owner', timeoutMs: 5000 }, repo);
        expect(probe.result, probe.log).toBe('pass');
        expect(state().calls).toEqual([['auth', 'status']]);
        const parentPath = process.env.PATH;
        const parentExecPath = process.env.GIT_EXEC_PATH;
        const failure = new Error('BT6a-ci deliberate failure');
        expect(() => withoutGh(() => {
          expect(() => resolveProgram('gh')).toThrow();
          expect(git(repo, ['rev-parse', 'HEAD'])).toMatch(/^[a-f0-9]{40}$/);
          throw failure;
        })).toThrow(failure);
        expect(process.env.PATH).toBe(parentPath);
        expect(process.env.GIT_EXEC_PATH).toBe(parentExecPath);
        expect(resolveProgram('gh').path).toBe(poison);
        expect(state().calls).toEqual([['auth', 'status']]);
      } finally {
        if (previousGhProgram === undefined) delete process.env['BT15_GH_PROGRAM']; else process.env['BT15_GH_PROGRAM'] = previousGhProgram;
        rmSync(poison);
      }
    });
  }));
  it('points the branch at the newest commit the repository already has — no file content is uploaded', () => fixture(({ repo, bare, id, state }) => {
    const before = fingerprint(repo);
    const head = git(repo, ['rev-parse', 'HEAD']);
    const objects = git(bare, ['count-objects', '-v']);
    const preview = previewGitHub(repo, id);
    expect(preview).toContain('public. Anyone can read');
    expect(preview).toContain('nothing new is published');
    expect(preview).toContain(`Base: commit ${head}`);
    // A never-ship-named file in the public history is a fact, not a refusal.
    expect(preview).toContain('Already public');
    expect(preview).toContain('.env');
    const result = postBounty(repo, id, 'github');
    const pub = result.record.github!;
    expect(pub.kind).toBe('history');
    expect(pub.base).toBe(head);
    expect(pub.commit).toBe(head);
    expect(pub.pushed).toEqual([]);
    expect(git(bare, ['rev-parse', `refs/heads/${pub.branch}`])).toBe(head);
    // Zero file content was uploaded: the branch is a name, nothing more.
    expect(git(bare, ['count-objects', '-v'])).toBe(objects);
    expect(state().issues).toHaveLength(1);
    const issue = state().issues[0]!;
    expect(issue.body).toContain('Repair the app.');
    expect(issue.body).toContain('What was already tried');
    expect(issue.body).toContain(`Branch from \`${pub.branch}\``);
    expect(issue.body).toContain(`based on commit ${head}`);
    expect(issue.body).toContain('it points at that commit — nothing new was published');
    expect(issue.body).toContain('Fork this repository');
    expect(issue.body).toContain('pull request against');
    expect(issue.body).toContain('reward: $0');
    expect(issue.body).toContain('licence: no licence file');
    expect(issue.body).not.toContain('snapshot');
    expect(issue.body).not.toContain('NEVER_PUBLIC_SECRET');
    expect(issue.body).toContain(`<!-- box-bounty:${id} -->`);
    // Every bounty issue carries the box-bounty label — created when missing.
    expect(issue.labels).toEqual([{ name: 'box-bounty' }]);
    expect(state().labels).toEqual([{ name: 'box-bounty' }]);
    expect(preview).toContain(issue.body);
    postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
    expect(renderStatus(repo, { full: true })).toContain(pub.issue!.url);
    expect(renderStatus(repo, { full: true })).not.toContain('snapshot-posted');
    expect(renderOpenLine(repo)).toContain(pub.branch);
    expect(fingerprint(repo)).toEqual(before);
  }));

  it.each([
    ['private repository', 'github-private-repository', { private: true, visibility: 'private' }],
    ['unreadable visibility', 'github-visibility-unreadable', { malformed: true }],
    ['visibility error', 'github-visibility-unreadable', { fail: 'repos/owner/project' }],
    ['not signed in', 'github-not-signed-in', { auth: false }]
  ])('refuses %s without changing anything', (_label, reason, mutation) => fixture(({ repo, bare, id, update, state }) => {
    update(mutation as Partial<GhState>);
    const before = fingerprint(repo);
    const record = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    refused(() => postBounty(repo, id, 'github'), String(reason));
    expect(fingerprint(repo)).toEqual(before);
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(record);
    expect(spawnSync('git', ['-C', bare, 'show-ref'], { encoding: 'utf8' }).stdout).not.toContain('box-bounty');
    expect(state().issues).toHaveLength(0);
  }));

  it('refuses missing gh, a non-GitHub remote and mismatched pushurl', () => fixture(({ repo, bare, id, state }) => {
    expect(resolveProgram('gh').path).toBeTruthy();
    withoutGh(() => refused(() => postBounty(repo, id, 'github'), 'github-cli-missing'));
    git(repo, ['remote', 'set-url', 'origin', bare]);
    refused(() => postBounty(repo, id, 'github'), 'github-remote-required');
    git(repo, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
    git(repo, ['remote', 'set-url', '--push', 'origin', 'git@github.com:other/project.git']);
    refused(() => postBounty(repo, id, 'github'), 'github-remote-mismatch');
    expect(state().issues).toHaveLength(0);
  }));

  it('binds the repository a post was started for, even when a new origin is public', () => fixture(({ repo, id, update }) => {
    // A post that got as far as the pushed branch keeps its repository bound:
    // retargeting origin cannot redirect the retry.
    update({ fail: '/issues' });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    git(repo, ['remote', 'set-url', 'origin', 'git@github.com:other/public.git']);
    update({ repository: 'other/public', fail: undefined });
    const before = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    refused(() => postBounty(repo, id, 'github'), 'github-repository-changed');
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(before);
  }));

  it('recovers a branch-only post and an issue created with a lost response without duplicates', () => fixture(({ repo, bare, id, state, update }) => {
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

  it('close removes a branch after a failed issue post', () => fixture(({ repo, bare, id, update }) => {
    update({ fail: '/issues' });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    update({ fail: undefined }); closeBounty(repo, id);
    expect(spawnSync('git', ['-C', bare, 'show-ref'], { encoding: 'utf8' }).stdout).not.toContain('box-bounty');
    expect(spawnSync('git', ['-C', bare, 'show-ref'], { encoding: 'utf8' }).stdout).toContain('refs/heads/main');
  }));

  it('close discovers and closes an issue after its successful creation response was lost', () => fixture(({ repo, bare, id, update, state }) => {
    update({ loseIssueResponse: true });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    expect(loadRecord(repo, id).github!.issue).toBeNull();
    expect(state().issues).toHaveLength(1);
    const actual = state().issues[0]!;
    update({ issues: [{ ...actual, number: 2, html_url: 'https://github.com/owner/project/issues/2', user: { login: 'stranger' } }, actual] });
    closeBounty(repo, id);
    expect(loadRecord(repo, id).github!.issue!.number).toBe(1);
    expect(state().issues.find(issue => issue.number === 1)!.state).toBe('closed');
    expect(state().issues.find(issue => issue.number === 2)!.state).toBe('open');
    expect(state().comments).toHaveLength(1);
    expect(state().comments[0]!.body).toContain('Withdrawn.');
    expect(spawnSync('git', ['-C', bare, 'show-ref'], { encoding: 'utf8' }).stdout).not.toContain('box-bounty');
    expect(spawnSync('git', ['-C', repo, 'show-ref', '--verify', '--quiet', `refs/box-bounty/${id}-github`]).status).toBe(1);
  }));

  it('lists facts, collects the signed-in author, applies, closes, removes the branch and records undo', () => postedFixture(({ repo, bare, id, state }) => {
    expect(listGitHubAnswers(repo, id)).toContain('#1 by owner: "app.txt"');
    const before = fingerprint(repo);
    expect(lookBounty(repo, id, 1).attempt.outcome).toBe('answered');
    expect(fingerprint(repo)).toEqual(before);
    const applied = applyBounty(repo, id);
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('fixed\n');
    expect(state().issues[0]!.state).toBe('closed');
    expect(state().comments[0]!.body).toContain(applied.mergeCommit);
    expect(git(bare, ['branch', '--list', 'box-bounty/*'])).toBe('');
    expect(git(bare, ['branch', '--list', 'main'])).toBe('main');
    applyBounty(repo, id);
    expect(state().comments).toHaveLength(1);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(applied.mergeCommit);
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('fixed\n');
  }));

  it.each(['stranger', 'renovate[bot]'])('collects and applies an answer from outside author %s — nothing a solver wrote runs', author => fixture(({ repo, id, pr }) => {
    postBounty(repo, id, 'github');
    const sentinel = join(runRoot('bt6-sentinel'), 'ran');
    pr(author, { 'check.cjs': `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran'); process.exit(0);` });
    const before = fingerprint(repo);
    const result = lookBounty(repo, id, 1);
    expect(result.attempt.outcome).toBe('answered');
    expect(result.attempt.report.join('\n')).toContain(`GitHub account ${author}`);
    expect(result.attempt.report.join('\n')).toContain('nothing in the solution was run');
    expect(result.attempt.report.join('\n')).toContain('current code:');
    expect(existsSync(sentinel)).toBe(false);
    expect(fingerprint(repo)).toEqual(before);
    // Any account's answer may be applied — the solver's script lands as bytes,
    // never as a process.
    expect(applyBounty(repo, id, 1).outcome).toBe('applied');
    expect(readFileSync(join(repo, 'check.cjs'), 'utf8')).toContain('process.exit(0)');
    expect(existsSync(sentinel)).toBe(false);
  }));

  it('refuses a pull request with a Git symlink without materializing it or changing local state', () => fixture(({ repo, bare, id, update }) => {
    postBounty(repo, id, 'github');
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
    refused(() => lookBounty(repo, id, 1), 'answer-unsafe-path');
    expect(fingerprint(repo)).toEqual(before);
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(record);
  }));

  it('keeps titles and hostile pull-request text out of shell command arguments', () => fixture(({ repo, id, state, update, pr }) => {
    postBounty(repo, id, 'github');
    expect(state().issues[0]!.title).toContain('$(echo title)&');
    expect(state().calls.every(args => !args.some(arg => arg.includes('$(echo title)')))).toBe(true);
    pr();
    update({ prs: state().prs.map(value => ({ ...value, head: { ...value.head, ref: '$(echo HEAD)&' }, title: leakCanary })) });
    expect(lookBounty(repo, id, 1).attempt.outcome).toBe('answered');
    expect(JSON.stringify(loadRecord(repo, id))).not.toContain('ghp_');
  }, 'Repair app $(echo title)&'));

  it('refreshes outside state from the record alone and retains dated facts when GitHub is unavailable', () => fixture(({ repo, id, pr, update }) => {
    postBounty(repo, id, 'github');
    expect(renderStatus(repo)).toContain('none open');
    pr();
    const refreshed = renderStatus(repo);
    expect(refreshed).toContain('#1 by owner: "app.txt"');
    expect(renderStatus(repo, { full: true })).toContain('issue open');
    expect(refreshed).toContain(`box bounty look ${id} 1`);
    expect(renderOpenLine(repo)).toContain('#1 by owner');
    const observedAt = loadRecord(repo, id).github!.outside!.at;
    update({ fail: '/issues' });
    const stale = renderStatus(repo);
    // A failed refresh names its reason (BT14) and offers the retry that
    // could read a different answer.
    expect(stale).toContain('github-command-failed');
    expect(stale).toContain('retry box bounty status');
    expect(stale).toContain(observedAt);
    expect(stale).toContain('#1 by owner');
  }));

  it.each([
    ['wrong base', 'github-pr-wrong-branch', {}, 'main'],
    ['never-ship addition', 'answer-never-ship', { '.env': 'bad' }, undefined],
    ['hostile author', 'github-response-invalid', {}, undefined]
  ])('refuses %s without changing the record or worktree', (label, reason, extra, base) => postedFixture(({ repo, id, pr }) => {
    // A second pull request carries the shape under test; the master's own PR
    // waits beside it, uncollected.
    pr(label === 'hostile author' ? leakCanary : 'owner', extra, base);
    const before = fingerprint(repo);
    const record = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    refused(() => lookBounty(repo, id, 2), reason);
    expect(fingerprint(repo)).toEqual(before);
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(record);
  }));

  it('refuses a missing PR and leaks no credential from gh errors or fields', () => postedFixture(({ repo, id, state, update, pr }) => {
    refused(() => lookBounty(repo, id, 999), 'github-pr-missing');
    pr('owner', { [leakCanary + '.txt']: 'data' });
    expect(listGitHubAnswers(repo, id)).not.toContain('ghp_');
    update({ fail: '/comments' });
    closeBounty(repo, id, 'not wanted');
    expect(JSON.stringify(loadRecord(repo, id))).not.toContain('ghp_');
    expect(renderStatus(repo)).not.toContain('ghp_');
    expect(loadRecord(repo, id).github!.pending).toContain('local close stands');
    update({ fail: undefined }); closeBounty(repo, id, 'not wanted');
    expect(state().comments).toHaveLength(1);
    expect(state().comments[0]!.body).toContain('not wanted');
  }));

  it('keeps the local apply when the outside update fails, and resumes without another merge', () => postedFixture(({ repo, id, update, state }) => {
    update({ fail: '/comments' });
    const applied = applyBounty(repo, id);
    expect(loadRecord(repo, id).github!.pending).toContain('local apply stands');
    update({ fail: undefined }); applyBounty(repo, id);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(applied.mergeCommit);
    expect(state().comments).toHaveLength(1);
    expect(loadRecord(repo, id).github!.pending).toBeNull();
  }, { collected: true }));

  it('a stranger comment carrying an exact decision marker cannot suppress the tool fact', () => postedFixture(({ repo, id, update, state }) => {
    update({ fail: '/comments' });
    const applied = applyBounty(repo, id);
    const body = `Applied as commit ${applied.mergeCommit}.\n\n<!-- box-bounty:${id}:apply -->`;
    update({ fail: undefined, comments: [{ body, user: { login: 'stranger' } }] });
    applyBounty(repo, id);
    expect(state().comments.filter(comment => comment.user.login === 'owner')).toEqual([{ body, user: { login: 'owner' } }]);
    expect(state().issues[0]!.state).toBe('closed');
  }, { collected: true }));

  it('states the public-only, free, unwatched and no-execution facts before preparation', () => {
    const text = renderDescribe(null) + renderHelp();
    expect(text).toContain('already-public'); expect(text).toContain('free'); expect(text).toContain('Nobody is known');
    expect(text).toContain('nothing a solver wrote is ever run');
  });

  it('routes the built CLI preview, post, status and PR commands through the adapter', () => fixture(({ repo, id, state, pr }) => {
    const cli = (...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8' });
    const before = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    const preview = cli('post', id, '--to', 'github', '--preview');
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain('Issue body:');
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(before);
    expect(cli('post', id, '--to', 'github').status).toBe(0);
    pr();
    expect(cli('status').stdout).toContain('#1 by owner');
    // `answer` is gone: status carries the listing, and look collects the PR.
    expect(cli('answer', id).status).toBe(3);
    const collected = cli('look', id, '1');
    expect(collected.status).toBe(0); expect(collected.stdout).toContain('collected first');
    expect(cli('apply', id).status).toBe(0);
    expect(state().issues[0]!.state).toBe('closed');
    // `undo` is gone: the agent's own git revert reverses the merge it named.
    expect(cli('undo', id).status).toBe(3);
  }));
});
