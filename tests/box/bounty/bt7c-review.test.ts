import { postToGitHub, collectPullRequest, applyGitHub, closeGitHub, statusGitHub } from './github-solver.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBounty, BountyRefused, closeBounty, finalizeBounty, loadRecord, lookBounty, persistRecord, planBounty, postBounty, renderDescribe, renderHelp, renderOpenLine, renderRules, renderRulesBlock, renderStatus, resolveRepoRoot } from '../../../packages/box-bounty/index.js';
import { postedFixture, sharedPostedFixture } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, openLine, readRecord, runRoot, write, writeRecord, writeRecordRaw } from './support.js';

// BT7c pass review — reproduced on 1ed01f9 by hand: a record written while
// `answer` was a command stores the answers text it printed (outside.answers)
// verbatim on disk. While GitHub cannot refresh, renderStatus replays the
// stored lines and renderOpenLine folds them into the open-bounties line —
// describe, the OPEN index and the owner's rules-file block — so a
// removed command is named by output the tool prints today. asRecord
// migrates github.pending for this reason; outside.answers got none.
it('a stored outside-answers text written before BT7c names no removed command', () => postedFixture(context => {
  const record = loadRecord(context.repo, context.id);
  if (record.github === undefined) throw new Error('publication missing');
  // The wording listGitHubAnswers wrote before BT7c, kept on disk by a record
  // that last refreshed while the old command existed.
  record.github.outside = {
    at: '2026-10-12T00:00:00Z',
    issueState: 'open',
    answers: `GitHub answers for ${context.id} against box-bounty/${context.id}:\n  #4 by solver: "app.txt"; new; collect: box bounty answer ${context.id} --pr 4`
  };
  persistRecord(context.repo, record);
  context.update({ fail: '/issues' }); // refresh cannot run — the stored text is what prints
  for (const gone of ['answer', 'questions', 'reply', 'undo', 'reject', 'withdraw', 'remind', 'confirm']) {
    expect(statusGitHub(context.repo, { id: context.id })).not.toContain(`bounty ${gone}`);
    expect(statusGitHub(context.repo, { id: context.id, full: true })).not.toContain(`bounty ${gone}`);
    expect(renderOpenLine(context.repo)).not.toContain(`bounty ${gone}`);
  }
}));

// The done-when asks for one test that searches every message the tool can
// print for the removed names. The corpus below is the reachable surface:
// every renderer (help, describe with and without a repository, the rules
// block, the open-bounties line, status in each mode), status over records
// in every reachable stage — including planted pre-wave stored text — every
// refusal a command path can raise, and the built CLI's own output for the
// journey and its usage errors. `box bounty <removed>` is the pattern: a
// command name the output *recommends*. The refusal echo `bounty answer
// refused (command-removed)` lacks the `box ` prefix and stays a statement
// of what was typed, never a suggestion.
const REMOVED_NAME = /\bbox bounty (?:answer|questions|reply|undo|reject|withdraw|remind|confirm)\b/;

describe('no output names a removed command', () => {
  // One posted world for the whole scan (K24): the single corpus `it` ran
  // past half its limit. The corpus and the grab helper live at describe
  // scope so each leg adds to the same accumulation — same scans, same
  // order, the leak check last.
  const world = sharedPostedFixture();
  const context = world;
  const { repo, id } = world;
  const cli = (...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8' });
  const corpus: Record<string, string> = {};
  const scan = (name: string, text: string): void => { corpus[name] = (corpus[name] ?? '') + '\n' + text; };
  // Refusals from each command path, collected as printed text.
  const grab = (fn: () => unknown): void => {
    try { fn(); } catch (error) {
      if (error instanceof BountyRefused) { scan('refusals', `refused (${error.reason}): ${error.message}`); return; }
      throw error;
    }
  };

  it('scans every renderer and every stored-record path the tool can reach', () => world.run(() => {
    // The comments path reads GitHub live — scan it while the stand-in still
    // answers, with a stranger's comment on the wire.
    context.update({ comments: [{ body: 'a question from a solver', user: { login: 'stranger' }, created_at: '2026-10-12T01:00:00Z' }] });
    scan('status-comments', statusGitHub(repo, { id, comments: true }));

    // Planted pre-wave stored text on the posted bounty: the old listing's
    // collect wording and a pending line written while `withdraw` existed.
    const planted = loadRecord(repo, id);
    if (planted.github === undefined) throw new Error('publication missing');
    planted.github.outside = {
      at: '2026-10-12T00:00:00Z',
      issueState: 'open',
      answers: `GitHub answers for ${id} against box-bounty/${id}:\n  #4 by solver: "app.txt"; new; collect: box bounty answer ${id} --pr 4`
    };
    planted.github.pending = `outside work is still owed; retry box bounty withdraw ${id}`;
    persistRecord(repo, planted);
    context.update({ fail: '/issues' }); // GitHub cannot refresh — stored text is what prints

    // A corrupt record exercises the not-a-readable-record line, and ended
    // records in stages only removed commands could leave cover the ended
    // renderings and their next steps.
    writeRecordRaw(repo, 'bt-corrupt', 'not json {');
    for (const [index, stage] of (['rejected', 'withdrawn', 'undone'] as const).entries()) {
      const made = finalizeBounty(planBounty({ repoPath: repo, title: `legacy ${stage}`, taskPath: join(repo, 'TASK.md'), why: 'older record', }));
      const record = readRecord(repo, made.id);
      record.stage = stage;
      record.events = [...record.events, { stage, at: `2026-10-12T00:00:0${index}Z` }];
      writeRecord(repo, record);
    }

    scan('help', renderHelp());
    scan('describe-no-repo', renderDescribe(null));
    scan('rules-no-repo', renderRules(null));
    scan('describe-repo', renderDescribe(repo));
    scan('rules-repo', renderRules(repo));
    scan('open-line', renderOpenLine(repo));
    scan('rules-block', renderRulesBlock('open'));
    scan('status', statusGitHub(resolveRepoRoot(repo)));
    scan('status-id', statusGitHub(repo, { id }));
    scan('status-full', statusGitHub(repo, { id, full: true }));
    try { scan('status-comments-stale', statusGitHub(repo, { id, comments: true })); } catch (error) { if (error instanceof BountyRefused) scan('status-comments-stale', `refused (${error.reason}): ${error.message}`); else throw error; }
    scan('open-file', openLine(repo));
  }));

  it('scans every refusal a command path can raise', () => world.run(() => {
    grab(() => loadRecord(repo, 'bt-000000000000'));
    grab(() => postToGitHub(repo, id));
    grab(() => postToGitHub(repo, id));
    grab(() => lookBounty(repo, id, 99));
    grab(() => lookBounty(repo, id, 1000));
    grab(() => applyBounty(repo, id, 99));
    const ended = finalizeBounty(planBounty({ repoPath: repo, title: 'close me', taskPath: join(repo, 'TASK.md'), why: 'ended', }));
    grab(() => closeGitHub(repo, ended.id, '   ')); // empty reason refused
    closeGitHub(repo, ended.id);
    grab(() => applyBounty(repo, ended.id)); // already-ended
  }));

  it('scans the built CLI journey output', () => world.run(() => {
    // The built CLI's own output: the journey and the removed-name refusals.
    if (!existsSync(CLI_DIST)) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    for (const args of [['help'], ['describe'], ['describe', '--rules'], ['status'], ['status', id], ['status', id, '--full'], ['status', id, '--comments'], ['look', id, '1'], ['close', id, '--reason'], ['frobnicate']]) {
      const run = cli(...args);
      scan(`cli-${args.join(' ')}`, `${run.stdout}\n${run.stderr}`);
    }
  }));

  it('scans the removed-name refusals and checks the corpus', () => world.run(() => {
    for (const gone of ['answer', 'questions', 'reply', 'undo', 'reject', 'withdraw', 'remind', 'confirm']) {
      const run = cli(gone, id);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('command-removed');
      scan(`cli-removed-${gone}`, run.stderr);
    }

    const leaks = Object.entries(corpus).filter(([, text]) => REMOVED_NAME.test(text)).map(([name]) => name);
    expect(leaks, `removed command names printed by: ${leaks.join(', ')}`).toEqual([]);
  }));
});
