// BT41 — what a new user reads is true and complete. Five assertions over the
// real surfaces (README, allow, help plus the promise cap, the posted issue
// body and format block, shared status) and the manual bite recorded in
// waves/BT41.md: revert one README line, make allow switch instructions on,
// and put `no solution yet` back on the shared branch — each makes its test
// fail. The bite is evidence, not an assertion kept in this file.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowRepository, finalizeBounty, loadRecord, planBounty, postBounty, sharedRead } from '../../../packages/box-bounty/index.js';
import { importShared } from '../../../packages/box-bounty/store.js';
import type { SharedRow } from '../../../packages/box-bounty/store.js';
import { fixture, refused } from './github-fixture.js';
import { CLI_DIST, ROOT, git, makeRepo, recordExists, runRoot, write } from './support.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

describe('BT41 — a stranger reads what the tool does', () => {
  it('README names the store, the shared refs, the instruction command, deny and the project tool files', () => {
    const readme = readFileSync(join(ROOT, 'FIRST-FIVE-MINUTES.md'), 'utf8');
    const openSummary = '.' + 'box/' + 'bounties/OPEN';
    const firstMerge = '.' + 'box/' + 'bounties/FIRST_MERGE';
    for (const fact of ['config set instructions true', 'refs/box-bounty', '.box/local', 'box bounty deny', openSummary, firstMerge]) {
      expect(readme, `README lacks ${fact}`).toContain(fact);
    }
    expect(readme).toContain('each project\'s own bounty records are in `.box/local/box.db`');
  });

  it('the untracked records line names legacy files, never the old folder as the store', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    write(repo, 'TASK.md', '# task\n');
    finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'a seeded draft' }));
    const oldFolder = '.' + 'box/' + 'bounties/';
    const line = `legacy record files: none in ${oldFolder} are tracked in Git (local to this checkout)`;
    for (const args of [['status', '--full'], ['config', '--full']]) {
      const run = box(repo, args);
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain(line);
      expect(run.stdout).not.toContain(`records: ${oldFolder}`);
    }
  });

  it('allow offers `config set instructions true` while instructions are off, not while on, and never switches them on', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const off = box(repo, ['allow', 'owner/project']);
    expect(off.status, off.stderr).toBe(0);
    expect(off.stdout).toContain('agents here learn of the tool only once instructions are on');
    expect(off.stdout).toContain('box bounty config set instructions true');
    expect(box(repo, ['config']).stdout).toContain('instructions: off');

    const on = box(repo, ['config', 'set', 'instructions', 'true']);
    expect(on.status, on.stderr).toBe(0);
    expect(box(repo, ['config']).stdout).toContain('instructions: on');

    const again = box(repo, ['allow', 'owner/project']);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).not.toContain('config set instructions true');
  });

  it('allow --help says the limit spans open bounties, and a $5 reward twice is refused at $8', () => {
    const help = box(runRoot('bt41-help'), ['allow', '--help']);
    expect(help.status, help.stderr).toBe(0);
    const line = help.stdout.split('\n').find(text => text.trimStart().startsWith('--reward-limit'));
    expect(line, 'allow --help names --reward-limit').toBeDefined();
    expect(line).toContain('across');
    expect(line).toContain('open bounties');

    fixture(({ repo, id }) => {
      // The first post succeeds; the second would bring the promise to $10
      // against the owner's $8 limit — refused by name, nothing changed.
      allowRepository(repo, 'owner/project', false, { reward: '5', rewardLimit: '8' });
      postBounty(repo, id, 'github');
      const second = finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'a second handoff' }));
      refused(() => postBounty(repo, second.id, 'github'), 'promise-limit-exceeded');
    });
  });

  it('the public issue with no note points at the task above, and its format block is byte-identical to master\'s shape', () => {
    fixture(({ repo, id, state }) => {
      postBounty(repo, id, 'github');
      const body = state().issues[0]!.body;
      expect(body).not.toContain('is not published');
      expect(body).toContain('What the poster tried is in the task above — the tool asks agents to put it there.');

      // The exact bytes master's formatFor produced for this record: a fresh
      // $0 post is schemaVersion 2, open, no pushed work (BT11a/BT11b rules
      // are unchanged). Written out here, never read back through format.ts.
      const record = loadRecord(repo, id);
      const publication = record.github!;
      const expectedBlock = `<!-- box-bounty-format\n${JSON.stringify({
        schemaVersion: 2,
        kind: 'box-bounty',
        id: record.id,
        repository: publication.repository,
        workCommit: publication.commit,
        branch: publication.branch,
        withChanges: false,
        createdAt: record.createdAt,
        state: { kind: 'open' },
        reward: { amount: 0, currency: 'USD' },
        terms: 'merged-solution-earns-whole'
      })}\n-->\n`;
      const at = body.indexOf('<!-- box-bounty-format');
      expect(at, 'the posted body carries the format block').toBeGreaterThanOrEqual(0);
      expect(body.slice(at)).toBe(expectedBlock);
    });
  });

  it('a shared-only posted record says its solution state is not refreshed here, and its next step points at GitHub or the poster\'s checkout', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const id = 'bt-111111111111';
    const at = '2026-09-30T00:00:00.000Z';
    const issue = 'https://github.com/owner/project/issues/7';
    importShared(repo, [{
      id, stage: 'posted', open: true,
      createdAt: at, updatedAt: at, endedAt: null,
      record: {
        schemaVersion: 1, kind: 'box-bounty-record', id,
        title: 'shared seed', noteSource: 'legacy', stage: 'posted',
        content: { task: { file: '(shared)', text: 'task text' }, note: null, tool: 'box-bounty@0.1.0' },
        createdAt: at,
        resume: { kind: 'not-recorded' },
        events: [{ stage: 'posted', at, destination: issue }],
        attempts: [],
        github: {
          repository: 'owner/project', account: 'poster', kind: 'history',
          branch: `box-bounty/${id}`, commit: 'a'.repeat(40), title: 'shared seed',
          body: '', state: 'posted', issue: { number: 7, url: issue }, pending: null
        },
        shared: true
      } as SharedRow['record'],
      searchText: `${id}\nshared seed`
    }]);
    const rowBefore = JSON.stringify(sharedRead(repo, id));

    const status = box(repo, ['status']);
    expect(status.status, status.stderr).toBe(0);
    expect(status.stdout).toContain('posted from another machine (shared bounty memory)');
    expect(status.stdout).not.toContain('no solution yet');
    const nextLine = status.stdout.split('\n').find(text => text.trimStart().startsWith('next:'));
    expect(nextLine, 'the shared bounty prints one next: line').toBeDefined();
    const nextText = nextLine!.trimStart().slice('next: '.length);
    expect(nextText).toContain('GitHub');
    expect(nextText).toContain('checkout');
    expect(nextText).not.toContain('box bounty look');
    expect(nextText).not.toContain('box bounty apply');

    const doc = JSON.parse(box(repo, ['status', '--json']).stdout) as { bounties: { id: string; next: string }[] };
    expect(doc.bounties.find(entry => entry.id === id)?.next).toBe(nextText);

    // The row and the chain stay untouched — this is a read.
    expect(recordExists(repo, id)).toBe(false);
    expect(git(repo, ['for-each-ref', 'refs/box-bounty'])).toBe('');
    expect(JSON.stringify(sharedRead(repo, id))).toBe(rowBefore);
  });
});
