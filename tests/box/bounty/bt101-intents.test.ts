// BT101 stage 4: every local change is a named intent event. A write names what happened (`appendEvents(root, record,
// intent)`); the generic `patched` is never written again, and a log written before this stage still folds to its row.
import { describe, expect, it } from 'vitest';
import { appendEvents, applyBounty, closeBounty, loadRecord, lookBounty, postBounty } from '../../../packages/box-bounty/index.js';
import { localEvents, storedRaw } from '../../../packages/box-bounty/store.js';
import { foldLocal, INTENTS } from '../../../packages/box-bounty/fold.js';
import { fixture } from './github-fixture.js';

const kinds = (repo: string, id: string) => localEvents(repo, id).map(event => event.kind);
const foldEqualsRow = (repo: string, id: string): void => {
  expect(foldLocal(localEvents(repo, id)), `the fold of ${id}'s events is its row`).toEqual(JSON.parse(storedRaw(repo, id)!));
};
// What the log may hold besides intents: the outbox's own kinds.
const OUTBOX = new Set(['owed', 'sent', 'refused']);

describe('BT101 stage 4: intent events', () => {
  it('post, look, apply and close write only named intents, never patched, and the row is their fold', () => fixture(({ repo, id, pr }) => {
    postBounty(repo, id, 'github');
    pr('solver');
    lookBounty(repo, id, 1);
    applyBounty(repo, id, 1);
    closeBounty(repo, id);
    const written = kinds(repo, id).filter(kind => !OUTBOX.has(kind));
    expect(written).not.toContain('patched');
    for (const kind of written) expect(INTENTS as readonly string[], `${kind} is a named intent`).toContain(kind);
    for (const named of ['created', 'post-planned', 'issue-recorded', 'posted', 'solution-collected', 'applied']) expect(written).toContain(named);
    foldEqualsRow(repo, id);
  }));

  it('a write names its intent, and that name is the event', () => fixture(({ repo, id }) => {
    const record = loadRecord(repo, id);
    (record as { why?: string }).why = 'the reason, told again';
    appendEvents(repo, record, 'owner-answered');
    expect(kinds(repo, id).at(-1)).toBe('owner-answered');
    expect(loadRecord(repo, id).why).toBe('the reason, told again');
    foldEqualsRow(repo, id);
  }));

  it('a log written before this stage (patched and replaced) still folds', () => {
    const doc = { id: 'bt-000000000001', stage: 'drafted', events: [{ stage: 'drafted' }], github: { state: 'preparing' } };
    const folded = foldLocal([
      { seq: 1, at: 'a', kind: 'created', json: JSON.stringify(doc) },
      { seq: 2, at: 'b', kind: 'patched', json: JSON.stringify({ set: [[['github', 'state'], 'posted']], unset: [], events: [{ stage: 'posted' }] }) },
      { seq: 3, at: 'c', kind: 'replaced', json: JSON.stringify({ ...doc, stage: 'posted', why: 'w' }) },
      { seq: 4, at: 'd', kind: 'patched', json: JSON.stringify({ set: [[['stage'], 'applied']], unset: [], events: [] }) }
    ]);
    expect(folded).toEqual({ ...doc, stage: 'applied', why: 'w' });
  });
});
