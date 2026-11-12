// BT61: every command answers --json with one document on standard output, built from what the command did. The journey is
// the stand-in world of bt19 and bt61-text: describe, help, create, the preview, allow, post, apply, close, hook, deny.
// Take and submit (the solver's half, which needs the board's stand-in) are in bt61-solver.test.ts.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharedFixture } from './github-fixture.js';
import { CLI_DIST, makeRepo } from './support.js';

type Doc = Record<string, unknown>;
const box = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });
/** One JSON line on standard output, nothing on standard error, exit 0 (unless a test says otherwise). */
const doc = (cwd: string, args: string[], exit = 0): Doc => {
  const ran = box(cwd, args);
  expect(ran.status, `${args.join(' ')}: ${ran.stdout}${ran.stderr}`).toBe(exit);
  expect(ran.stderr, `${args.join(' ')} wrote to standard error`).toBe('');
  expect(ran.stdout.endsWith('\n')).toBe(true);
  expect(ran.stdout.trim().split('\n'), `${args.join(' ')} printed more than one line`).toHaveLength(1);
  return JSON.parse(ran.stdout) as Doc;
};
const keys = (document: Doc): string[] => Object.keys(document);

describe('BT61: a document per command', { timeout: 300000 }, () => {
  const world = sharedFixture();
  const { repo, id, scratch, pr } = world;

  it('describe, help and the solving half: the text is the content, as lines', () => world.run(() => {
    const described = doc(repo, ['describe', '--json']);
    expect(described['schema']).toBe('box-bounty/describe@1');
    expect(described['mode']).toBe('description');
    expect((described['lines'] as string[]).join('\n')).toContain('omakase-box');
    expect(doc(repo, ['describe', '--rules', '--json'])['mode']).toBe('rules');
    expect(doc(repo, ['describe', '--solving', '--json'])['mode']).toBe('solving');
    const help = doc(repo, ['help', '--json']);
    expect(help['schema']).toBe('box-bounty/help@1');
    expect((help['lines'] as string[]).length).toBeGreaterThan(10);
    expect(Array.isArray(help['notices'])).toBe(true);
  }));

  it('create: the id, the drafted facts and the next step', () => {
    const plain = makeRepo({ 'TASK.md': 'Fix the thing.\n' });
    const created = doc(plain, ['create', '--task', 'TASK.md', '--why', 'a test of the document', '--json']);
    expect(created['schema']).toBe('box-bounty/create@1');
    expect(created['id']).toMatch(/^bt-[a-f\d]{12}$/);
    expect(typeof created['recordPath']).toBe('string');
    expect(created['reward']).toBe(0);
    expect(created['next']).toBe(`omakase-box post ${String(created['id'])} (--preview shows what becomes public)`);
    expect(keys(created)[0]).toBe('schema');
    expect((created['lines'] as string[])[0]).toContain('drafted in');
    // the same command without --json prints the lines the document carries
    const text = box(plain, ['create', '--task', 'TASK.md', '--why', 'again']);
    expect(text.stdout).toContain('drafted in');
    expect(text.stdout).not.toContain('"schema"');
  });

  it('the preview, allow and post: facts a program reads instead of sentences', () => world.run(() => {
    const preview = doc(repo, ['post', id, '--preview', '--json']);
    expect(preview['schema']).toBe('box-bounty/post-preview@1');
    expect(preview['posted']).toBe(false);
    expect(preview['id']).toBe(id);
    expect(preview['branch']).toBe(`box-bounty/${id}`);
    expect(String(preview['head'])).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof preview['issueBody']).toBe('string');
    expect(Array.isArray(preview['pushed'])).toBe(true);
    expect((preview['lines'] as string[]).join('\n')).toContain('preview only — nothing was posted');

    const allowed = doc(repo, ['allow', 'owner/project', '--reward', '10', '--reward-limit', '30', '--json']);
    expect(allowed['schema']).toBe('box-bounty/allow@1');
    expect(allowed).toMatchObject({ kind: 'repository', repository: 'owner/project', decision: 'allowed', reward: 10, rewardLimit: 30 });

    const posted = doc(repo, ['post', id, '--json']);
    expect(posted['schema']).toBe('box-bounty/post@1');
    expect(posted).toMatchObject({ id, posted: true, reward: 10, branch: `box-bounty/${id}` });
    const issue = posted['issue'] as { number: number; url: string };
    expect(Number.isInteger(issue.number)).toBe(true);
    expect(issue.url).toContain('/issues/');
    expect(String(posted['destination'])).toContain(issue.url.split('/issues/')[0]!.replace('https://github.com/', ''));
  }));

  it('apply: the merge commit, the way to publish it and the way to undo it', () => world.run(() => {
    pr('solver-a');
    box(repo, ['look', id, '1']);
    const applied = doc(repo, ['apply', id, '1', '--json']);
    expect(applied['schema']).toBe('box-bounty/apply@1');
    expect(applied).toMatchObject({ id, outcome: 'applied', attempt: 1, stage: 'applied' });
    expect(applied['mergeCommit']).toMatch(/^[a-f\d]{40}$/);
    expect(applied['revert']).toBe(`git revert -m 1 ${String(applied['mergeCommit'])}`);
    expect(applied['conflicts']).toBeNull();
    expect(applied).toHaveProperty('notOnGitHub');
    expect(applied).toHaveProperty('github');
    expect(typeof applied['job']).toBe('string');
    expect(Array.isArray(applied['notices'])).toBe(true);
  }));

  it('close, hook and deny: the ended bounty, the hook, and the owner\'s word removed', () => world.run(() => {
    const closed = doc(repo, ['close', id, '--json']);
    expect(closed['schema']).toBe('box-bounty/close@1');
    expect(closed).toMatchObject({ id, outcome: 'already-ended' });
    expect(closed['stage']).toBe('applied');
    expect(closed['reason']).toBeNull();
    const hook = doc(repo, ['hook', '--json']);
    expect(hook['schema']).toBe('box-bounty/hook@1');
    expect(hook['action']).toBe('status');
    const denied = doc(repo, ['deny', 'owner/project', '--json']);
    expect(denied['schema']).toBe('box-bounty/deny@1');
    expect(denied).toMatchObject({ kind: 'repository', repository: 'owner/project' });
    expect(denied['decision']).toBeNull();
    writeFileSync(join(scratch, 'settings', 'unused.txt'), 'x');
  }));
});
