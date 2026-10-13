import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBounty, BountyRefused, closeBounty, confirmBounty, finalizeBounty, loadRecord, lookBounty, persistRecord, planBounty, postBounty, renderDescribe, renderHelp, renderOpenLine, renderRules, renderRulesBlock, renderStatus, resolveRepoRoot } from '../../../packages/box-bounty/index.js';
import type { BountyRecord } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, runRoot, write } from './support.js';

// BT7c pass review — reproduced on 1ed01f9 by hand: a record written while
// `answer` was a command stores the answers text it printed (outside.answers)
// verbatim on disk. While GitHub cannot refresh, renderStatus replays the
// stored lines and renderOpenLine folds them into the open-bounties line —
// describe, .box/bounties/OPEN and the owner's rules-file block — so a
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
  for (const gone of ['answer', 'questions', 'reply', 'undo', 'reject', 'withdraw', 'remind']) {
    expect(renderStatus(context.repo, { id: context.id })).not.toContain(`bounty ${gone}`);
    expect(renderStatus(context.repo, { id: context.id, full: true })).not.toContain(`bounty ${gone}`);
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
const REMOVED_NAME = /\bbox bounty (?:answer|questions|reply|undo|reject|withdraw|remind)\b/;

describe('no output names a removed command', () => {
  it('scans every renderer, refusal and CLI print path the tool can reach', () => postedFixture(context => {
    const { repo, id } = context;
    const corpus: Record<string, string> = {};
    const scan = (name: string, text: string): void => { corpus[name] = (corpus[name] ?? '') + '\n' + text; };

    // The comments path reads GitHub live — scan it while the stand-in still
    // answers, with a stranger's comment on the wire.
    context.update({ comments: [{ body: 'a question from a solver', user: { login: 'stranger' }, created_at: '2026-10-12T01:00:00Z' }] });
    scan('status-comments', renderStatus(repo, { id, comments: true }));

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
    writeFileSync(join(repo, '.box', 'bounties', 'bt-corrupt.json'), 'not json {');
    for (const [index, stage] of (['rejected', 'withdrawn', 'undone'] as const).entries()) {
      const made = finalizeBounty(planBounty({ repoPath: repo, title: `legacy ${stage}`, taskPath: join(repo, 'TASK.md'), why: 'older record', outDir: join(runRoot(`bt7c-${stage}`), 'bounty') }));
      const file = join(repo, '.box', 'bounties', `${made.id}.json`);
      const record = JSON.parse(readFileSync(file, 'utf8')) as BountyRecord;
      record.stage = stage;
      record.events = [...record.events, { stage, at: `2026-10-12T00:00:0${index}Z` }];
      writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    }

    scan('help', renderHelp());
    scan('describe-no-repo', renderDescribe(null));
    scan('rules-no-repo', renderRules(null));
    scan('describe-repo', renderDescribe(repo));
    scan('rules-repo', renderRules(repo));
    scan('open-line', renderOpenLine(repo));
    scan('rules-block', renderRulesBlock(renderOpenLine(repo)));
    scan('status', renderStatus(resolveRepoRoot(repo)));
    scan('status-id', renderStatus(repo, { id }));
    scan('status-full', renderStatus(repo, { id, full: true }));
    try { scan('status-comments-stale', renderStatus(repo, { id, comments: true })); } catch (error) { if (error instanceof BountyRefused) scan('status-comments-stale', `refused (${error.reason}): ${error.message}`); else throw error; }
    scan('open-file', readFileSync(join(repo, '.box', 'bounties', 'OPEN'), 'utf8'));

    // Refusals from each command path, collected as printed text.
    const grab = (fn: () => unknown): void => {
      try { fn(); } catch (error) {
        if (error instanceof BountyRefused) { scan('refusals', `refused (${error.reason}): ${error.message}`); return; }
        throw error;
      }
    };
    grab(() => loadRecord(repo, 'bt-000000000000'));
    grab(() => confirmBounty(repo, id));
    grab(() => postBounty(repo, id, join(runRoot('bt7c-dest'), 'drop')));
    grab(() => lookBounty(repo, id, 99));
    grab(() => lookBounty(repo, id, { from: join(runRoot('bt7c-missing'), 'none') }));
    grab(() => applyBounty(repo, id, 99));
    const ended = finalizeBounty(planBounty({ repoPath: repo, title: 'close me', taskPath: join(repo, 'TASK.md'), why: 'ended', outDir: join(runRoot('bt7c-ended'), 'bounty') }));
    grab(() => closeBounty(repo, ended.id, '   ')); // empty reason refused
    closeBounty(repo, ended.id);
    grab(() => applyBounty(repo, ended.id)); // already-ended

    // The built CLI's own output: the journey and the removed-name refusals.
    if (!existsSync(CLI_DIST)) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const cli = (...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8' });
    for (const args of [['help'], ['describe'], ['describe', '--rules'], ['status'], ['status', id], ['status', id, '--full'], ['status', id, '--comments'], ['look', id, '1'], ['close', id, '--reason'], ['frobnicate']]) {
      const run = cli(...args);
      scan(`cli-${args.join(' ')}`, `${run.stdout}\n${run.stderr}`);
    }
    for (const gone of ['answer', 'questions', 'reply', 'undo', 'reject', 'withdraw', 'remind']) {
      const run = cli(gone, id);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('command-removed');
      scan(`cli-removed-${gone}`, run.stderr);
    }

    const leaks = Object.entries(corpus).filter(([, text]) => REMOVED_NAME.test(text)).map(([name]) => name);
    expect(leaks, `removed command names printed by: ${leaks.join(', ')}`).toEqual([]);
  }));
});
