// BT49: the text the tool posts and prints has a ceiling. An over-size issue is
// refused before anything is pushed or recorded; a change too large to show
// lists its files and says so, under --full and --json alike; no part of a
// diff ever passes for the whole.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { BountyRefused, loadRecord, LOOK_BYTES_MAX, lookBounty, postBounty, previewGitHub } from '../../../packages/box-bounty/index.js';
import { ISSUE_BODY_MAX, ISSUE_TITLE_MAX } from '../../../packages/box-bounty/post.js';
import { fixture, postedFixture } from './github-fixture.js';
import { CLI_DIST, git, ownerSays, writeRecord } from './support.js';

const refusal = (action: () => unknown): BountyRefused => {
  try { action(); }
  catch (error) { if (error instanceof BountyRefused) return error; throw error; }
  throw new Error('expected a refusal');
};
const box = (repo: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
const setTask = (repo: string, id: string, text: string): void => {
  const record = loadRecord(repo, id);
  writeRecord(repo, { ...record, content: { ...record.content!, task: { ...record.content!.task, text } } });
};
// The listing's own text around the task, read from the preview.
const bodyAround = (repo: string, id: string): number => {
  setTask(repo, id, 'x');
  const preview = previewGitHub(repo, id);
  return [...preview.slice(preview.indexOf('Issue body:\n') + 'Issue body:\n'.length)].length;
};

describe('BT49 an issue over GitHub\'s size is refused before anything goes out', () => {
  const unchanged = (repo: string, bare: string, id: string, issues: number) => {
    expect(loadRecord(repo, id).github).toBeUndefined();
    expect(loadRecord(repo, id).stage).toBe('drafted');
    expect(git(bare, ['for-each-ref', `refs/heads/box-bounty/${id}`])).toBe('');
    expect(issues).toBe(0);
  };

  it('a 65,537-character task is refused with its count; no branch, issue or record', () => fixture(({ repo, bare, id, state }) => {
    setTask(repo, id, 'y'.repeat(ISSUE_BODY_MAX + 1));
    const error = refusal(() => postBounty(repo, id));
    expect(error.reason).toBe('issue-too-large');
    expect(error.message).toContain(`the task text is ${ISSUE_BODY_MAX + 1}`);
    expect(error.message).toContain(`at most ${ISSUE_BODY_MAX}`);
    expect(error.message).toContain('split the task or shorten it');
    expect(error.message).toContain(`omakase-box close ${id}`);
    unchanged(repo, bare, id, state().issues.length);
  }));

  it('a body that crosses the limit only with the template is refused at its exact count', () => fixture(({ repo, bare, id, state }) => {
    const around = bodyAround(repo, id) - 1;
    setTask(repo, id, 'y'.repeat(ISSUE_BODY_MAX - around + 1));
    const error = refusal(() => postBounty(repo, id));
    expect(error.reason).toBe('issue-too-large');
    expect(error.message).toContain(`at least ${ISSUE_BODY_MAX + 1} characters`);
    unchanged(repo, bare, id, state().issues.length);
  }));

  it('a body at exactly the limit goes out, counted in code points', () => fixture(({ repo, id, state }) => {
    const around = bodyAround(repo, id) - 1;
    // Two UTF-16 units each: counting units would refuse this one.
    setTask(repo, id, '\u{1F600}'.repeat(ISSUE_BODY_MAX - around));
    expect(postBounty(repo, id).record.stage).toBe('posted');
    expect([...state().issues[0]!.body].length).toBe(ISSUE_BODY_MAX);
  }));

  it('a 257-character title is refused with its count, and at a preview too', () => fixture(({ repo, bare, id, state }) => {
    const record = loadRecord(repo, id);
    const title = 't'.repeat(ISSUE_TITLE_MAX + 1 - `[box bounty ${id}] `.length);
    writeRecord(repo, { ...record, title });
    for (const action of [() => postBounty(repo, id), () => previewGitHub(repo, id)]) {
      const error = refusal(action);
      expect(error.reason).toBe('title-too-long');
      expect(error.message).toContain(`is ${ISSUE_TITLE_MAX + 1} characters`);
      expect(error.message).toContain(`at most ${ISSUE_TITLE_MAX}`);
    }
    unchanged(repo, bare, id, state().issues.length);
    writeRecord(repo, { ...record, title: title.slice(1) });
    expect(postBounty(repo, id).record.stage).toBe('posted');
  }));

  it('an owner set to be asked each time is not asked about a post that cannot go', () => fixture(({ repo, bare, id, state }) => {
    ownerSays(repo, 'ask');
    setTask(repo, id, 'y'.repeat(ISSUE_BODY_MAX + 1));
    expect(refusal(() => postBounty(repo, id)).reason).toBe('issue-too-large');
    expect(loadRecord(repo, id).waiting).toBeUndefined();
    unchanged(repo, bare, id, state().issues.length);
  }));

  it('the preview refuses an over-size task before the owner approves anything', () => fixture(({ repo, id }) => {
    setTask(repo, id, 'y'.repeat(ISSUE_BODY_MAX + 1));
    expect(refusal(() => previewGitHub(repo, id)).reason).toBe('issue-too-large');
  }));
});

describe('BT49 a change too large to show says so', () => {
  const line = 'solver line of exactly forty characters\n';
  const sized = (bytes: number) => line.repeat(Math.ceil(bytes / line.length));
  const OVER = 3 * 1024 * 1024;

  it('--full prints the file list and the named line, not one line of the diff', () => postedFixture(({ repo, id, pr }) => {
    pr('solver', { 'huge.txt': sized(OVER), 'small.txt': 'marker-in-small\n' });
    const run = box(repo, 'look', id, '2', '--full');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('solution-too-large-to-show');
    const result = lookBounty(repo, id, 2, { full: true });
    expect(run.stdout).toContain(`the change is ${result.tooLarge!.bytes} bytes, over the ${LOOK_BYTES_MAX}`);
    expect(result.tooLarge!.bytes).toBeGreaterThan(OVER);
    expect(run.stdout).toContain('3 file(s) changed:');
    expect(run.stdout).toContain('huge.txt');
    expect(run.stdout).not.toContain('solver line of exactly');
    expect(run.stdout).not.toContain('marker-in-small');
    expect(run.stdout).toContain('your own git');
    expect(run.stdout).toContain(`omakase-box apply ${id} 2`);
    // The next step names commits that exist: following it works.
    const own = /git diff (--no-ext-diff --no-textconv --stat [a-f\d]{40} [a-f\d]{40})/.exec(run.stdout)!;
    expect(git(repo, ['diff', ...own[1]!.split(' ')])).toContain('huge.txt');
    // Over the cap, the no-switch form must not promise --full.
    expect(box(repo, 'look', id, '2').stdout).not.toContain('--full prints the whole change');
  }));

  it('--json holds the diff back the same way, with the count', () => postedFixture(({ repo, id, pr }) => {
    pr('solver', { 'huge.txt': sized(OVER) });
    const run = box(repo, 'look', id, '2', '--full', '--json');
    expect(run.status).toBe(0);
    expect(run.stdout.length).toBeLessThan(LOOK_BYTES_MAX);
    const doc = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(doc['diff']).toBeNull();
    expect(doc['tooLarge']).toMatchObject({ reason: 'solution-too-large-to-show', limit: LOOK_BYTES_MAX, fileCount: 2, filesOmitted: 0 });
    expect((doc['tooLarge'] as { bytes: number }).bytes).toBeGreaterThan(OVER);
    expect((doc['files'] as { path: string }[]).map(file => file.path)).toContain('huge.txt');
  }));

  it('a change just under the cap still prints in full', () => postedFixture(({ repo, id, pr }) => {
    pr('solver', { 'big.txt': sized(LOOK_BYTES_MAX - 64 * 1024) });
    const result = lookBounty(repo, id, 2, { full: true });
    expect(result.tooLarge).toBeNull();
    expect(Buffer.byteLength(result.diff!)).toBeLessThanOrEqual(LOOK_BYTES_MAX);
    const run = box(repo, 'look', id, '2', '--full');
    expect(run.stdout).not.toContain('solution-too-large-to-show');
    expect(run.stdout).toContain('solver line of exactly');
    const doc = JSON.parse(box(repo, 'look', id, '2', '--full', '--json').stdout) as Record<string, unknown>;
    expect(doc['tooLarge']).toBeNull();
    expect(doc['diff']).toBe(result.diff);
  }));

  it('--export still writes the whole change', () => postedFixture(({ repo, id, pr }) => {
    pr('solver', { 'huge.txt': sized(OVER) });
    const run = box(repo, 'look', id, '2', '--export');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('exported, not printed');
    expect(run.stdout).not.toContain('solver line of exactly');
    expect(Number(/(\d+) byte\(s\)/.exec(run.stdout)![1])).toBeGreaterThan(OVER);
  }));
});
