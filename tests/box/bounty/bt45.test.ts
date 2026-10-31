import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalizeBounty, loadRecord, planBounty, postBounty, previewGitHub, renderPreview } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { SCAN_LIMIT_LINE } from '../../../packages/box-bounty/wording.js';
import { makeRepo, write } from './support.js';
import { fixture } from './github-fixture.js';

// BT45: the bounty's own text — title, why, task text and the rendered issue
// body — is read by the same secret rules as the files. A hit is recorded at
// create and holds the post for the owner. Every secret-shaped value below is
// built at run time so this file's own bytes never hold one.

const joined = (...parts: string[]) => parts.join('');
const TOKEN = joined('gh', 'p_', 'Ab3dEf6hIj9kLm2nOp5q');

function draft(repo: string, task: string, extra: Partial<CreateOptions> = {}) {
  write(repo, 'TASK45.md', task);
  return finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK45.md'), ...extra }));
}

// The held post's message, or a failure when the post went out.
function heldMessage(repo: string, id: string): string {
  try { postBounty(repo, id, 'github'); } catch (error) {
    expect(error).toMatchObject({ reason: 'publish-held' });
    return (error as Error).message;
  }
  return expect.unreachable('the post went out');
}

describe('the task text is scanned at create and at post', () => {
  it('a token in the task file is recorded at create and holds the post — the value is never printed', () => fixture(({ repo, state }) => {
    const created = draft(repo, `Fix the login.\nIt fails with ${TOKEN} in the header.\n`);
    expect(created.plan.scan.hits).toContainEqual({ path: '(task text)', line: 2, rule: 'github-token' });
    const summary = renderPreview(created.plan);
    expect(summary).toContain('(task text) line 2 — github-token');
    expect(summary).toContain('next: remove it from the title, why or task text and create the bounty again');
    expect(summary).not.toContain(TOKEN);
    expect(loadRecord(repo, created.id).scanFindings?.[0]).toMatchObject({ where: 'create', settled: null });

    const preview = previewGitHub(repo, created.id);
    expect(preview).toMatch(/Pre-publish scan: 1 secret-shaped hit\(s\) — a post would wait for the owner:\n {4}\(issue body\) line \d+ — github-token/);
    expect(preview).toContain('Issue body:\n(withheld — the scan flagged it; see the hit above)');
    expect(preview).not.toContain(TOKEN);

    const message = heldMessage(repo, created.id);
    expect(state().issues).toHaveLength(0);
    const record = loadRecord(repo, created.id);
    expect(record.waiting?.reason).toBe('secrets');
    expect(record.waiting?.hits?.[0]).toMatchObject({ path: '(issue body)', rule: 'github-token' });
    expect(record.scanFindings?.at(-1)).toMatchObject({ where: 'post', settled: null });
    // The owner block keeps its form: who it is for, what was found, that
    // nothing went out — and no path-keyed choice for a field with no path.
    expect(message).toContain('for the owner — pass this on in these words:');
    expect(message).toMatch(/Something in this bounty's own text looks like a password or key: issue body, line \d+\./);
    expect(message).toContain('  Nothing has been published.');
    expect(message).not.toContain('say the file is safe to publish');
    expect(message).toContain(`box bounty close ${created.id} ends this one`);
    expect(message).toContain(`next: pass the owner block on in its words; box bounty status ${created.id} shows when the answer lands`);
    expect(message).not.toContain(TOKEN);
  }));

  it('a --why hit and a --title hit behave the same way, each named by its field', () => fixture(({ repo, state }) => {
    const why = draft(repo, 'Fix the login.\n', { why: `the key ${TOKEN} stopped working` });
    expect(why.plan.scan.hits).toEqual([{ path: '(why)', line: 1, rule: 'github-token' }]);
    expect(renderPreview(why.plan)).not.toContain(TOKEN);
    expect(previewGitHub(repo, why.id)).not.toContain(TOKEN);
    expect(heldMessage(repo, why.id)).toContain('hit: (why) line 1 — github-token');

    const title = draft(repo, 'Fix the login.\n', { title: `rotate ${TOKEN}` });
    expect(title.plan.scan.hits).toEqual([{ path: '(title)', line: 1, rule: 'github-token' }]);
    expect(renderPreview(title.plan)).toContain('title: (withheld');
    expect(renderPreview(title.plan)).not.toContain(TOKEN);
    expect(previewGitHub(repo, title.id)).not.toContain(TOKEN);
    const message = heldMessage(repo, title.id);
    expect(message).toContain('hit: (issue title) line 1 — github-token');
    expect(message).toMatch(/hit: \(issue body\) line \d+ — github-token/);
    expect(message).not.toContain(TOKEN);
    expect(state().issues).toHaveLength(0);
  }));

  it('a clean task that talks about a token in prose is not a hit and posts', () => fixture(({ repo, state }) => {
    const created = draft(repo, 'The auth token expires too early; the password reset flow and the api key page break.\n');
    expect(created.plan.scan.hits).toEqual([]);
    postBounty(repo, created.id, 'github');
    expect(state().issues).toHaveLength(1);
  }));
});

describe('the scan states its limits in one line', () => {
  it('post --preview says it exactly once, and so does create', () => fixture(({ repo, id }) => {
    expect(SCAN_LIMIT_LINE).toBe('the scan reads text for the shapes listed in BOUNTY.md; binary files, base64, split lines and names that do not look like secrets are not covered.');
    expect(previewGitHub(repo, id).split(SCAN_LIMIT_LINE)).toHaveLength(2);
    const plan = planBounty({ repoPath: makeRepo({ 'a.txt': 'x\n' }), why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md') });
    expect(renderPreview(plan).split(SCAN_LIMIT_LINE)).toHaveLength(2);
  }));
});
