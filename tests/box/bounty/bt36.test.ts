// BT36 — the owner records that a merged bounty's solver was paid:
// `box bounty config set paid <id>` writes the fact on the record (the
// amount copied from the bound reward, never typed; `by: 'owner'`), `... no`
// withdraws a mistaken record, status/status --json/the `box bounty`
// overview show owed or paid, and the fact travels the shared memory —
// never the issue (payment stays private between owner and solver).
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerGitHub, applyBounty, changeConfig, paymentOf, postBounty, renderStatus, sharedRead, syncChains } from '../../../packages/box-bounty/index.js';
import { sharedFixture } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, readRecordRaw, runRoot, writeRecordRaw } from './support.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: { ...process.env }, timeout: 60000 });

const id = (n: number) => `bt-${String(n).padStart(12, '0')}`;
const SHA = 'a'.repeat(40);
const AT = '2026-10-19T10:00:00.000Z';
const LINK = 'https://buy.stripe.com/test_' + '0EXAMPLE00000000000';

// An applied bounty record the way an applied GitHub bounty stores it:
// the reward bound at posting, the pay outcome the close recorded for a
// solution by GitHub account `solver`.
const applied = (repo: string, n: number, opts: { reward?: number } = {}) => {
  const rid = id(n);
  const reward = opts.reward ?? 5;
  writeRecordRaw(repo, rid, JSON.stringify({
    schemaVersion: 1, kind: 'box-bounty-record', id: rid,
    resume: { kind: 'not-recorded' }, noteSource: 'legacy',
    stage: 'applied', title: `bounty ${n}`, createdAt: AT,
    ...(reward > 0 ? { reward: { amount: reward } } : {}),
    events: [
      { stage: 'drafted', at: AT },
      { stage: 'posted', at: AT, destination: 'https://github.com/owner/project/issues/1' },
      { stage: 'answered', at: AT, attempt: 1 },
      { stage: 'applied', at: AT, attempt: 1, command: 'apply', merge: SHA }
    ],
    attempts: [{ n: 1, pullRequest: 1, at: AT, author: 'solver', commit: SHA, changed: ['a.txt'], added: [], deleted: [], outcome: 'answered', conflicts: null, report: [] }],
    github: {
      repository: 'owner/project', account: 'owner', kind: 'history',
      branch: `box-bounty/${rid}`, commit: SHA, title: `bounty ${n}`, body: '',
      state: 'closed', issue: { number: 1, url: 'https://github.com/owner/project/issues/1' }, pending: null,
      pay: { pr: 1, solver: 'solver', link: LINK, testMode: true, editedBy: null }
    }
  }, null, 2) + '\n');
  return rid;
};

// A bounty still open — posted with a reward, never merged.
const openPosted = (repo: string, n: number) => {
  const rid = id(n);
  writeRecordRaw(repo, rid, JSON.stringify({
    schemaVersion: 1, kind: 'box-bounty-record', id: rid,
    resume: { kind: 'not-recorded' }, noteSource: 'legacy',
    stage: 'posted', title: `bounty ${n}`, createdAt: AT,
    reward: { amount: 5 },
    events: [{ stage: 'drafted', at: AT }, { stage: 'posted', at: AT }]
  }, null, 2) + '\n');
  return rid;
};

const paidEvents = (repo: string, rid: string) =>
  (JSON.parse(readRecordRaw(repo, rid)) as { events: Record<string, unknown>[] }).events.filter(event => event['stage'] === 'paid');

describe('a merged bounty with a reward reads owed until the owner records paid', () => {
  it('status names whom is owed and the `box bounty` overview counts it', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = applied(repo, 1);
    const status = box(repo, ['status']);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('payment: owed $5 to solver (at the link they supplied)');
    expect(status.stdout).toContain(`box bounty config set paid ${rid}`);
    const overview = box(repo, []);
    expect(overview.status).toBe(0);
    expect(overview.stdout).toContain('1 payment(s) owed — box bounty status shows whom');
  });

  it('config set paid records the owner\'s word — amount from the bound reward, by owner — and the owed lines turn paid', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = applied(repo, 2);
    const run = box(repo, ['config', 'set', 'paid', rid]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('paid $5 to solver');
    const paid = paidEvents(repo, rid);
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ stage: 'paid', amount: 5, by: 'owner' });
    expect(paid[0]!['withdrawn']).toBeUndefined();
    // The record's stage did not move — the fact ends nothing.
    expect((JSON.parse(readRecordRaw(repo, rid)) as { stage: string }).stage).toBe('applied');
    const status = box(repo, ['status', rid]);
    expect(status.stdout).toMatch(/payment: paid \$5 on \d{4}-\d{2}-\d{2}/);
    expect(box(repo, []).stdout).not.toContain('payment(s) owed');
    // A second record on an already-paid bounty refuses by name.
    const again = box(repo, ['config', 'set', 'paid', rid]);
    expect(again.status).toBe(3);
    expect(again.stderr + again.stdout).toContain('paid-already-recorded');
  });

  it('config set paid <id> no withdraws the record — a second event marks it, history keeps both, owed again', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = applied(repo, 3);
    expect(box(repo, ['config', 'set', 'paid', rid]).status).toBe(0);
    const withdraw = box(repo, ['config', 'set', 'paid', rid, 'no']);
    expect(withdraw.status).toBe(0);
    const paid = paidEvents(repo, rid);
    expect(paid).toHaveLength(2);
    expect(paid[1]).toMatchObject({ stage: 'paid', amount: 5, by: 'owner', withdrawn: true });
    expect(box(repo, ['status', rid]).stdout).toContain('payment: owed $5');
    expect(box(repo, []).stdout).toContain('1 payment(s) owed');
  });

  it('a $0 reward or a bounty never merged refuses paid-nothing-owed and changes nothing; `no` on nothing recorded refuses too', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const zero = applied(repo, 4, { reward: 0 });
    const open = openPosted(repo, 5);
    const before = [zero, open].map(rid => readRecordRaw(repo, rid));
    for (const rid of [zero, open]) {
      const run = box(repo, ['config', 'set', 'paid', rid]);
      expect(run.status).toBe(3);
      expect(run.stderr + run.stdout).toContain('paid-nothing-owed');
    }
    expect([zero, open].map(rid => readRecordRaw(repo, rid))).toEqual(before);
    const rid = applied(repo, 6);
    const run = box(repo, ['config', 'set', 'paid', rid, 'no']);
    expect(run.status).toBe(3);
    expect(run.stderr + run.stdout).toContain('paid-not-recorded');
  });

  it('status --json carries the payment object as specified', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = applied(repo, 7);
    openPosted(repo, 8); // owes nothing — payment is null in the document
    const before = JSON.parse(box(repo, ['status', '--json']).stdout) as { bounties: { id: string; payment: unknown }[] };
    const owed = before.bounties.find(entry => entry.id === rid)!;
    expect(owed.payment).toEqual({ owed: 5, solver: 'solver', paidAt: null });
    expect(before.bounties.find(entry => entry.id === id(8))!.payment).toBeNull();
    expect(box(repo, ['config', 'set', 'paid', rid]).status).toBe(0);
    const after = JSON.parse(box(repo, ['status', '--json']).stdout) as { bounties: { id: string; payment: { owed: number; paidAt: string | null } | null }[] };
    const paid = after.bounties.find(entry => entry.id === rid)!.payment!;
    expect(paid.owed).toBe(0);
    expect(paid.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});

describe('the shared part carries the paid fact — and nothing else of the owner\'s settings', () => {
  const eventsOf = (repo: string, tip: string): Record<string, unknown>[] =>
    git(repo, ['rev-list', '--topo-order', '--reverse', tip]).split('\n').filter(line => line !== '').map(commit =>
      JSON.parse(git(repo, ['cat-file', 'blob', `${commit}:event.json`])) as Record<string, unknown>);
  const bareTip = (world: { bare: string }, rid: string): string | null => {
    const out = execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'ls-remote', world.bare, `refs/box-bounty/${rid}`], { encoding: 'utf8' }).trim();
    return out === '' ? null : out.split('\t')[0]!;
  };
  const secondMachine = (world: { bare: string }): string => {
    const clone = join(runRoot('bt36-machine-b'), 'repo');
    execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, clone], { encoding: 'utf8' });
    git(clone, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
    return clone;
  };

  it('config set paid lands a paid chain event; a second machine imports it and shows paid, then owed again on withdrawal', () => {
    { const world = sharedFixture(); world.run(() => {
      // The repository states $5 under a $50 limit — written before the post
      // so the bounty binds it at posting.
      writeFileSync(join(world.scratch, 'settings', 'settings.json'), JSON.stringify({
        kind: 'box-owner-settings',
        default: { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [] },
        projects: {},
        repositories: {
          'owner/project': { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [], reward: { amount: 5, at: '2026-10-13T00:00:00.000Z' }, rewardLimit: { amount: 50, at: '2026-10-13T00:00:00.000Z' } }
        }
      }, null, 2) + '\n');
      postBounty(world.repo, world.id, 'github');
      world.pr('solver');
      answerGitHub(world.repo, world.id, 1);
      const result = applyBounty(world.repo, world.id, 1);
      expect(result.outcome).toBe('applied');
      expect(renderStatus(world.repo)).toContain('payment: owed $5');

      const callsBefore = world.state().calls.length;
      const commentsBefore = world.state().comments.length;
      const text = changeConfig(world.repo, 'set', 'paid', world.id);
      expect(text).toContain('paid $5');
      // The command made no GitHub call — nothing about payment is posted.
      expect(world.state().calls.length).toBe(callsBefore);
      expect(world.state().comments.length).toBe(commentsBefore);

      // Exactly the allow-listed fields on the chain event — no settings.
      const events = eventsOf(world.repo, bareTip(world, world.id)!);
      const paid = events.filter(event => event['type'] === 'paid');
      expect(paid).toHaveLength(1);
      expect(Object.keys(paid[0]!).sort()).toEqual(['actor', 'amount', 'at', 'by', 'type', 'v']);
      expect(paid[0]).toMatchObject({ amount: 5, by: 'owner' });
      expect(JSON.stringify(paid[0])).not.toContain('solver');
      expect(JSON.stringify(paid[0])).not.toContain('buy.stripe.com');

      // A second machine's shared memory carries the paid fact.
      const other = secondMachine(world);
      syncChains(other, true);
      const shared = sharedRead(other, world.id);
      expect(shared?.stage).toBe('applied');
      expect(shared?.events.some(event => event.stage === 'paid' && event.amount === 5 && event.by === 'owner')).toBe(true);
      expect(paymentOf(shared!)?.paidAt).not.toBeNull();
      expect(renderStatus(other)).toContain('paid $5');

      // And the withdrawal travels the same way: owed again on both.
      expect(changeConfig(world.repo, 'set', 'paid', world.id, undefined, 'no')).toContain('withdrawn');
      syncChains(other, true);
      const withdrawn = sharedRead(other, world.id);
      expect(withdrawn?.events.some(event => event.stage === 'paid' && event.withdrawn === true)).toBe(true);
      expect(paymentOf(withdrawn!)?.paidAt).toBeNull();
      expect(renderStatus(other)).toContain('payment: owed $5');
      expect(renderStatus(other)).toContain('1 payment(s) owed');
    }); }
  });
});
