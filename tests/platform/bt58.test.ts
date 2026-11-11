// BT58: the board reads a bounty's record at the new name first and at the old name only on a 404. Both are read; the
// number of GitHub reads per bounty per events step is asserted (the board is short of reads: two a minute).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { askJson, MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const issue = (over: Partial<StandinIssue>): StandinIssue => ({
  id: 'bt-aaaaaaaaaaaa', repository: 'example-tidepool/ledger', number: 44, title: 'Skip no months', task: 'Fix the 31st.',
  poster: 'example-mara', amount: 45, createdAt: new Date(NOW - 4 * 86400000).toISOString(), ...over
});
const posted = (at: string) => ({ v: 1, type: 'posted', at, allowedBy: { decision: 'once', level: 'project' } });
const chainReads = (r: Rig, id: string): string[] => r.standin.commitRefs.filter(ref => ref.endsWith(`/${id}`));

describe('BT58: the board reads both names of a bounty record', () => {
  let r: Rig;
  beforeEach(async () => { r = await rig(); r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' }); });
  afterEach(() => r.close());

  it('7. a new-name record is read with one request, an old-name record with two, and both build the same history', async () => {
    r.standin.issues.push(issue({ id: 'bt-aaaaaaaaaaaa', number: 44, events: [posted('2026-10-27T00:00:00Z')] }));
    r.standin.issues.push(issue({ id: 'bt-bbbbbbbbbbbb', number: 45, chain: 'old', events: [posted('2026-10-26T00:00:00Z')] }));
    await refreshUntilDone(r);
    for (const [id, at] of [['bt-aaaaaaaaaaaa', '2026-10-27T00:00:00Z'], ['bt-bbbbbbbbbbbb', '2026-10-26T00:00:00Z']] as const) {
      const { bounty } = (await askJson(r, handle, `/api/b/${id}`)).body as { bounty: { history: unknown[]; approved_by: string } };
      expect(bounty.history, id).toEqual([{ at, event: 'posted', source: 'project-record' }]);
      expect(bounty.approved_by, id).toBe('owner-this-bounty');
    }
    const fresh = chainReads(r, 'bt-aaaaaaaaaaaa');
    const old = chainReads(r, 'bt-bbbbbbbbbbbb');
    expect(fresh.map(ref => ref.startsWith('refs/box-bounty-records/'))).toEqual([true]);
    expect(old.map(ref => ref.startsWith('refs/box-bounty-records/'))).toEqual([true, false]);
    // a second pass reads each event commit once more for neither: the events are already stored
    const events = r.standin.requests.filter(path => path.endsWith('event.json')).length;
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    expect(r.standin.requests.filter(path => path.endsWith('event.json')).length).toBe(events);
  });

  it('a bounty with no record at either name is still shown from GitHub\'s facts', async () => {
    r.standin.issues.push(issue({ id: 'bt-cccccccccccc', number: 46 }));
    await refreshUntilDone(r);
    expect((await askJson(r, handle, '/api/b/bt-cccccccccccc')).status).toBe(200);
    expect(chainReads(r, 'bt-cccccccccccc').map(ref => ref.startsWith('refs/box-bounty-records/'))).toEqual([true, false]);
  });
});
