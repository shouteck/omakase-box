import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicableAttempts, applyBounty, attemptsOf, BountyRefused, finalizeBounty, loadRecord, planBounty, postBounty, renderStatus } from '../../../packages/box-bounty/index.js';
import type { BountyRecord } from '../../../packages/box-bounty/index.js';
import { git, makeRepo } from './support.js';
import { withoutGh } from './github-fixture.js';

// The pass's own probes for BT23's security lens, written at review time:
// the same old shapes bt23.test.ts crafts but different words
// (check-unrunnable, check-not-run), a converted record taken through a real
// apply, a real post gate on a record carrying old words, and `expired` read
// as the unknown stage it is.

const created = (repo: string) => finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'a reason' }));

// Rewrite a created record on disk in an older shape — the way the files in
// `.box/bounties/` actually sit. `rewrite` then reads it through the load
// gate; `writeRaw` is for shapes the gate must refuse.
const writeRaw = (repo: string, id: string, change: (record: Record<string, unknown>) => void): void => {
  const file = join(repo, '.box', 'bounties', `${id}.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  change(raw);
  writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
};
const rewrite = (repo: string, id: string, change: (record: Record<string, unknown>) => void): BountyRecord => {
  writeRaw(repo, id, change);
  return loadRecord(repo, id);
};

const refused = (fn: () => unknown, reason: string): BountyRefused => {
  try { fn(); expect.unreachable('expected a refusal'); }
  catch (error) {
    expect(error).toBeInstanceOf(BountyRefused);
    expect((error as BountyRefused).reason).toBe(reason);
    return error as BountyRefused;
  }
  throw new Error('unreachable');
};


const githubHistory = (id: string) => ({
  repository: 'o/n', account: 'a', kind: 'history',
  branch: `box-bounty/${id}`, commit: 'a'.repeat(40),
  title: 't', body: 'b', state: 'posted', issue: null, pending: null
});
const ATTEMPT = { at: '2026-10-01T00:00:00.000Z', changed: [] as string[], added: [] as string[], deleted: [] as string[], conflicts: null, report: [] as never[] };

describe('pass probes — old shapes live', () => {
  it('check-unrunnable/check-not-run attempts load set-aside; apply without a number refuses and changes nothing, a number still names one', () => {
    const repo = makeRepo({ 'TASK.md': 'x\n' });
    const made = created(repo);
    const file = join(repo, '.box', 'bounties', `${made.id}.json`);
    const record = rewrite(repo, made.id, raw => {
      raw['stage'] = 'answered';
      raw['github'] = githubHistory(made.id);
      raw['attempts'] = [
        { ...ATTEMPT, n: 1, commit: git(repo, ['rev-parse', 'HEAD']), outcome: 'check-unrunnable' },
        { ...ATTEMPT, n: 2, commit: git(repo, ['rev-parse', 'HEAD']), outcome: 'check-not-run' }
      ];
    });
    expect(attemptsOf(record).map(a => a.outcome)).toEqual(['set-aside', 'set-aside']);
    expect(applicableAttempts(attemptsOf(record))).toEqual([]);
    const before = readFileSync(file, 'utf8');
    withoutGh(() => refused(() => applyBounty(repo, made.id), 'no-applicable-attempt'));
    expect(readFileSync(file, 'utf8')).toBe(before);
    // An explicit number still names a set-aside attempt — HEAD merging into
    // HEAD lands clean and ends the record applied.
    withoutGh(() => {
      const applied = applyBounty(repo, made.id, 2);
      expect(applied.outcome).toBe('applied');
      expect(applied.attempt).toBe(2);
    });
  });

  it('a verified stage and a singular answer convert — then the record really applies, and a drafted old-worded record still hits the owner gate at post', () => {
    const repo = makeRepo({ 'TASK.md': 'x\n' });
    const made = created(repo);
    const head = git(repo, ['rev-parse', 'HEAD']);
    const record = rewrite(repo, made.id, raw => {
      delete raw['attempts'];
      raw['stage'] = 'verified';
      raw['events'] = [...(raw['events'] as unknown[]), { stage: 'verified', at: '2026-10-01T00:00:00.000Z', command: 'answer' }];
      raw['answer'] = { commit: head, changed: ['TASK.md'], added: [], deleted: [] };
      raw['level'] = 'mechanical';
      raw['replies'] = [{ at: '2026-10-01T00:00:00.000Z', issue: 7 }];
      raw['github'] = githubHistory(made.id);
    });
    expect(record.stage).toBe('answered');
    expect(attemptsOf(record)).toEqual([{ n: 1, at: '2026-10-01T00:00:00.000Z', commit: head, changed: ['TASK.md'], added: [], deleted: [], outcome: 'answered', conflicts: null, report: [] }]);
    // The converted attempt is a real default pick: apply with no number merges it.
    withoutGh(() => {
      const applied = applyBounty(repo, made.id);
      expect(applied.outcome).toBe('applied');
      expect(applied.attempt).toBe(1);
    });
    // A drafted record carrying old words still cannot post without the
    // owner — the same gate as before the wave refuses, nothing goes out.
    const made2 = created(repo);
    rewrite(repo, made2.id, raw => { raw['replies'] = [{ at: '2026-10-01T00:00:00.000Z', issue: 1 }]; raw['level'] = 'reviewed'; });
    withoutGh(() => refused(() => postBounty(repo, made2.id), 'owner-allow-needed'));
    expect(loadRecord(repo, made2.id).stage).toBe('waiting');
  });

  it('a stage of expired fails to load as an unknown stage — nothing converts it', () => {
    const repo = makeRepo({ 'TASK.md': 'x\n' });
    const made = created(repo);
    writeRaw(repo, made.id, raw => { raw['stage'] = 'expired'; });
    refused(() => loadRecord(repo, made.id), 'record-corrupt');
    expect(renderStatus(repo)).toContain(`! ${made.id}.json — not a readable record`);
    // And inside the history the same word is corrupt too.
    writeRaw(repo, made.id, raw => {
      raw['stage'] = 'applied';
      raw['events'] = [...(raw['events'] as unknown[]), { stage: 'expired', at: '2026-10-01T00:00:00.000Z' }];
    });
    refused(() => loadRecord(repo, made.id), 'record-corrupt');
  });
});
