import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { changeConfig, loadRecord, loadSettings, postBounty, renderConfig } from '../../../packages/box-bounty/index.js';
import { fixture, postedFixture } from './github-fixture.js';
import { recordFirstMerge } from '../../../packages/box-bounty/settings.js';
import { CLI_DIST, git, makeRepo, runRoot, write } from './support.js';

const cli = (root: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: root, encoding: 'utf8', env: process.env, timeout: 30000 });

it('direct apply records the receiving repository after its remote changes', () => postedFixture(({ repo, id }) => {
  git(repo, ['remote', 'set-url', 'origin', 'https://github.com/fork/project.git']);
  const applied = cli(repo, 'apply', id, '1');
  const commit = git(repo, ['rev-parse', 'HEAD']);
  expect(applied.status).toBe(0);
  expect(applied.stdout).toContain(`was merged into fork/project, commit ${commit}`);
  expect(loadSettings().firstMerges).toEqual({ 'fork/project': { commit, at: expect.any(String) } });
  expect(loadRecord(repo, id).github?.repository).toBe('owner/project');
  git(repo, ['remote', 'rename', 'origin', 'renamed']);
  git(repo, ['remote', 'set-url', 'renamed', 'https://github.com/owner/project.git']);
  const status = cli(repo, 'status');
  expect(status.status).toBe(0);
  expect(status.stdout).toContain(`first outside solution merged in fork/project: commit ${commit}`);
  expect(status.stdout).not.toContain('first outside solution merged in owner/project');
  expect(renderConfig(repo)).toContain(`first outside solution merged in fork/project: commit ${commit}`);
}, { prAuthor: 'solver', collected: true }));

it('recognition records the receiving repository and retains that address in later status', () => postedFixture(({ repo, id, waitingPr }) => {
  git(repo, ['remote', 'set-url', 'origin', 'https://github.com/fork/project.git']);
  git(repo, ['merge', '--no-ff', '-s', 'ours', '-m', 'land collected solution', waitingPr]);
  const commit = git(repo, ['rev-parse', 'HEAD']);
  const recognised = cli(repo, 'status');
  expect(recognised.status).toBe(0);
  expect(recognised.stdout).toContain(`was merged into fork/project, commit ${commit}`);
  expect(loadRecord(repo, id).stage).toBe('applied');
  expect(loadRecord(repo, id).github?.repository).toBe('owner/project');
  expect(loadSettings().firstMerges).toEqual({ 'fork/project': { commit, at: expect.any(String) } });
  git(repo, ['remote', 'set-url', 'origin', 'https://github.com/owner/project.git']);
  const again = cli(repo, 'status');
  expect(again.status).toBe(0);
  expect(again.stdout).not.toContain('Tell the owner');
  expect(again.stdout).toContain(`first outside solution merged in fork/project: commit ${commit}`);
}, { prAuthor: 'solver', collected: true }));

it('independent bounties in same-address copies notify once and a different receiving repository notifies separately', () => {
  const shared = join(runRoot('BT8a-first-merge-settings'), 'settings');
  mkdirSync(shared);
  writeFileSync(join(shared, 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', default: { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [] } }));
  const ids: string[] = [], commits: string[] = [], notices: boolean[] = [];
  const journeys: readonly [string, string][] = [['first independent bounty', 'owner/project'], ['second independent bounty', 'OWNER/PROJECT'], ['third independent bounty', 'fork/project']];
  for (const [title, address] of journeys) {
    fixture(({ repo, id, pr }) => {
      process.env.BOX_BOUNTY_SETTINGS_DIR = shared;
      ids.push(id);
      postBounty(repo, id, 'github');
      pr('solver');
      expect(cli(repo, 'look', id, '1').status).toBe(0);
      git(repo, ['remote', 'rename', 'origin', 'renamed']);
      if (address !== 'owner/project') git(repo, ['remote', 'set-url', 'renamed', `https://github.com/${address}.git`]);
      const applied = cli(repo, 'apply', id, '1');
      expect(applied.status).toBe(0);
      notices.push(applied.stdout.includes('Tell the owner'));
      commits.push(git(repo, ['rev-parse', 'HEAD']));
      expect(loadSettings().firstMerges[address.toLowerCase()]?.commit).toBe(address === 'OWNER/PROJECT' ? commits[0] : commits.at(-1));
      expect(loadSettings().repositories).toEqual({});
      if (address === 'fork/project') {
        expect(loadSettings().firstMerges).toEqual({
          'owner/project': { commit: commits[0], at: expect.any(String) },
          'fork/project': { commit: commits[2], at: expect.any(String) }
        });
      }
    }, title);
  }
  expect(new Set(ids).size).toBe(3);
  expect(notices).toEqual([true, false, true]);
}, 120000);

it('an unavailable receiving identity does not refuse a landed merge or borrow its publication address', () => postedFixture(({ repo, id }) => {
  git(repo, ['remote', 'add', 'other', 'https://github.com/fork/project.git']);
  const applied = cli(repo, 'apply', id, '1');
  const commit = git(repo, ['rev-parse', 'HEAD']);
  expect(applied.status).toBe(0);
  expect(applied.stdout).toContain(`was merged into this local repository, commit ${commit}`);
  expect(applied.stdout).toContain('receiving GitHub address could not be determined');
  expect(applied.stdout).not.toContain('was merged into owner/project');
  expect(loadSettings().firstMerges).toEqual({});
  expect(loadRecord(repo, id).stage).toBe('applied');
}, { prAuthor: 'solver', collected: true }));

it('recognition without one receiving address saves a local notice and does not ask again', () => postedFixture(({ repo, id, waitingPr }) => {
  git(repo, ['remote', 'add', 'other', 'https://github.com/fork/project.git']);
  git(repo, ['merge', '--no-ff', '-s', 'ours', '-m', 'land collected solution', waitingPr]);
  const commit = git(repo, ['rev-parse', 'HEAD']);
  const status = cli(repo, 'status');
  expect(status.status).toBe(0);
  expect(status.stdout).toContain(`was merged into this local repository, commit ${commit}`);
  expect(status.stdout).not.toContain('was merged into owner/project');
  expect(status.stdout).toContain(`first outside solution merged in local repository ${JSON.stringify(repo)}: commit ${commit}`);
  expect(cli(repo, 'status').stdout).not.toContain('Tell the owner');
  expect(loadRecord(repo, id).stage).toBe('applied');
  expect(loadSettings().firstMerges).toEqual({});
}, { prAuthor: 'solver', collected: true }));

it('independent local-folder bounties notify once when a GitHub address is later added', () => {
  const repo = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
  const scratch = runRoot('BT8a-local-merge'), deliveries = join(scratch, 'deliveries'), returned = join(scratch, 'returned');
  changeConfig(repo, 'set', 'all-projects', 'true');
  write(repo, '.box/limits.json', JSON.stringify({ allowedDestinations: [deliveries] }));
  const ids: string[] = [], notices: boolean[] = [];
  let firstCommit = '';
  for (const n of [1, 2, 3]) {
    if (n === 3) git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/project.git']);
    const created = cli(repo, 'create', '--task', 'TASK.md', '--why', 'independent eyes', '--title', `local repair ${n}`, '--out', join(scratch, `bounty-${n}`));
    expect(created.status).toBe(0);
    const id = /(bt-[a-f\d]+) — drafted/.exec(created.stdout)?.[1];
    if (id === undefined) throw new Error('create did not name its bounty');
    ids.push(id);
    const resume = loadRecord(repo, id).resume;
    expect(resume?.kind).toBe('recorded');
    if (resume?.kind === 'recorded') expect(resume.changed.some(path => path.startsWith('.box/bounties/'))).toBe(false);
    expect(cli(repo, 'post', id, '--to', deliveries).status).toBe(0);
    cpSync(join(deliveries, id), join(returned, String(n)), { recursive: true });
    expect(existsSync(join(deliveries, id, 'repo', '.box', 'bounties', 'FIRST_MERGE'))).toBe(false);
    write(join(returned, String(n)), 'repo/app.txt', `fixed ${n}\n`);
    expect(cli(repo, 'look', id, '--from', join(returned, String(n))).status).toBe(0);
    const applied = cli(repo, 'apply', id, '1');
    const commit = git(repo, ['rev-parse', 'HEAD']);
    expect(applied.status).toBe(0);
    notices.push(applied.stdout.includes('Tell the owner'));
    if (n === 1) {
      firstCommit = commit;
      expect(applied.stdout).toContain(`was merged into this local repository, commit ${commit}`);
      expect(applied.stdout).toContain('receiving GitHub address could not be determined');
    }
    expect(loadRecord(repo, id).stage).toBe('applied');
  }
  expect(new Set(ids).size).toBe(3);
  expect(notices).toEqual([true, false, false]);
  const marker = JSON.parse(readFileSync(join(repo, '.box', 'bounties', 'FIRST_MERGE'), 'utf8'));
  expect(marker).toMatchObject({ kind: 'box-local-first-merge', repository: repo, commit: firstCommit });
  const status = cli(repo, 'status');
  expect(status.status).toBe(0);
  expect(status.stdout).toContain(`first outside solution merged in local repository ${JSON.stringify(repo)}: commit ${firstCommit}`);
  expect(status.stdout).not.toContain('corrupt');
  expect(renderConfig(repo)).toContain(`commit ${firstCommit}`);
  expect(loadSettings().firstMerges).toEqual({});
  expect(loadSettings().repositories).toEqual({});
});

it.each([false, true])('a foreign or malformed local marker is preserved after apply with readable address %s', readable => postedFixture(({ repo, id }) => {
  if (!readable) git(repo, ['remote', 'remove', 'origin']);
  const marker = join(repo, '.box', 'bounties', 'FIRST_MERGE');
  writeFileSync(marker, 'foreign bytes\n');
  const applied = cli(repo, 'apply', id, '1');
  expect(applied.status).toBe(0);
  expect(applied.stdout).toContain(`commit ${git(repo, ['rev-parse', 'HEAD'])}`);
  expect(applied.stdout).toContain('first-merge-notice-malformed');
  expect(applied.stdout).toContain('the merge stands');
  expect(readFileSync(marker, 'utf8')).toBe('foreign bytes\n');
  expect(loadRecord(repo, id).stage).toBe('applied');
  expect(loadSettings().firstMerges).toEqual({});
}, { prAuthor: 'solver', collected: true }));

it('local notice persistence does not follow a linked marker or parent', () => {
  const commit = 'a'.repeat(40);
  for (const linked of ['marker', 'box', 'bounties']) {
    const repo = makeRepo({ 'a.txt': 'a\n' }), outside = runRoot('BT8a-first-merge-foreign');
    const sentinel = join(outside, 'FIRST_MERGE');
    writeFileSync(sentinel, 'owned by another writer\n');
    if (linked === 'box') symlinkSync(outside, join(repo, '.box'), 'junction');
    else {
      mkdirSync(join(repo, '.box'));
      if (linked === 'bounties') symlinkSync(outside, join(repo, '.box', 'bounties'), 'junction');
      else {
        mkdirSync(join(repo, '.box', 'bounties'));
        symlinkSync(sentinel, join(repo, '.box', 'bounties', 'FIRST_MERGE'), 'file');
      }
    }
    expect(recordFirstMerge(repo, commit)).toContain('first-merge-notice-unsafe-path');
    expect(readFileSync(sentinel, 'utf8')).toBe('owned by another writer\n');
    expect(loadSettings().firstMerges).toEqual({});
  }
});

it('a local first-merge fact is excluded from the next public work-in-progress commit', () => fixture(({ repo, id, state }) => {
  const config = join(repo, '.git', 'config'), before = readFileSync(config, 'utf8');
  git(repo, ['remote', 'remove', 'origin']);
  const firstCommit = git(repo, ['rev-parse', 'HEAD']);
  expect(recordFirstMerge(repo, firstCommit)).toContain('This notice is recorded once');
  writeFileSync(config, before);
  write(repo, 'app.txt', 'owner work in progress\n');
  const preview = cli(repo, 'post', id, '--to', 'github', '--preview', '--with-changes');
  expect(preview.status).toBe(0);
  expect(preview.stdout).toContain('app.txt');
  expect(preview.stdout).not.toContain('FIRST_MERGE');
  postBounty(repo, id, 'github', { choice: { withChanges: true, include: [] } });
  const publication = loadRecord(repo, id).github;
  if (publication === undefined) throw new Error('post did not record its publication');
  const wip = publication.wip;
  if (wip === undefined || wip === null) throw new Error('post did not record its work in progress');
  expect(wip.changed).toContain('app.txt');
  expect([...wip.changed, ...wip.added, ...wip.deleted].some(path => path.startsWith('.box/bounties/'))).toBe(false);
  expect(git(repo, ['ls-tree', '-r', '--name-only', publication.commit])).not.toContain('FIRST_MERGE');
  expect(state().issues).toHaveLength(1);
  expect(state().issues[0]?.body).not.toContain('FIRST_MERGE');
}));
