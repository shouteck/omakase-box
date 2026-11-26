// BT101 stage 1: every local record write is an appended event, under today's writes. A stale copy keeps another writer's
// change to a path it did not touch; the same path changed by both is refused by name; the record row is the fold of its
// events; `status <id> --history` lists every change without its values.
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { applyBounty, BountyRefused, closeBounty, loadRecord, lookBounty, appendEvents, transitionTo } from '../../../packages/box-bounty/index.js';
import { closeStores, localEvents, recordIds, storeDbPath, storedRaw } from '../../../packages/box-bounty/store.js';
import { foldLocal } from '../../../packages/box-bounty/fold.js';
import { fixture, postedFixture } from './github-fixture.js';
import { CLI_DIST, readRecordRaw, removeRecord, writeRecordRaw } from './support.js';

const refusalOf = (run: () => unknown): string | null => {
  try { run(); return null; } catch (error) { if (error instanceof BountyRefused) return error.reason; throw error; }
};
const foldEqualsRow = (repo: string, id: string): void => {
  const row = storedRaw(repo, id);
  expect(row, `a row for ${id}`).not.toBeNull();
  expect(foldLocal(localEvents(repo, id)), `the fold of ${id}'s events is its row`).toEqual(JSON.parse(row!));
};
const db = (repo: string) => { closeStores(); return new DatabaseSync(storeDbPath(repo)); };

describe('BT101 stage 1: no lost update', () => {
  it('a stale copy written after another writer applied: applied stands, and the stale change is kept', () => postedFixture(({ repo, id }) => {
    const stale = loadRecord(repo, id);
    transitionTo(repo, loadRecord(repo, id), 'applied', { command: 'merged', attempt: 1 });
    (stale as { why?: string }).why = 'the stale writer\'s change';
    appendEvents(repo, stale, 'stage-changed');
    const after = loadRecord(repo, id);
    expect(after.stage).toBe('applied');
    expect(after.why).toBe('the stale writer\'s change');
  }, { collected: true }));

  it('two writers change different parts of one object: both kept', () => postedFixture(({ repo, id }) => {
    const first = loadRecord(repo, id);
    const second = loadRecord(repo, id);
    (first.github as { pending: string | null }).pending = 'first writer';
    appendEvents(repo, first, 'stage-changed');
    (second as { why?: string }).why = 'second writer';
    second.github!.state = 'posted';
    appendEvents(repo, second, 'stage-changed');
    const after = loadRecord(repo, id);
    expect(after.github!.pending).toBe('first writer');
    expect(after.why).toBe('second writer');
  }));

  it('two writers change the same path differently: the second is refused record-changed and the first stands', () => postedFixture(({ repo, id }) => {
    const first = loadRecord(repo, id);
    const second = loadRecord(repo, id);
    (first as { why?: string }).why = 'first';
    appendEvents(repo, first, 'stage-changed');
    (second as { why?: string }).why = 'second';
    expect(refusalOf(() => appendEvents(repo, second, 'stage-changed'))).toBe('record-changed');
    expect(loadRecord(repo, id).why).toBe('first');
  }));
});

describe('BT101 stage 1: the migration', () => {
  it('a store from before the log gets one created event per record, twice over, and no row changes', () => postedFixture(({ repo, id }) => {
    const before = readRecordRaw(repo, id);
    for (let round = 0; round < 2; round += 1) {
      const handle = db(repo);
      handle.exec('DELETE FROM events');
      handle.exec('PRAGMA user_version=4');
      handle.close();
      expect(recordIds(repo)).toContain(id);
      const events = localEvents(repo, id);
      expect(events.map(event => event.kind)).toEqual(['created']);
      expect(readRecordRaw(repo, id)).toBe(before);
    }
  }));
});

describe('BT101 stage 1: the row is the fold of its events', () => {
  it('after post, collect, apply and close, a legacy import and a drop', () => postedFixture(({ repo, id }) => {
    foldEqualsRow(repo, id);
    lookBounty(repo, id, 1);
    foldEqualsRow(repo, id);
    applyBounty(repo, id, 1);
    foldEqualsRow(repo, id);
    closeBounty(repo, id);
    foldEqualsRow(repo, id);
    const imported = JSON.parse(readRecordRaw(repo, id)) as { title: string };
    writeRecordRaw(repo, id, JSON.stringify({ ...imported, title: 'edited by hand in the legacy file' }));
    expect(loadRecord(repo, id).title).toBe('edited by hand in the legacy file');
    foldEqualsRow(repo, id);
    expect(localEvents(repo, id).at(-1)!.kind).toBe('imported');
    removeRecord(repo, id);
    expect(localEvents(repo, id).at(-1)!.kind).toBe('dropped');
  }));

  it('a fresh post folds too', () => fixture(({ repo, id }) => {
    foldEqualsRow(repo, id);
  }));
});

describe('BT101 stage 1: status <id> --history', () => {
  it('lists every local event oldest first, by kind and the paths it changed, never their values', () => postedFixture(({ repo, id }) => {
    const record = loadRecord(repo, id);
    (record as { why?: string }).why = 'SECRET-VALUE-NOT-SHOWN';
    appendEvents(repo, record, 'stage-changed');
    const run = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'status', id, '--history'], { cwd: repo, encoding: 'utf8', env: process.env, timeout: 120000 });
    expect(run.status, run.stderr).toBe(0);
    const lines = run.stdout.split('\n').filter(line => /^\s*\d+\s/.test(line));
    expect(lines.length).toBe(localEvents(repo, id).length);
    expect(lines.at(-1)).toContain('stage-changed');
    expect(lines.at(-1)).toContain('why');
    expect(run.stdout).not.toContain('SECRET-VALUE-NOT-SHOWN');
  }));
});
