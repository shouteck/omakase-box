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
});
