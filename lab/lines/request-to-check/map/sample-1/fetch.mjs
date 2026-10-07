// Fetches outside sample 1 exactly as PLAN.md declares: per repository, the 5 newest open issues
// and the 5 newest issues closed as completed by a merged pull request. Read-only GitHub API calls
// through the host's `gh`. Writes raw/<id>.json (everything kept), issues/<id>.md (what labellers
// read), facts.json (mechanical facts) and fetch-record.json (queries, time, shortfalls).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPOS = [['axios/axios', 'axios'], ['pallets/click', 'click'], ['spf13/cobra', 'cobra'], ['serde-rs/json', 'serdejson']];
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

for (const [repo, short] of REPOS) {
  const [owner, name] = repo.split('/');
  const openQuery = `repo:${repo} is:issue is:open`;
  const fixedQuery = `repo:${repo} is:issue is:closed reason:completed linked:pr`;
  const open = search(openQuery, PER);
  const pool = search(fixedQuery, FIXED_POOL);
  const fixed = [];
  for (const issue of pool) {
    if (fixed.length === PER) break;
    const merged = closers(owner, name, issue.number).filter(pr => pr.merged);
    if (merged.length) fixed.push({ issue, pr: merged[0] });
  }
  record.repositories.push({ repo, openQuery, fixedQuery, open: open.map(i => i.number), fixedPool: pool.map(i => i.number), fixed: fixed.map(f => ({ issue: f.issue.number, pr: f.pr.number })), shortfall: PER - fixed.length });

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
  open.forEach(issue => emit(issue, 'open', null));
  fixed.forEach(({ issue, pr }) => emit(issue, 'fixed', pr));
}
writeFileSync(join(here, 'fetch-record.json'), JSON.stringify(record, null, 2) + '\n');
writeFileSync(join(here, 'facts.json'), JSON.stringify(facts, null, 2) + '\n');
writeFileSync(join(here, 'issue-ids.json'), JSON.stringify(ids, null, 2) + '\n');
