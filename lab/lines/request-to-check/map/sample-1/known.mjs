// Known cases, kept apart from the sample: the three commander.js issues the kitchen recorded in R3b-1.
// Derived from fetch.mjs; same files, same limits.
// (original header follows) Fetches outside sample 1 exactly as PLAN.md declares: per repository, the 5 newest open issues
// and the 5 newest issues closed as completed by a merged pull request. Read-only GitHub API calls
// through the host's `gh`. Writes raw/<id>.json (everything kept), issues/<id>.md (what labellers
// read), facts.json (mechanical facts) and fetch-record.json (queries, time, shortfalls).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const KNOWN = [['tj/commander.js', 'commander', 2614, 2615], ['tj/commander.js', 'commander', 2603, 2609], ['tj/commander.js', 'commander', 2342, 2350]];
const PER = 5, FIXED_POOL = 15;
const LIMITS = { body: 6000, comment: 1500, comments: 12, testPatch: 5000 };
const TEST_PATH = /(^|\/)(tests?|spec|__tests__)\/|_test\.|\.test\.|\.spec\.|(^|\/)test_[^/]*$/i;

const gh = args => JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 1 << 27 }));
const search = (q, perPage) => gh(['-X', 'GET', 'search/issues', '-f', `q=${q}`, '-f', 'sort=created', '-f', 'order=desc', '-f', `per_page=${perPage}`]).items;
const closers = (owner, name, number) => gh(['graphql', '-f', 'query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){closedByPullRequestsReferences(first:5){nodes{number merged title createdAt mergedAt}}}}}', '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${number}`]).data.repository.issue.closedByPullRequestsReferences.nodes;
const cut = (text, n) => { const t = (text || '').replace(/\r\n/g, '\n'); return t.length > n ? t.slice(0, n) + `\n[cut here: ${t.length - n} more characters]` : t; };

mkdirSync(join(here, 'raw'), { recursive: true });
mkdirSync(join(here, 'issues'), { recursive: true });
const record = { fetchedAt: new Date().toISOString(), limits: LIMITS, repositories: [] };
const facts = [], ids = [];

for (const [repo, short, issueNumber, prNumber] of KNOWN) {
  const [owner, name] = repo.split('/');
  const issueData = gh([`repos/${repo}/issues/${issueNumber}`]);
  const prData = gh([`repos/${repo}/pulls/${prNumber}`]);
  const prInfo = { number: prNumber, title: prData.title, createdAt: prData.created_at, mergedAt: prData.merged_at, merged: prData.merged };
  const emit = (issue, group, pr) => {
    const id = `${short}-${issue.number}`;
    const comments = gh(['-X', 'GET', `repos/${repo}/issues/${issue.number}/comments`, '-f', 'per_page=100']);
    const files = pr ? gh(['-X', 'GET', `repos/${repo}/pulls/${pr.number}/files`, '-f', 'per_page=100']) : [];
    writeFileSync(join(here, 'raw', `${id}.json`), JSON.stringify({ repo, group, issue, comments, pr: pr || null, files }, null, 2) + '\n');

    const tests = files.filter(f => TEST_PATH.test(f.filename));
    if (pr) facts.push({ id, pr: pr.number, filesChanged: files.length, testFilesAdded: tests.filter(f => f.status === 'added').length, testFilesModified: tests.filter(f => f.status === 'modified').length, testFilesOther: tests.filter(f => !['added', 'modified'].includes(f.status)).length });

    const lines = [`# ${id}`, '', `Repository: ${repo} · Issue #${issue.number} · Group: ${group} · Created: ${issue.created_at}${issue.closed_at ? ` · Closed: ${issue.closed_at}` : ''}`,
      `Labels: ${(issue.labels || []).map(l => l.name).join('; ') || 'none'} · Reporter's role: ${issue.author_association}`, '', `## Title`, '', issue.title, '', '## Body', '', cut(issue.body, LIMITS.body) || '(empty)', ''];
    lines.push(`## Comments (${comments.length}${comments.length > LIMITS.comments ? `; first ${LIMITS.comments} shown` : ''})`, '');
    comments.slice(0, LIMITS.comments).forEach((comment, index) => {
      const when = pr ? (comment.created_at < pr.createdAt ? 'BEFORE the fix was opened' : 'AFTER the fix was opened') : '';
      lines.push(`### Comment ${index + 1} · ${comment.author_association} · ${comment.created_at}${when ? ` · ${when}` : ''}`, '', cut(comment.body, LIMITS.comment), '');
    });
    if (pr) {
      lines.push('## The fix', '', `Pull request #${pr.number}, opened ${pr.createdAt}, merged ${pr.mergedAt}. Title: ${pr.title}`, '', `Files changed (${files.length}):`, ...files.map(f => `- ${f.status}: ${f.filename}${TEST_PATH.test(f.filename) ? '  [test]' : ''}`), '');
      lines.push(`## Test changes in the fix (${tests.length} file${tests.length === 1 ? '' : 's'})`, '');
      if (!tests.length) lines.push('None: the fix changed no file whose path looks like a test.', '');
      let budget = LIMITS.testPatch;
      for (const file of tests) {
        const patch = file.patch || '(no patch text returned)';
        const shown = budget > 0 ? cut(patch, budget) : '[not shown: length budget used up]';
        budget -= Math.min(patch.length, Math.max(budget, 0));
        lines.push(`### ${file.status}: ${file.filename}`, '', '```diff', shown, '```', '');
      }
    }
    writeFileSync(join(here, 'issues', `${id}.md`), lines.join('\n'));
    ids.push({ id, group });
    console.log(`${id} ${group}${pr ? ` pr #${pr.number}` : ''} comments ${comments.length}`);
  };
  emit(issueData, 'known (kitchen R3b-1)', prInfo);
}
writeFileSync(join(here, 'known-facts.json'), JSON.stringify(facts, null, 2) + String.fromCharCode(10));
writeFileSync(join(here, 'known-ids.json'), JSON.stringify(ids, null, 2) + String.fromCharCode(10));
