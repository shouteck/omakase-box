import { expect, it } from 'vitest';
import { loadRecord, persistRecord, renderOpenLine, renderStatus } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';

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
