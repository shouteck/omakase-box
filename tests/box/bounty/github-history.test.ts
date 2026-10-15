import { existsSync, lstatSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBounty, closeBounty, loadRecord, lookBounty, allowBounty, postBounty, previewGitHub, renderStatus } from '../../../packages/box-bounty/index.js';
import { approveGitHub } from '../../../packages/box-bounty/github.js';
import { fingerprint, git, runRoot, write } from './support.js';
import { git as objectGit, gitWriteBlob } from '../../../packages/box-bounty/git.js';
import { fixture, postedFixture, refused } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';

// BT6a: the bounty branch is real history — the newest commit GitHub already
// had, the poster's unpushed commits, and at most one tool-built commit of
// work the agent named. These tests stand on the shared offline fixture: the
// bare remote is github.com, the stand-in gh is the API.

const choice = (withChanges: boolean, include: readonly string[] = []) => ({ withChanges, include });

// A pre-BT8 record: stage 'confirmed' with the githubApproval the removed
// `confirm` command wrote. approveGitHub computes the plan as it did then;
// the rest is the exact on-disk shape — the post path must still publish
// exactly what was approved, or refuse the drift by name.
function legacyConfirmed(repo: string, id: string, githubChoice: { withChanges: boolean; include: readonly string[] }): void {
  const record = loadRecord(repo, id);
  record.stage = 'confirmed';
  record.events.push({ stage: 'confirmed', at: '2026-10-11T00:00:00.000Z', command: 'confirm' });
  record.githubApproval = approveGitHub(repo, record, githubChoice);
  const file = join(repo, '.box/bounties', `${id}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
}

// Whether this host can make file symlinks — Windows needs developer mode or
// an elevated account; the link-at-tracked-path test skips where it cannot.
const linkCapable = (() => {
  const probe = runRoot('bt6a-link-capable');
  const target = join(probe, 'target.txt');
  writeFileSync(target, 'x');
  try { symlinkSync(target, join(probe, 'link.txt'), 'file'); return lstatSync(join(probe, 'link.txt')).isSymbolicLink(); }
  catch { return false; }
})();

describe('the GitHub bounty as an issue on the code that is already there', () => {
  it('publishes unpushed commits unchanged — count, identifiers and order preserved', () => fixture(({ repo, bare, id, state }) => {
    write(repo, 'one.txt', 'one\n'); git(repo, ['add', 'one.txt']);
    git(repo, ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid', 'commit', '-qm', 'first local']);
    write(repo, 'two.txt', 'two\n'); git(repo, ['add', 'two.txt']);
    git(repo, ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid', 'commit', '-qm', 'second local']);
    const [c1, c2] = git(repo, ['rev-list', '--topo-order', 'HEAD']).split('\n');
    const base = git(repo, ['rev-parse', 'HEAD~2']);
    const head = git(repo, ['rev-parse', 'HEAD']);
    const preview = previewGitHub(repo, id);
    expect(preview).toContain('commits published for the first time (2)');
    expect(preview).toContain(`${c2!.slice(0, 12)} first local`);
    expect(preview).toContain(`${c1!.slice(0, 12)} second local`);
    expect(preview).toContain(`Base: commit ${base}`);
    const result = postBounty(repo, id, 'github');
    const pub = result.record.github!;
    expect(pub.base).toBe(base);
    expect(pub.commit).toBe(head);
    expect(pub.pushed!.map(commit => commit.sha)).toEqual([c2, c1]);
    // Identical history on the remote: same shas, same parents, same order.
    expect(git(bare, ['rev-list', '--topo-order', `refs/heads/${pub.branch}`])).toBe(git(repo, ['rev-list', '--topo-order', 'HEAD']));
    const issue = state().issues[0]!;
    expect(issue.body).toContain(`2 commit(s) on top of that commit`);
    expect(issue.body).toContain(`\`${c2!.slice(0, 12)}\` first local`);
  }));

  it('uncommitted changes stay home unless the task is said to need them', () => fixture(({ repo, id, bare }) => {
    write(repo, 'app.txt', 'uncommitted\n');
    const head = git(repo, ['rev-parse', 'HEAD']);
    const preview = previewGitHub(repo, id);
    expect(preview).toContain('1 file(s) stay home');
    const result = postBounty(repo, id, 'github');
    expect(result.record.github!.commit).toBe(head);
    expect(result.record.github!.wipCommit).toBeUndefined();
    // The branch is the public commit only; the worktree keeps its change.
    expect(git(bare, ['show', `${result.record.github!.branch}:app.txt`])).toBe('broken');
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('uncommitted\n');
  }));

  it('--with-changes lands every tracked change as one named tool commit, built without touching worktree, index or HEAD', () => fixture(({ repo, bare, id, scratch }) => {
    write(repo, 'app.txt', 'work in progress\n');
    write(repo, 'new.txt', 'added but tracked\n'); git(repo, ['add', 'new.txt']);
    const before = fingerprint(repo);
    const head = git(repo, ['rev-parse', 'HEAD']);
    const preview = previewGitHub(repo, id, choice(true));
    expect(preview).toContain('the tool\'s work-in-progress commit');
    expect(preview).toContain('files changed in the work-in-progress commit: app.txt');
    expect(preview).toContain('files added in the work-in-progress commit: new.txt');
    const result = postBounty(repo, id, 'github', { choice: choice(true) });
    const pub = result.record.github!;
    expect(pub.wipCommit).toMatch(/^[a-f\d]{40}$/);
    expect(pub.wip!.changed).toEqual(['app.txt']);
    expect(pub.wip!.added).toEqual(['new.txt']);
    expect(pub.commit).toBe(pub.wipCommit);
    expect(pub.pushed!.map(commit => commit.sha)).toEqual([pub.wipCommit]);
    expect(git(repo, ['rev-parse', `${pub.commit}^`])).toBe(head);
    expect(git(repo, ['log', '-1', '--format=%an', pub.commit])).toBe('box-bounty');
    // Solvers cloning the branch see the work in progress as ordinary history.
    const clone = join(scratch, 'solver');
    git(repo, ['clone', '--single-branch', '--branch', pub.branch, bare, clone]);
    // The blob bytes are the real invariant — the clone's checkout may fold
    // line endings under its own autocrlf.
    expect(git(bare, ['show', `${pub.branch}:app.txt`])).toBe('work in progress');
    expect(git(bare, ['show', `${pub.branch}:new.txt`])).toBe('added but tracked');
    // The owner's worktree, index and HEAD never moved.
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(fingerprint(repo)).toEqual(before);
    expect(git(repo, ['status', '--porcelain'])).toContain('M app.txt');
  }));

  it('--include publishes only the untracked files named, and refuses the rest of the family', () => fixture(({ repo, id, bare }) => {
    write(repo, 'notes/hint.txt', 'look here\n');
    write(repo, 'notes/stay.txt', 'stays home\n');
    write(repo, 'stray.log', 'home too\n');
    const preview = previewGitHub(repo, id, choice(false, ['notes/hint.txt']));
    expect(preview).toContain('published by name: notes/hint.txt');
    refused(() => previewGitHub(repo, id, choice(false, ['notes/no-such.txt'])), 'github-include-invalid');
    refused(() => previewGitHub(repo, id, choice(false, ['.env.local'])), 'github-include-invalid'); // missing first — existence is checked before rules
    write(repo, '.env.local', 'SECRET\n');
    refused(() => previewGitHub(repo, id, choice(false, ['.env.local'])), 'github-include-never-ship');
    refused(() => previewGitHub(repo, id, choice(false, ['app.txt'])), 'github-include-invalid'); // tracked, not untracked
    refused(() => previewGitHub(repo, id, choice(false, ['notes'])), 'github-include-invalid'); // a directory, not a file
    refused(() => previewGitHub(repo, id, choice(false, ['../outside.txt'])), 'github-include-invalid');
    // Naming an untracked file for publishing holds that one bounty for the
    // owner, whatever the standing decision says (BT8).
    refused(() => postBounty(repo, id, 'github', { choice: choice(false, ['notes/hint.txt']) }), 'publish-held');
    expect(loadRecord(repo, id).waiting?.reason).toBe('untracked-file');
    allowBounty(repo, id);
    const pub = loadRecord(repo, id).github!;
    expect(pub.wip!.added).toEqual(['notes/hint.txt']);
    expect(git(bare, ['show', `${pub.branch}:notes/hint.txt`])).toBe('look here');
    expect(git(bare, ['ls-tree', '-r', '--name-only', pub.branch])).not.toContain('stay.txt');
    expect(git(bare, ['ls-tree', '-r', '--name-only', pub.branch])).not.toContain('stray.log');
    expect(git(bare, ['ls-tree', '-r', '--name-only', pub.branch])).not.toContain('.env.local');
  }), 120000);

  it('refuses work the task needs when it touches a never-ship path — worktree or staged, it publishes nothing', () => fixture(({ repo, id }) => {
    write(repo, '.env', 'CHANGED\n');
    write(repo, 'key.pem', 'x\n'); git(repo, ['add', '-f', 'key.pem']);
    refused(() => previewGitHub(repo, id, choice(true)), 'github-never-ship');
    refused(() => postBounty(repo, id, 'github', { choice: choice(true) }), 'github-never-ship');
    expect(loadRecord(repo, id).github).toBeUndefined();
  }));

  it('refuses an unpushed commit that touches a never-ship path', () => fixture(({ repo, id }) => {
    write(repo, 'app.txt', 'legit\n'); git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid', 'commit', '-qm', 'legit']);
    write(repo, '.env', 'CHANGED\n'); git(repo, ['add', '-f', '.env']);
    git(repo, ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid', 'commit', '-qm', 'touches env']);
    refused(() => previewGitHub(repo, id), 'github-never-ship');
    expect(git(repo, ['rev-list', '--count', 'HEAD'])).toBe('3');
  }));

  it('refuses a pushed range that hides a never-ship path inside a root commit', () => fixture(({ repo, id }) => {
    // An orphan root plants payload/.env; a merge pulls it into the branch
    // but drops the file in the merge's own tree — no 'A' survives anywhere
    // and no 'D' ever exists. Only diffing the root against the empty tree
    // sees it; the failed `sha^` a root has used to scan as "no paths".
    const env = { GIT_INDEX_FILE: join(runRoot('bt6a-root-plant'), 'index') };
    objectGit(repo, ['read-tree', '--empty'], env);
    const secret = gitWriteBlob(repo, Buffer.from('LEAKED_SECRET_BYTES\n'));
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${secret},payload/.env`], env);
    const orphan = objectGit(repo, ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid', 'commit-tree', objectGit(repo, ['write-tree'], env), '-m', 'orphan plant'], env);
    const head = git(repo, ['rev-parse', 'HEAD']);
    const headTree = git(repo, ['rev-parse', 'HEAD^{tree}']);
    const merge = objectGit(repo, ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid', 'commit-tree', headTree, '-p', head, '-p', orphan, '-m', 'pull in the orphan'], env);
    git(repo, ['update-ref', 'refs/heads/main', merge]);
    refused(() => previewGitHub(repo, id), 'github-never-ship');
    refused(() => postBounty(repo, id, 'github'), 'github-never-ship');
    expect(loadRecord(repo, id).github).toBeUndefined();
  }));

  it('refuses to post when the recorded approval carries only some plan fields', () => fixture(({ repo, id }) => {
    legacyConfirmed(repo, id, choice(false));
    // Delete one plan field — some-but-not-all is a corrupt record, not a
    // pre-wave approval; falling back would post a snapshot never approved.
    const file = join(repo, '.box/bounties', `${id}.json`);
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { githubApproval: Record<string, unknown> };
    delete parsed.githubApproval['tip'];
    writeFileSync(file, JSON.stringify(parsed));
    refused(() => postBounty(repo, id, 'github'), 'record-corrupt');
    expect(loadRecord(repo, id).github).toBeUndefined();
  }));

  it.runIf(linkCapable)('refuses a link at a tracked path — file contents are published, never links', () => fixture(({ repo, id, scratch }) => {
    // A link where a tracked file should be: placing it through stat/readFile
    // would hash the TARGET's bytes under the clean name. lstat refuses it.
    const target = join(scratch, '.env.local');
    writeFileSync(target, 'LINKED_SECRET\n');
    rmSync(join(repo, 'app.txt'));
    symlinkSync(target, join(repo, 'app.txt'), 'file');
    expect(git(repo, ['status', '--porcelain'])).toContain('T app.txt');
    refused(() => previewGitHub(repo, id, choice(true)), 'github-non-plain-path');
    refused(() => postBounty(repo, id, 'github', { choice: choice(true) }), 'github-non-plain-path');
    expect(loadRecord(repo, id).github).toBeUndefined();
  }));

  it('refuses a branch with no commit the remote has', () => fixture(({ repo, id }) => {
    git(repo, ['checkout', '--orphan', 'unrelated', '-q']);
    git(repo, ['rm', '-rf', '.', '-q']);
    write(repo, 'orphan.txt', 'unrelated\n'); git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid', 'commit', '-qm', 'unrelated history']);
    refused(() => previewGitHub(repo, id), 'github-no-public-base');
    git(repo, ['checkout', 'main', '-q']);
  }));

  it.each([
    ['an untracked file appears', 'github-preview-stale', (context: GithubFixture) => write(context.repo, 'stray.txt', 'new\n')],
    ['a tracked file changes that was never selected', 'github-preview-stale', (context: GithubFixture) => write(context.repo, 'app.txt', 'drifted\n')],
    ['the branch gains a commit', 'github-preview-stale', (context: GithubFixture) => { write(context.repo, 'drift.txt', 'x\n'); git(context.repo, ['add', 'drift.txt']); git(context.repo, ['-c', 'user.name=p', '-c', 'user.email=p@t', 'commit', '-qm', 'moved']); }],
    ['the remote loses its only ref', 'github-no-public-base', (context: GithubFixture) => { git(context.repo, ['push', 'https://github.com/owner/project.git', ':refs/heads/main']); }]
  ])('refuses a post that would disagree with the approved preview when %s', (_label, reason, drift) => fixture(context => {
    const { repo, id } = context;
    legacyConfirmed(repo, id, choice(false));
    const approved = readFileSync(join(repo, '.box/bounties', `${id}.json`));
    drift(context);
    refused(() => postBounty(repo, id, 'github'), reason);
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(approved);
  }));

  it('refuses when the remote gained the approved tip between preview and post', () => fixture(({ repo, id }) => {
    write(repo, 'local.txt', 'x\n'); git(repo, ['add', 'local.txt']);
    git(repo, ['-c', 'user.name=p', '-c', 'user.email=p@t', 'commit', '-qm', 'local work']);
    legacyConfirmed(repo, id, choice(false));
    // Someone pushed the same commits meanwhile — what was new is not anymore.
    git(repo, ['push', 'https://github.com/owner/project.git', 'main']);
    refused(() => postBounty(repo, id, 'github'), 'github-preview-stale');
  }));

  it('refuses a pull request whose history does not descend from the bounty branch', () => postedFixture(({ repo, id, prCommit }) => {
    // A commit on unrelated history — a fork that never saw the repository.
    // The master's own pull request waits at #1; this one registers at #2.
    const env = { GIT_INDEX_FILE: join(runRoot('bt6a-orphan'), 'index') };
    objectGit(repo, ['read-tree', '--empty'], env);
    const blob = gitWriteBlob(repo, Buffer.from('unrelated\n'));
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${blob},app.txt`], env);
    const tree = objectGit(repo, ['write-tree'], env);
    const sha = objectGit(repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit-tree', tree, '-m', 'unrelated']);
    prCommit(sha);
    refused(() => lookBounty(repo, id, 2), 'github-pr-not-descended');
  }));

  it('refuses a pull request that hides a never-ship path deep in its history but not in its final tree', () => postedFixture(({ repo, id, prCommit }) => {
    const pub = loadRecord(repo, id).github!;
    // Commit 1 plants a never-ship path; commit 2 removes it and fixes the
    // app. The union over the whole new history still refuses it.
    const env = { GIT_INDEX_FILE: join(runRoot('bt6a-sneak'), 'index') };
    objectGit(repo, ['read-tree', pub.commit], env);
    const secret = gitWriteBlob(repo, Buffer.from('SECRET\n'));
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${secret},deep/.envrc`], env);
    const t1 = objectGit(repo, ['write-tree'], env);
    const c1 = objectGit(repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit-tree', t1, '-p', pub.commit, '-m', 'plant'], env);
    objectGit(repo, ['read-tree', c1], env);
    objectGit(repo, ['update-index', '--force-remove', '--', 'deep/.envrc'], env);
    const fixed = gitWriteBlob(repo, Buffer.from('fixed\n'));
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${fixed},app.txt`], env);
    const t2 = objectGit(repo, ['write-tree'], env);
    const c2 = objectGit(repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit-tree', t2, '-p', c1, '-m', 'fix'], env);
    prCommit(c2, 'solver', ['app.txt']);
    refused(() => lookBounty(repo, id, 2), 'answer-never-ship');
    // The refusal changed nothing: no attempt was pinned.
    expect(loadRecord(repo, id).attempts ?? []).toHaveLength(0);
  }));

  it('refuses a pull request that drops a never-ship path planted inside a root commit it merges', () => postedFixture(({ repo, id, prCommit }) => {
    const pub = loadRecord(repo, id).github!;
    // A solver merges an orphan root carrying payload/.env, dropped in the
    // merge's own tree: no 'D' exists anywhere in the inbound range, so the
    // planted path can only be seen by diffing the root against the empty
    // tree — the same hole the outward scan had.
    const env = { GIT_INDEX_FILE: join(runRoot('bt6a-pr-root'), 'index') };
    objectGit(repo, ['read-tree', '--empty'], env);
    const secret = gitWriteBlob(repo, Buffer.from('LEAKED_SECRET_BYTES\n'));
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${secret},payload/.env`], env);
    const orphan = objectGit(repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit-tree', objectGit(repo, ['write-tree'], env), '-m', 'orphan plant'], env);
    objectGit(repo, ['read-tree', pub.commit], env);
    const fixed = gitWriteBlob(repo, Buffer.from('fixed\n'));
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${fixed},app.txt`], env);
    const tree = objectGit(repo, ['write-tree'], env);
    const head = objectGit(repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit-tree', tree, '-p', pub.commit, '-p', orphan, '-m', 'fix with a hitchhiker'], env);
    prCommit(head);
    refused(() => lookBounty(repo, id, 2), 'answer-never-ship');
    expect(loadRecord(repo, id).attempts ?? []).toHaveLength(0);
  }));

  it('refuses a pull request that changes nothing and one whose tree holds a submodule', () => postedFixture(({ repo, id, prCommit }) => {
    const pub = loadRecord(repo, id).github!;
    prCommit(pub.commit, 'solver', []);
    refused(() => lookBounty(repo, id, 2), 'answer-empty');
    // A gitlink entry (mode 160000) is a submodule — never materialized.
    const env = { GIT_INDEX_FILE: join(runRoot('bt6a-sub'), 'index') };
    objectGit(repo, ['read-tree', pub.commit], env);
    const fixed = gitWriteBlob(repo, Buffer.from('fixed\n'));
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${fixed},app.txt`], env);
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `160000,${pub.commit},vendor/sub`], env);
    const tree = objectGit(repo, ['write-tree'], env);
    const sha = objectGit(repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit-tree', tree, '-p', pub.commit, '-m', 'sub']);
    prCommit(sha);
    refused(() => lookBounty(repo, id, 3), 'answer-unsafe-path');
  }));

  it('collects an answer on an enormous pull-request history without running any of it', () => postedFixture(({ repo, id, prCommit }) => {
    const pub = loadRecord(repo, id).github!;
    // 100 solver commits chained on the bounty branch — fetched, read and
    // merged as history, with nothing in them ever executed.
    let parent = pub.commit;
    const env = { GIT_INDEX_FILE: join(runRoot('bt6a-huge'), 'index') };
    for (let n = 0; n < 100; n += 1) {
      objectGit(repo, ['read-tree', parent], env);
      const blob = gitWriteBlob(repo, Buffer.from(`${n}\n`));
      objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${blob},counter.txt`], env);
      const tree = objectGit(repo, ['write-tree'], env);
      parent = objectGit(repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit-tree', tree, '-p', parent, '-m', `solver ${n}`], env);
    }
    const sentinel = join(runRoot('bt6a-huge-sentinel'), 'ran');
    prCommit(parent, 'solver', ['counter.txt']);
    const result = lookBounty(repo, id, 2);
    expect(result.attempt.outcome).toBe('answered');
    expect(result.attempt.report.join('\n')).toContain('100 commit(s)');
    expect(existsSync(sentinel)).toBe(false);
  }), 120000);

  it('a returned .gitattributes names no filter or hook — nothing solver-carried executes on fetch, report or merge', () => postedFixture(({ repo, id, scratch, pr }) => {
    // The owner checkout HAS a filter configured that writes a sentinel if it
    // ever runs: only a foreign .gitattributes could select it for the answer.
    const sentinel = join(scratch, 'filter-ran');
    const trigger = join(scratch, 'trigger.cjs');
    writeFileSync(trigger, `require('fs').writeFileSync(${JSON.stringify(sentinel.replaceAll('\\', '/'))}, 'ran'); process.stdin.pipe(process.stdout);`);
    git(repo, ['config', 'filter.hostile.clean', `node ${trigger.replaceAll('\\', '/')}`]);
    pr('solver', { '.gitattributes': '* filter=hostile\n', 'hostile-hook.sh': `#!/bin/sh\ntouch ${sentinel.replaceAll('\\', '/')}\n` });
    const before = fingerprint(repo);
    const result = lookBounty(repo, id, 2);
    expect(result.attempt.outcome).toBe('answered');
    expect(existsSync(sentinel)).toBe(false);
    expect(applyBounty(repo, id, 2).outcome).toBe('applied');
    expect(existsSync(sentinel)).toBe(false);
    // It landed as ordinary bytes — it never ran anywhere in between.
    expect(readFileSync(join(repo, '.gitattributes'), 'utf8')).toBe('* filter=hostile\n');
  }));

  it('refuses to collect when the bounty branch was changed outside the tool', () => postedFixture(({ repo, bare, id, pr }) => {
    const prSha = pr();
    // Someone moves the remote branch — collection must stop, not compare
    // against whatever it points at now.
    const pub = loadRecord(repo, id).github!;
    git(bare, ['update-ref', `refs/heads/${pub.branch}`, prSha]);
    refused(() => lookBounty(repo, id, 2), 'github-branch-changed');
    // Closing too: the branch is not this tool's to remove, so the local
    // decision stands and the record names why the outside work is pending.
    closeBounty(repo, id, 'not wanted');
    expect(loadRecord(repo, id).github!.pending).toContain('github-branch-changed');
  }));

  it('closing a branch that carried work in progress names the commits before removing it', () => fixture(({ repo, bare, id, state }) => {
    write(repo, 'app.txt', 'work in progress\n');
    postBounty(repo, id, 'github', { choice: choice(true) });
    const pub = loadRecord(repo, id).github!;
    expect(pub.wipCommit).toBeDefined();
    closeBounty(repo, id);
    // The removal comment names every commit that existed only on that branch.
    const removal = state().comments.find(comment => comment.body.includes('is removed'));
    expect(removal).toBeDefined();
    expect(removal!.body).toContain(pub.wipCommit!);
    expect(removal!.body).toContain('box bounty ' + id + ': work in progress');
    expect(git(bare, ['branch', '--list', 'box-bounty/*'])).toBe('');
    expect(loadRecord(repo, id).github!.closedNote).toContain(pub.wipCommit!.slice(0, 12));
    // Retrying the close does not comment twice.
    closeBounty(repo, id);
    expect(state().comments.filter(comment => comment.body.includes('is removed'))).toHaveLength(1);
  }));
});
