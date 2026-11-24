// BT101 stage 2: what a command owes outside is an outbox row written with its `owed` event, and one reconcile step sends
// it through the door. The door runs its checks at send time, from the folded record: a row no `owed` event stands behind
// is refused by name, a withdrawn owner's word refuses the issue, and the scan holds a secret-shaped decision comment. A
// retry after a lost response or a failed comment converges: one issue, one comment per marker, the row done once.
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowRepository, appendEvent, closeBounty, denyRepository, loadRecord, postBounty, renderHistory } from '../../../packages/box-bounty/index.js';
import { closeStores, localEvents, metaGet, outboxRows } from '../../../packages/box-bounty/store.js';
import { reconcile } from '../../../packages/box-bounty/reconcile.js';
import { fixture, postedFixture, refused } from './github-fixture.js';
import { git } from './support.js';

const db = (repo: string) => { closeStores(); return new DatabaseSync(join(repo, '.box', 'local', 'box.db')); };
const row = (repo: string, key: string) => outboxRows(repo).find(entry => entry.key === key);
const settled = (repo: string, id: string, kind: 'sent' | 'refused', key: string) =>
  localEvents(repo, id).filter(event => event.kind === kind && (JSON.parse(event.json) as { key?: string }).key === key);
const issuePosts = (calls: string[][]) => calls.filter(call => call.some(arg => /repos\/owner\/project\/issues$/.test(arg)) && call.includes('--input'));
// Built at run time so this file's bytes never hold the contiguous shape.
const secretShaped = 'ghp_' + 'A'.repeat(20);

describe('BT101 stage 2: a retry converges', () => {
  it('a lost issue response, then a rerun of post: one issue, the row done, sent once', () => fixture(({ repo, id, state, update }) => {
    update({ loseIssueResponse: true });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    expect(row(repo, `issue:${id}`)?.state).toBe('pending');
    postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
    expect(row(repo, `issue:${id}`)?.state).toBe('done');
    expect(settled(repo, id, 'sent', `issue:${id}`)).toHaveLength(1);
    expect(loadRecord(repo, id).github!.issue!.number).toBe(1);
  }));

  it('a failed decision comment, then a rerun of close: one comment per marker, the row done', () => postedFixture(({ repo, id, state, update }) => {
    update({ fail: '/comments' });
    closeBounty(repo, id);
    expect(row(repo, `decision:${id}`)?.state).toBe('pending');
    update({ fail: undefined });
    closeBounty(repo, id);
    const markers = state().comments.map(comment => /<!-- box-bounty:[^ ]+ -->/.exec(comment.body)?.[0]).filter(Boolean);
    expect(markers.length).toBeGreaterThan(0);
    expect(new Set(markers).size).toBe(markers.length);
    expect(row(repo, `decision:${id}`)?.state).toBe('done');
    expect(state().issues[0]!.state).toBe('closed');
  }));
});

describe('BT101 stage 2: the door', () => {
  it('a forged outbox row with no owed event behind it is not sent, and is refused by name', () => postedFixture(({ repo, id, state }) => {
    const handle = db(repo);
    handle.prepare("INSERT INTO outbox(key, bounty_id, event_seq, kind, state) VALUES(?, ?, 9999, 'decision', 'pending')").run(`decision:${id}`, id);
    handle.close();
    const before = state().calls.length;
    const said = reconcile(repo, id);
    expect(said.map(line => line.outcome)).toEqual(['refused']);
    expect(said[0]!.detail).toContain('no owed event');
    expect(state().calls.slice(before).filter(call => call.includes('--method') || call.includes('--input'))).toEqual([]);
    expect(state().issues[0]!.state).toBe('open');
    expect(row(repo, `decision:${id}`)?.state).toBe('refused');
    expect(settled(repo, id, 'refused', `decision:${id}`)).toHaveLength(1);
  }));

  it('an owed issue after the owner denied this repository is not sent: owner-word-withdrawn', () => fixture(({ repo, bare, id, state, update }) => {
    update({ fail: '/issues' });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    update({ fail: undefined });
    allowRepository(repo); denyRepository(repo); // the fixture allows through the all-projects default; deny needs a listed entry
    const before = state().calls.length;
    const said = reconcile(repo, id);
    expect(said.map(line => [line.outcome, line.reason])).toEqual([['refused', 'owner-word-withdrawn']]);
    expect(issuePosts(state().calls.slice(before))).toEqual([]);
    expect(state().issues).toHaveLength(0);
    expect(row(repo, `issue:${id}`)?.state).toBe('refused');
    expect(git(bare, ['show-ref'])).toContain(`refs/heads/box-bounty/${id}`); // the branch pushed before the deny stays as it was
  }));

  it('a decision comment carrying a secret-shaped reason is held: nothing sent, publish-held, the local ending stands', () => postedFixture(({ repo, id, state }) => {
    try { closeBounty(repo, id, `the key was ${secretShaped}`); } catch { /* the chain's own scan also holds; the local ending stands either way */ }
    expect(loadRecord(repo, id).stage).toBe('rejected');
    expect(state().comments.filter(comment => comment.body.includes(secretShaped))).toEqual([]);
    expect(row(repo, `decision:${id}`)?.state).toBe('refused');
    expect(settled(repo, id, 'refused', `decision:${id}`).map(event => (JSON.parse(event.json) as { reason?: string }).reason)).toEqual(['publish-held']);
  }));
});

describe('BT101 stage 2: chain pushes are outbox rows', () => {
  it('chain_pending from an older store becomes a chain row on first open, and the next command pushes it', () => postedFixture(({ repo, bare, id }) => {
    const tip = appendEvent(repo, id, { v: 1, type: 'closed', at: new Date().toISOString(), actor: 'owner', kind: 'withdrawn' });
    const handle = db(repo);
    handle.exec('DELETE FROM outbox');
    handle.prepare("DELETE FROM events WHERE kind='owed' AND json LIKE '%chain:%'").run();
    handle.prepare("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`chain_pending:${id}`, tip);
    handle.exec('PRAGMA user_version=5');
    handle.close();
    expect(row(repo, `chain:${id}`)?.state).toBe('pending');
    expect(metaGet(repo, `chain_pending:${id}`)).toBeNull();
    closeBounty(repo, id);
    expect(git(bare, ['rev-parse', `refs/box-bounty-records/${id}`])).not.toBe('');
    expect(row(repo, `chain:${id}`)?.state).toBe('done');
  }));
});

describe('BT101 stage 2: history names what was owed and sent', () => {
  it('status --history lists the owed and sent issue by its key, with no value', () => postedFixture(({ repo, id }) => {
    const history = renderHistory(repo, id);
    expect(history).toMatch(new RegExp(`owed\\s+issue:${id}`));
    expect(history).toMatch(new RegExp(`sent\\s+issue:${id}`));
  }));
});
