import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { refresh } from '../../packages/box-platform/src/refresh.js';
import { payeeFacts } from '../../packages/box-platform/src/charge.js';
import { MINUTE, NOW, rig, type Rig } from './support.js';

const REPO = 'example-tidepool/ledger';
const ID = 'bt-aaaaaaaaaaaa';
describe('BT68: rewritten verification across worker ticks', () => {
  let r: Rig;
  beforeEach(async () => {
    r = await rig('token');
    r.standin.repositories.set(REPO, { visibility: 'public', language: 'Go' });
    r.standin.issues.push({ id: ID, repository: REPO, number: 1, title: 't', task: 't', poster: 'example-mara', amount: 50,
      createdAt: new Date(NOW).toISOString(), pulls: [{ number: 7, author: 'example-fern', state: 'closed', created_at: new Date(NOW).toISOString(),
        merged_at: new Date(NOW).toISOString(), landed: false, merged: true, merge_commit_sha: 'b'.repeat(40), landingLanded: true }] });
  });
  afterEach(() => r.close());
  it('two reads per tick eventually verify a rewritten landing without premature eligibility', async () => {
    let landed = false;
    for (let n = 0; n < 80; n++) {
      r.clock.at += MINUTE;
      const before = r.standin.requests.length;
      const tick = await refresh({ ...r.env, tickReads: 2 });
      expect(tick.requests).toBeLessThanOrEqual(2);
      expect(r.standin.requests.length - before).toBeLessThanOrEqual(2);
      const facts = await payeeFacts(r.env, ID);
      if (facts.landed.length > 0) {
        expect(r.standin.requests.some(path => path.includes(`/compare/${'b'.repeat(40)}...`))).toBe(true);
        expect(facts.landed).toMatchObject([{ author: 'example-fern' }]);
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
  });
  it('an off-default first result cannot starve the next rewritten PR, and both can later land', async () => {
    const pulls = r.standin.issues[0]!.pulls!;
    pulls[0]!.landingLanded = false;
    pulls.push({ ...pulls[0]!, number: 8, author: 'example-quill', merge_commit_sha: 'c'.repeat(40), landingLanded: true });
    const verified = async (number: number) => (await r.env.DB.prepare('SELECT landing_sha FROM pull_requests WHERE bounty_id = ? AND number = ?').bind(ID, number).first<{ landing_sha: string | null }>())?.landing_sha != null;
    for (let n = 0; n < 80 && !await verified(8); n++) {
      r.clock.at += MINUTE;
      expect((await refresh({ ...r.env, tickReads: 2 })).requests).toBeLessThanOrEqual(2);
    }
    expect(await verified(8)).toBe(true);
    expect(await verified(7)).toBe(false);
    pulls[0]!.landingLanded = true;
    for (let n = 0; n < 80 && !await verified(7); n++) {
      r.clock.at += MINUTE;
      await refresh({ ...r.env, tickReads: 2 });
    }
    expect(await verified(7)).toBe(true);
    expect((await payeeFacts(r.env, ID)).landed).toHaveLength(2);
  });
});
