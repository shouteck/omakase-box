// K19 — stand-in GitHub parity with real GitHub.
//
// K18 found the demo's stand-in answered `issues/<n>` with the whole issue
// list and read the page number out of `per_page=100`, so every paged list
// came back empty and a participant run was spent before anyone noticed
// (kitchen/stations/evidence.md: a stand-in that answers is not one that
// answers correctly). This check drives every committed stand-in through the
// request set the tool made during the recorded real-GitHub run
// (kitchen/demo/bt11b-real-transcript.txt — one issue, two pull requests on
// the shared number sequence, comments, labels, the closing graphql reads)
// and compares the shape of each answer with what GitHub returned there: one
// object for a single thing, a list for a collection, `page` selecting the
// page, filters honoured, new numbers minted on the shared sequence.
//
// K22 adds a drift guard on top: for every endpoint at least two stand-ins
// answer, the full recursive key set of their answers — key names and value
// types, never the values — must be identical. Chosen-field comparisons
// cannot see a missing key: BT16 added `permissions.push` to the repository
// read and gh-standin.cjs lacked it until the hosted kitchen run went red.
//
// Stand-ins on trial (any new `gh api` implementation must join this list):
//   - kitchen/demo/gh-standin.cjs — the bt11b replay's stand-in
//   - tests/box/bounty/github-fixture.ts — the STANDIN the bounty suite mocks
//   - tests/box/bounty/bt7-ux-fixture.mjs — the offline UX fixture's `gh`
// Deliberately absent: tests/box/bounty/hook.test.ts's FOREVER_STANDIN is a
// fault injector that paginates forever on purpose — it exists to prove the
// tool stays inside its run budget, not to imitate GitHub.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k19-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); });

// Extract a `const NAME = String.raw`<code>`;` stand-in body from a source
// file. `${leakCanary}` interpolations in github-fixture's block are filled
// with this suite's own canary.
function extractRaw(sourceFile: string, name: string): string {
  const source = readFileSync(sourceFile, 'utf8');
  const marker = `const ${name} = String.raw\``;
  const start = source.indexOf(marker);
  expect(start, `${name} stand-in not found in ${sourceFile}`).toBeGreaterThanOrEqual(0);
  const body = source.slice(start + marker.length, source.indexOf('`;', start));
  return body.split('${leakCanary}').join('ghp_K19_CANARY');
}

const ISSUE = { number: 1, html_url: 'https://github.com/owner/project/issues/1', title: '[box bounty bt-0000000000aa] Repair the app.', body: 'do it\n\n<!-- box-bounty:bt-0000000000aa -->', state: 'open', labels: [{ name: 'box-bounty' }], user: { login: 'owner' } };
const BRANCH = 'box-bounty/bt-0000000000aa';
const SHA = 'a'.repeat(40);
const SHB = 'b'.repeat(40);
const pr = (n: number, author: string, sha: string) => ({ number: n, html_url: `https://github.com/owner/project/pull/${n}`, title: `fix (${author})`, body: 'fix\n\npay-to: https://buy.stripe.com/test_x', user: { login: author }, base: { ref: BRANCH, repo: { full_name: 'owner/project' } }, head: { sha }, state: 'open', files: [{ filename: 'app.txt' }] });

interface Standin {
  name: string;
  file: string;
  stateEnv: string;
  bareEnv?: string;
  seed: () => object;
}

// A bare remote carrying the bounty branch and both pull-request heads, so
// the stand-ins that shell out to `git diff` for pulls/<n>/files see real
// refs — the replay's stand-in reads the files list that way.
function makeBare(): { bare: string; shaA: string; shaB: string } {
  const dir = temp();
  const bare = join(dir, 'remote.git');
  const work = join(dir, 'work');
  mkdirSync(work, { recursive: true });
  const git = (cwd: string, args: string[]) => {
    const run = spawnSync('git', ['-c', `safe.directory=${cwd.replaceAll('\\', '/')}`, '-C', cwd, ...args], { encoding: 'utf8' });
    expect(run.status, `git ${args.join(' ')}: ${run.stderr}`).toBe(0);
    return run.stdout.trim();
  };
  git(dir, ['init', '--bare', bare]);
  git(dir, ['init', '-b', 'main', work]);
  writeFileSync(join(work, 'app.txt'), 'broken\n');
  git(work, ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', 'add', '-A']);
  git(work, ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', 'commit', '-qm', 'base']);
  const base = git(work, ['rev-parse', 'HEAD']);
  git(work, ['push', '-q', bare, `HEAD:refs/heads/${BRANCH}`]);
  const shas = ['fixed\n', 'fixed again\n'].map(content => {
    writeFileSync(join(work, 'app.txt'), content);
    git(work, ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', 'commit', '-qam', 'fix']);
    return git(work, ['rev-parse', 'HEAD']);
  });
  git(work, ['push', '-q', bare, `${shas[0]}:refs/pull/2/head`, `${shas[1]}:refs/pull/3/head`, `${base}:refs/heads/main`]);
  return { bare, shaA: shas[0]!, shaB: shas[1]! };
}

const replayFile = join(root, 'kitchen', 'demo', 'gh-standin.cjs');
const fixtureSource = join(root, 'tests', 'box', 'bounty', 'github-fixture.ts');
const uxSource = join(root, 'tests', 'box', 'bounty', 'bt7-ux-fixture.mjs');

function standins(bare: string, shaA: string, shaB: string): Standin[] {
  const fixture = join(temp(), 'fixture-standin.cjs');
  writeFileSync(fixture, extractRaw(fixtureSource, 'STANDIN'));
  const ux = join(temp(), 'ux-standin.cjs');
  writeFileSync(ux, extractRaw(uxSource, 'gh'));
  const prs = [pr(2, 'solver-a', shaA), pr(3, 'solver-b', shaB)];
  return [
    { name: 'kitchen/demo/gh-standin.cjs', file: replayFile, stateEnv: 'REPLAY_STATE', bareEnv: 'REPLAY_BARE', seed: () => ({ account: 'owner', issues: [ISSUE], comments: [], prs: prs.map(({ files, ...rest }) => rest), labels: [{ name: 'box-bounty' }] }) },
    { name: 'github-fixture.ts STANDIN', file: fixture, stateEnv: 'BT6_GH_STATE', seed: () => ({ visibility: 'public', private: false, auth: true, account: 'owner', repository: 'owner/project', issues: [ISSUE], comments: [], prs, labels: [{ name: 'box-bounty' }], calls: [] }) },
    { name: 'bt7-ux-fixture.mjs gh', file: ux, stateEnv: 'BT7_UX_STATE', seed: () => ({ issues: [ISSUE], comments: [], prs, labels: [{ name: 'box-bounty' }] }) },
  ];
}

function drive(standin: Standin, bare: string) {
  const dir = temp();
  const stateFile = join(dir, 'state.json');
  const seed = () => writeFileSync(stateFile, JSON.stringify(standin.seed()));
  seed();
  const env: Record<string, string | undefined> = { ...process.env, [standin.stateEnv]: stateFile };
  if (standin.bareEnv !== undefined) env[standin.bareEnv] = bare;
  return {
    reset: seed,
    api(endpoint: string, payload?: object, method = 'POST') {
      const args = [standin.file, 'api', '--hostname', 'github.com', endpoint];
      if (payload !== undefined) {
        const input = join(dir, `input-${Math.random().toString(36).slice(2)}.json`);
        writeFileSync(input, JSON.stringify(payload));
        args.push('--method', method, '--input', input);
      }
      const run = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
      return { status: run.status, value: run.status === 0 ? JSON.parse(run.stdout) : undefined, stderr: run.stderr };
    },
  };
}

type Gh = ReturnType<typeof drive>;

// The requests the tool makes on the journey the real transcript recorded —
// each expectation is the shape GitHub answered with there.
function parity(gh: Gh): void {
  // `gh api user` — signed-in account, one object.
  expect(gh.api('user').value).toMatchObject({ login: 'owner' });
  // `gh api repos/<o>/<r>` — repository facts, one object.
  expect(gh.api('repos/owner/project').value).toMatchObject({ full_name: 'owner/project', private: false });
  // `gh api repos/<o>/<r>/issues/1` — ONE issue object, never the list
  // (K18 fault: the old stand-in answered with the array).
  const issue = gh.api('repos/owner/project/issues/1');
  expect(issue.status).toBe(0);
  expect(Array.isArray(issue.value), 'issues/<n> must answer one object, not the list').toBe(false);
  expect(issue.value).toMatchObject({ number: 1, state: 'open', user: { login: 'owner' } });
  expect(typeof issue.value.body).toBe('string');
  // `pages()` asks ...?per_page=100&page=N: the answer must be the page asked
  // for (K18 fault: the old stand-in read 100 out of per_page and emptied
  // every list). Page 1 carries the row; page 2 is empty.
  const listed = gh.api('repos/owner/project/issues?state=all&per_page=100&page=1');
  expect(Array.isArray(listed.value)).toBe(true);
  expect(listed.value.map((i: { number: number }) => i.number)).toContain(1);
  expect(gh.api('repos/owner/project/issues?state=all&per_page=100&page=2').value).toEqual([]);
  // state= is honoured.
  expect(gh.api('repos/owner/project/issues?state=open&per_page=100&page=1').value).toHaveLength(1);
  expect(gh.api('repos/owner/project/issues?state=closed&per_page=100&page=1').value).toEqual([]);
  // The solutions list: open pull requests against the bounty branch, paged.
  const pulls = gh.api(`repos/owner/project/pulls?state=open&base=${BRANCH}&per_page=100&page=1`);
  expect(Array.isArray(pulls.value)).toBe(true);
  expect(pulls.value.map((p: { number: number }) => p.number)).toEqual([2, 3]);
  for (const entry of pulls.value) {
    expect(entry.user.login).toBeTruthy();
    expect(entry.head.sha).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof entry.body).toBe('string');
  }
  expect(gh.api(`repos/owner/project/pulls?state=open&base=${BRANCH}&per_page=100&page=2`).value).toEqual([]);
  expect(gh.api(`repos/owner/project/pulls?state=open&base=other-branch&per_page=100&page=1`).value).toEqual([]);
  // A single pull request answers as one object.
  expect(gh.api('repos/owner/project/pulls/2').value).toMatchObject({ number: 2, user: { login: 'solver-a' } });
  // The changed-files list answers as a list of {filename}, paged.
  const files = gh.api('repos/owner/project/pulls/2/files?per_page=100&page=1');
  expect(files.status).toBe(0);
  expect(files.value).toEqual([{ filename: 'app.txt' }]);
  expect(gh.api('repos/owner/project/pulls/2/files?per_page=100&page=2').value).toEqual([]);
  // The label probe: present → object.
  expect(gh.api('repos/owner/project/labels/box-bounty').value).toMatchObject({ name: 'box-bounty' });
  // The bounty post: a created issue is one object on the shared sequence.
  gh.reset();
  const posted = gh.api('repos/owner/project/issues', { title: 't', body: 'b <!-- box-bounty:bt-0000000000aa -->', labels: ['box-bounty'] });
  expect(posted.status).toBe(0);
  expect(posted.value).toMatchObject({ number: 4, state: 'open' });
  expect(posted.value.labels).toEqual([{ name: 'box-bounty' }]);
  // A new pull request mints the next shared number.
  const opened = gh.api('repos/owner/project/pulls', { title: 'fix', body: 'b', base: BRANCH, author: 'solver-c' });
  expect(opened.status).toBe(0);
  expect(opened.value.number, 'issues and pull requests share one number sequence').toBe(5);
  // Comments belong to their issue and page like any list.
  const comment = gh.api('repos/owner/project/issues/1/comments', { body: 'a question?' });
  expect(comment.status).toBe(0);
  expect(comment.value).toMatchObject({ body: 'a question?' });
  expect(gh.api('repos/owner/project/issues/1/comments?per_page=100&page=1').value).toHaveLength(1);
  expect(gh.api('repos/owner/project/issues/1/comments?per_page=100&page=2').value).toEqual([]);
  // …and only to their issue (K22 correction): issue #4, posted above, does
  // not list issue #1's comment — not by REST, not by the closing graphql read.
  expect(gh.api('repos/owner/project/issues/4/comments?per_page=100&page=1').value, 'a comment on issue 1 must not be listed on issue 4').toEqual([]);
  const otherIssue = gh.api('graphql', { query: 'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){issue(number:$number){body author{login} comments(first:100,after:$after){edges{cursor node{body author{login}}} pageInfo{hasNextPage}}}}}', variables: { owner: 'owner', name: 'project', number: 4, after: null } });
  expect(otherIssue.status).toBe(0);
  expect(otherIssue.value?.data?.repository?.issue?.comments?.edges, 'a comment on issue 1 must not be read as issue 4\'s').toEqual([]);
  // Closing the issue: PATCH answers the issue object with the new state,
  // and the open filter then excludes it.
  const closed = gh.api('repos/owner/project/issues/1', { state: 'closed' }, 'PATCH');
  expect(closed.value).toMatchObject({ number: 1, state: 'closed' });
  expect(gh.api('repos/owner/project/issues?state=open&per_page=100&page=1').value.map((i: { number: number }) => i.number)).not.toContain(1);
  // The closing graphql reads: issue body, author and paged comments; the
  // pull request description with its last editor.
  const commentsPage = gh.api('graphql', { query: 'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){issue(number:$number){body author{login} comments(first:100,after:$after){edges{cursor node{body author{login}}} pageInfo{hasNextPage}}}}}', variables: { owner: 'owner', name: 'project', number: 1, after: null } });
  expect(commentsPage.status).toBe(0);
  const issueNode = commentsPage.value?.data?.repository?.issue;
  expect(typeof issueNode?.body).toBe('string');
  expect(Array.isArray(issueNode?.comments?.edges)).toBe(true);
  expect(typeof issueNode?.comments?.pageInfo?.hasNextPage).toBe('boolean');
  const prRead = gh.api('graphql', { query: 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){body userContentEdits(last:1){nodes{editor{login}}}}}}', variables: { owner: 'owner', name: 'project', number: 2 } });
  expect(prRead.status).toBe(0);
  expect(typeof prRead.value?.data?.repository?.pullRequest?.body).toBe('string');
  // A number nobody minted is not found — GitHub answers 404 and gh exits 1.
  expect(gh.api('repos/owner/project/issues/99').status).not.toBe(0);
  expect(gh.api('repos/owner/project/pulls/99').status).not.toBe(0);
}

// The recursive shape of an answer: objects become sorted key -> shape maps,
// arrays become the set of their elements' shapes, scalars become typeof.
// Values are never compared — two stand-ins may say different words but must
// say them under the same keys.
function shapeOf(value: unknown): unknown {
  if (value === null) return 'null';
  if (Array.isArray(value)) return ['array', [...new Set(value.map(item => JSON.stringify(shapeOf(item))))].sort()];
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, shapeOf(record[key])]));
  }
  return typeof value;
}

// The endpoint set parity() drives, in the same order, so mutated and paged
// answers are compared too — not only reads of the seeded state.
function collectShapes(gh: Gh): Map<string, { answered: boolean; shape: string | null }> {
  const answers = new Map<string, { answered: boolean; shape: string | null }>();
  const ask = (label: string, endpoint: string, payload?: object, method = 'POST') => {
    const res = gh.api(endpoint, payload, method);
    answers.set(label, { answered: res.status === 0, shape: res.status === 0 ? JSON.stringify(shapeOf(res.value)) : null });
  };
  ask('GET user', 'user');
  ask('GET repos/owner/project', 'repos/owner/project');
  ask('GET issues/1', 'repos/owner/project/issues/1');
  ask('GET issues state=all p1', 'repos/owner/project/issues?state=all&per_page=100&page=1');
  ask('GET issues state=all p2', 'repos/owner/project/issues?state=all&per_page=100&page=2');
  ask('GET issues state=open', 'repos/owner/project/issues?state=open&per_page=100&page=1');
  ask('GET issues state=closed', 'repos/owner/project/issues?state=closed&per_page=100&page=1');
  ask('GET pulls base=branch p1', `repos/owner/project/pulls?state=open&base=${BRANCH}&per_page=100&page=1`);
  ask('GET pulls base=branch p2', `repos/owner/project/pulls?state=open&base=${BRANCH}&per_page=100&page=2`);
  ask('GET pulls base=other', `repos/owner/project/pulls?state=open&base=other-branch&per_page=100&page=1`);
  ask('GET pulls/2', 'repos/owner/project/pulls/2');
  ask('GET pulls/2/files p1', 'repos/owner/project/pulls/2/files?per_page=100&page=1');
  ask('GET pulls/2/files p2', 'repos/owner/project/pulls/2/files?per_page=100&page=2');
  ask('GET labels/box-bounty', 'repos/owner/project/labels/box-bounty');
  gh.reset();
  ask('POST issues', 'repos/owner/project/issues', { title: 't', body: 'b <!-- box-bounty:bt-0000000000aa -->', labels: ['box-bounty'] });
  ask('POST pulls', 'repos/owner/project/pulls', { title: 'fix', body: 'b', base: BRANCH, author: 'solver-c' });
  ask('POST issues/1/comments', 'repos/owner/project/issues/1/comments', { body: 'a question?' });
  ask('GET issues/1/comments p1', 'repos/owner/project/issues/1/comments?per_page=100&page=1');
  ask('GET issues/1/comments p2', 'repos/owner/project/issues/1/comments?per_page=100&page=2');
  ask('POST labels', 'repos/owner/project/labels', { name: 'extra-label' });
  ask('PATCH issues/1', 'repos/owner/project/issues/1', { state: 'closed' }, 'PATCH');
  ask('graphql issue comments', 'graphql', { query: 'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){issue(number:$number){body author{login} comments(first:100,after:$after){edges{cursor node{body author{login}}} pageInfo{hasNextPage}}}}}', variables: { owner: 'owner', name: 'project', number: 1, after: null } });
  ask('graphql pull request', 'graphql', { query: 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){body userContentEdits(last:1){nodes{editor{login}}}}}}', variables: { owner: 'owner', name: 'project', number: 2 } });
  ask('GET issues/99 (unminted)', 'repos/owner/project/issues/99');
  ask('GET pulls/99 (unminted)', 'repos/owner/project/pulls/99');
  return answers;
}

describe('every committed stand-in GitHub answers the way GitHub answered in the real transcript', () => {
  const { bare, shaA, shaB } = makeBare();
  for (const standin of standins(bare, shaA, shaB)) {
    it(standin.name, () => parity(drive(standin, bare)));
  }
});

describe('the stand-ins cannot drift apart (K22)', () => {
  const { bare, shaA, shaB } = makeBare();
  it('the recursive key set of every answer at least two give is identical', () => {
    const observed = standins(bare, shaA, shaB).map(standin => ({ name: standin.name, answers: collectShapes(drive(standin, bare)) }));
    for (const [label] of observed[0]!.answers) {
      const answered = observed.filter(entry => entry.answers.get(label)!.answered);
      if (answered.length < 2) continue; // fewer than two answers — nothing to compare
      for (const entry of observed) {
        const answer = entry.answers.get(label)!;
        expect(answer.answered, `${entry.name} did not answer "${label}" but ${answered.map(item => item.name).join(', ')} did`).toBe(true);
        expect(answer.shape, `"${label}": ${entry.name}'s answer shape differs from ${answered[0]!.name}'s`).toBe(answered[0]!.answers.get(label)!.shape);
      }
    }
  });
});
