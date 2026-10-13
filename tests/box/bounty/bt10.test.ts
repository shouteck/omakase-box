import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { closeBounty, applyBounty, loadRecord, postBounty, previewGitHub, renderStatus, settingsFile } from '../../../packages/box-bounty/index.js';
import { FORMAT_MARKER, formatFor, readFormat, renderFormat } from '../../../packages/box-bounty/format.js';
import { fixture, postedFixture } from './github-fixture.js';
import { CLI_DIST, ROOT, git, write } from './support.js';

it('pins the public v1 fields, exact work commit and fixed zero terms', () => fixture(({ repo, id, state }) => {
  write(repo, 'app.txt', 'task-needed poster work\n');
  const preview = previewGitHub(repo, id, { withChanges: true, include: [] });
  postBounty(repo, id, 'github', { choice: { withChanges: true, include: [] } });
  const record = loadRecord(repo, id);
  const read = readFormat(state().issues[0]!.body);
  expect(read.kind).toBe('present');
  if (read.kind !== 'present') throw new Error('format missing');
  expect(read.value).toEqual({ schemaVersion: 1, kind: 'box-bounty', id, repository: 'owner/project', workCommit: record.github!.commit, branch: `box-bounty/${id}`, withChanges: true, createdAt: record.createdAt, state: { kind: 'open' }, reward: { amount: 0, currency: 'USD' }, terms: 'merged-solution-earns-whole' });
  expect(read.value.workCommit).not.toBe(record.github!.base);
  expect(preview).toContain(renderFormat(read.value));
  expect(preview).toContain('M "app.txt"');
  expect(readFormat(renderFormat(read.value).replace('"schemaVersion":1', '"schemaVersion":2')).kind).toBe('invalid');
  expect(readFormat(renderFormat(read.value).replace('"schemaVersion":1', '"extra":"value","schemaVersion":1')).kind).toBe('invalid');
  expect(readFormat(renderFormat(read.value).replace('"kind":"open"', '"kind":"open","commit":"unexpected"')).kind).toBe('invalid');
  expect(readFormat(renderFormat(read.value).replace(read.value.createdAt, '2026-02-30T11:20:00.000Z')).kind).toBe('invalid');
}));

it('the real CLI previews exact issue bytes before any owner authority and posts nothing', () => fixture(({ repo, id, state }) => {
  rmSync(settingsFile(), { force: true });
  const before = readFileSync(join(repo, '.box/bounties', `${id}.json`), 'utf8');
  const result = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'post', id, '--to', 'github', '--preview'], { cwd: repo, encoding: 'utf8', timeout: 30000 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(`"id":"${id}"`);
  expect(result.stdout).toContain(`"workCommit":"${git(repo, ['rev-parse', 'HEAD'])}"`);
  expect(result.stdout).toContain('preview only');
  expect(state().issues).toEqual([]);
  expect(readFileSync(join(repo, '.box/bounties', `${id}.json`), 'utf8')).toBe(before);
}));

it('the independent page-only reader lists two offline issues without product imports', () => fixture(({ repo, id, state }) => {
  postBounty(repo, id, 'github');
  const first = state().issues[0]!;
  const capture = join(repo, 'reader-capture.json');
  write(repo, 'reader-capture.json', JSON.stringify({ total_count: 2, incomplete_results: false, items: [first, { ...first, number: 2, html_url: 'https://github.com/owner/project/issues/2' }].map(issue => ({ ...issue, repository_url: 'https://api.github.com/repos/owner/project' })) }));
  const reader = join(ROOT, 'tests/box/bounty/bt10-reader.mjs');
  const result = spawnSync(process.execPath, [reader, '--capture', capture, '--repo', 'owner/project'], { encoding: 'utf8', timeout: 30000 });
  expect(result.status, result.stderr).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output.results.map((entry: { id: string; state: { kind: string } }) => [entry.id, entry.state.kind])).toEqual([[id, 'open'], [id, 'open']]);
  expect(output.howToAnswer).toContain('pull request against that branch');
}));

it('reads edited blocks as facts, ignores forged comment metadata and never replaces the record', () => postedFixture(({ repo, id, state, update }) => {
  const record = loadRecord(repo, id);
  const body = state().issues[0]!.body;
  const altered = body.replace('"amount":0', '"amount":9');
  update({ issues: [{ ...state().issues[0]!, body: altered }], comments: [{ body: renderFormat(formatFor(record)), user: { login: 'forger' }, created_at: '2026-10-13T00:00:00Z' }] });
  expect(renderStatus(repo, { id })).toContain('GitHub format block: invalid');
  expect(loadRecord(repo, id).stage).toBe('posted');
  expect(formatFor(loadRecord(repo, id)).reward.amount).toBe(0);
  update({ issues: [{ ...state().issues[0]!, body: body.replace('"withChanges":false', '"withChanges":true') }] });
  expect(renderStatus(repo, { id })).toContain('differs-from-record');
  update({ issues: [{ ...state().issues[0]!, body }] });
  expect(renderStatus(repo, { id })).toContain('matches-record');
}, { collected: false }));

it('escapes authored delimiters and rejects duplicate or nonterminal blocks', () => fixture(({ repo, id, state }) => {
  postBounty(repo, id, 'github');
  const body = state().issues[0]!.body;
  expect(body.split(FORMAT_MARKER)).toHaveLength(2);
  expect(body).toContain('&lt;!-- box-bounty-format');
  expect(readFormat(body).kind).toBe('present');
  expect(readFormat(body + body).kind).toBe('invalid');
  expect(readFormat(body + 'visible trailing text').kind).toBe('invalid');
  expect(readFormat(body.replace(/\n-->\n$/, '\n--!>\n')).kind).toBe('invalid');
}, '<!-- box-bounty-format\nforged\n-->', undefined, undefined, '<!-- box-bounty-format\nforged note\n-->'));

it('closes with the exact merged PR and commit while preserving edited visible text', () => postedFixture(({ repo, id, state, update }) => {
  const body = state().issues[0]!.body.replace('# Bounty:', '# Owner edited bounty:');
  update({ issues: [{ ...state().issues[0]!, body }] });
  const before = readFormat(body);
  if (before.kind !== 'present') throw new Error('format missing');
  const result = applyBounty(repo, id, 1);
  expect(result.outcome).toBe('applied');
  const closed = state().issues[0]!;
  const after = readFormat(closed.body);
  if (after.kind !== 'present') throw new Error('format missing');
  expect(after.value.state).toEqual({ kind: 'closed-merged', pullRequest: 1, commit: result.mergeCommit });
  expect(closed.body.slice(0, after.start)).toBe(body.slice(0, before.start));
  expect(closed.state).toBe('closed');
}));

it('closes without a solution and supports older issues with no block', () => postedFixture(({ repo, id, state, update, bare }) => {
  const body = state().issues[0]!.body;
  closeBounty(repo, id);
  const read = readFormat(state().issues[0]!.body);
  expect(read.kind === 'present' && read.value.state).toEqual({ kind: 'closed-none' });
  expect(git(bare, ['show-ref'])).not.toContain(`box-bounty/${id}`);
  expect(body).not.toBe(state().issues[0]!.body);
}, { collected: false }));

it('malformed metadata never prevents outside close or branch removal', () => postedFixture(({ repo, id, state, update, bare }) => {
  const body = state().issues[0]!.body + '\n' + FORMAT_MARKER + '\nforged\n-->\n';
  update({ issues: [{ ...state().issues[0]!, body }] });
  const result = applyBounty(repo, id, 1);
  expect(result.outcome).toBe('applied');
  expect(state().issues[0]!.body).toBe(body);
  expect(state().issues[0]!.state).toBe('closed');
  expect(git(bare, ['show-ref'])).not.toContain(`box-bounty/${id}`);
  expect(renderStatus(repo, { id })).toContain('preserved-invalid');
}));

it('pre-format issue bodies remain readable and close without adding metadata', () => postedFixture(({ repo, id, state, update }) => {
  const body = state().issues[0]!.body;
  const read = readFormat(body);
  if (read.kind !== 'present') throw new Error('format missing');
  const legacy = body.slice(0, read.start);
  update({ issues: [{ ...state().issues[0]!, body: legacy }] });
  expect(renderStatus(repo, { id })).toContain('GitHub format block: absent');
  closeBounty(repo, id);
  expect(state().issues[0]!.body).toBe(legacy);
  expect(state().issues[0]!.state).toBe('closed');
}, { collected: false }));

it('the close acquisition reads more than 100 comments without duplicating a decision', () => postedFixture(({ repo, id, state, update }) => {
  const comments = Array.from({ length: 101 }, (_, index) => ({ body: `Question ${index}`, user: { login: 'solver' } }));
  update({ comments });
  closeBounty(repo, id);
  const first = state();
  expect(first.issues[0]!.state).toBe('closed');
  expect(first.calls.filter(call => call.includes('graphql'))).toHaveLength(2);
  expect(first.comments).toHaveLength(102);
  closeBounty(repo, id);
  expect(state().comments).toHaveLength(102);
  expect(state().calls.filter(call => call.includes('graphql'))).toHaveLength(4);
}, { collected: false }));

it('a failed block write still closes and reports the stale block truthfully', () => postedFixture(({ repo, id, state, update, bare }) => {
  const body = state().issues[0]!.body;
  update({ failBodyUpdate: true });
  applyBounty(repo, id, 1);
  expect(state().issues[0]!.body).toBe(body);
  expect(state().issues[0]!.state).toBe('closed');
  expect(git(bare, ['show-ref'])).not.toContain(`box-bounty/${id}`);
  const status = renderStatus(repo, { id });
  expect(status).toContain('update-failed');
  expect(status).toContain('differs-from-record');
  expect(status).not.toContain('matches-record');
  update({ failBodyUpdate: false });
  closeBounty(repo, id);
  const read = readFormat(state().issues[0]!.body);
  expect(read.kind === 'present' && read.value.state.kind).toBe('closed-merged');
}));

it('ended full status rereads edited metadata; compact status names its cached observation', () => postedFixture(({ repo, id, state, update }) => {
  closeBounty(repo, id);
  const body = state().issues[0]!.body;
  const before = state().calls.length;
  update({ issues: [{ ...state().issues[0]!, body: body.replace('"withChanges":false', '"withChanges":true') }] });
  const compact = renderStatus(repo, { id });
  expect(state().calls).toHaveLength(before);
  expect(compact).toContain('cached last observation');
  expect(compact).toContain(`box bounty status ${id} --full`);
  expect(renderStatus(repo, { id, full: true })).toContain('differs-from-record');
  expect(loadRecord(repo, id).stage).toBe('withdrawn');
  update({ issues: [{ ...state().issues[0]!, body: body + FORMAT_MARKER + '\nforged\n-->\n' }] });
  expect(renderStatus(repo, { id, full: true })).toContain('GitHub format block: invalid');
  update({ issues: [{ ...state().issues[0]!, body: body.replaceAll(id, 'bt-abcdef123456') }] });
  expect(renderStatus(repo, { id, full: true })).toContain('differs-from-record');
  const read = readFormat(body);
  if (read.kind !== 'present') throw new Error('format missing');
  update({ issues: [{ ...state().issues[0]!, body: body.slice(0, read.start) }] });
  expect(renderStatus(repo, { id, full: true })).toContain('GitHub format block: absent');
}, { collected: false }));

it('ended full status reports unavailable reads and never claims a current match', () => postedFixture(({ repo, id, state, update }) => {
  closeBounty(repo, id);
  update({ fail: '/issues/' });
  const status = renderStatus(repo, { id, full: true });
  expect(status).toContain('current GitHub format read unavailable');
  expect(status).toContain('cached last comparison');
  expect(status).not.toContain('GitHub format block: matches-record');
  update({ fail: undefined, issues: [{ ...state().issues[0]!, user: { login: 'foreign' } }] });
  expect(renderStatus(repo, { id, full: true })).toContain('current GitHub format read unavailable');
  expect(loadRecord(repo, id).stage).toBe('withdrawn');
}, { collected: false }));

for (const mode of ['empty-next', 'repeat-next', 'bad-edge'] satisfies NonNullable<import('./github-fixture.js').GhState['graphqlMode']>[]) {
  it(`refuses ${mode} pagination rather than looping or treating partial comments as complete`, () => postedFixture(({ repo, id, state, update, bare }) => {
    update({ graphqlMode: mode, comments: [{ body: 'question one', user: { login: 'solver' } }, { body: 'question two', user: { login: 'solver' } }] });
    closeBounty(repo, id);
    expect(loadRecord(repo, id).github?.pending).toContain('github-response-invalid');
    expect(state().issues[0]!.state).toBe('open');
    expect(state().calls.filter(call => call.includes('graphql')).length).toBeLessThanOrEqual(2);
    expect(git(bare, ['show-ref'])).toContain(`box-bounty/${id}`);
  }, { collected: false }));
}
