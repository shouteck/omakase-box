import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
let capture;
let repo;
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (flag === '--capture' && args[i + 1]) capture = args[++i];
  else if (flag === '--repo' && args[i + 1]) repo = args[++i];
  else throw new Error('Usage: node bt10-reader.mjs [--capture FILE] --repo OWNER/REPO');
}
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
if (!repo || !repositoryPattern.test(repo)) throw new Error('--repo must be OWNER/REPO using letters, digits, _, ., and -');

function exactFields(value, fields, name) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${name} must be an object`);
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) throw new Error(`${name} must have exactly these fields: ${fields.join(', ')}`);
}

function readBounty(issue) {
  const body = issue.body;
  if (typeof body !== 'string') throw new Error('Issue body is absent');
  const marker = '<!-- box-bounty-format';
  const count = body.split(marker).length - 1;
  if (!count) return { status: 'legacy-no-block', issue: issue.html_url };
  if (count !== 1) throw new Error('Duplicate format markers');
  const start = body.indexOf(marker) + marker.length;
  const end = body.indexOf('-->', start);
  if (end < 0) throw new Error('Missing final -->');
  if (body.slice(end + 3).trim()) throw new Error('Format block is not at the end of the body');
  const b = JSON.parse(body.slice(start, end).trim());
  exactFields(b, ['schemaVersion', 'kind', 'id', 'repository', 'workCommit', 'branch', 'withChanges', 'createdAt', 'state', 'reward', 'terms'], 'Block');
  if (b.schemaVersion !== 1 || b.kind !== 'box-bounty') throw new Error('Unsupported schemaVersion or kind');
  for (const field of ['id', 'repository', 'workCommit', 'branch', 'createdAt', 'terms']) {
    if (typeof b[field] !== 'string' || !b[field].trim()) throw new Error(`${field} must be a nonempty string`);
  }
  if (!/^bt-[a-f0-9]{12}$/.test(b.id)) throw new Error('id must be bt- followed by 12 lowercase hexadecimal digits');
  if (!repositoryPattern.test(b.repository)) throw new Error('repository must be OWNER/REPO using letters, digits, _, ., and -');
  if (b.branch !== `box-bounty/${b.id}`) throw new Error('branch must be box-bounty/ followed by id');
  if (b.repository.toLowerCase() !== repo.toLowerCase()) throw new Error('Published repository differs from requested repository');
  const expectedRepoUrl = `https://api.github.com/repos/${repo}`;
  if (typeof issue.repository_url !== 'string' || issue.repository_url.toLowerCase() !== expectedRepoUrl.toLowerCase()) throw new Error('Public search repository does not match requested repository');
  if (!/^[a-f0-9]{40}$/.test(b.workCommit)) throw new Error('workCommit must have exactly 40 lowercase hexadecimal digits');
  if (typeof b.withChanges !== 'boolean') throw new Error('withChanges must be boolean');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(b.createdAt) || !Number.isFinite(Date.parse(b.createdAt)) || new Date(b.createdAt).toISOString().slice(0, 19) !== b.createdAt.slice(0, 19)) throw new Error('createdAt must be a valid ISO 8601 UTC timestamp');
  if (!b.state || !['open', 'closed-none', 'closed-merged'].includes(b.state.kind)) throw new Error('Invalid published state');
  exactFields(b.state, b.state.kind === 'closed-merged' ? ['kind', 'pullRequest', 'commit'] : ['kind'], 'state');
  if (b.state.kind === 'closed-merged' && (!Number.isSafeInteger(b.state.pullRequest) || b.state.pullRequest <= 0 || typeof b.state.commit !== 'string' || !/^[a-f0-9]{40}$/.test(b.state.commit))) throw new Error('Merged state needs a positive safe integer pull request number and 40 lowercase hexadecimal commit digits');
  exactFields(b.reward, ['amount', 'currency'], 'reward');
  if (!b.reward || b.reward.amount !== 0 || b.reward.currency !== 'USD') throw new Error('Version 1 accepts only a zero USD reward');
  if (b.terms !== 'merged-solution-earns-whole') throw new Error('Unsupported terms');
  return {
    status: 'parsed', issue: issue.html_url,
    id: b.id, repo: b.repository, workCommit: b.workCommit, branch: b.branch,
    withChanges: b.withChanges, createdAt: b.createdAt, state: b.state,
    reward: b.reward, terms: b.terms,
    ...(issue.state !== 'open' || b.state.kind !== 'open' ? { warning: 'Public issue state or published state is not open' } : {}),
  };
}

async function search() {
  const q = `is:issue is:open label:box-bounty repo:${repo}`;
  const items = [];
  let total = 0;
  let incomplete = false;
  for (let page = 1; page <= 10; page++) {
    const url = new URL('https://api.github.com/search/issues');
    url.searchParams.set('q', q);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'standalone-bt10-public-reader' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Unauthenticated public search failed: HTTP ${response.status} ${await response.text()}`);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('Search response is missing items');
    total = data.total_count;
    incomplete ||= data.incomplete_results === true;
    items.push(...data.items);
    if (data.items.length < 100 || items.length >= total) break;
  }
  return { total_count: total, incomplete_results: incomplete || items.length < total, items };
}

try {
  const data = capture ? JSON.parse(await readFile(capture, 'utf8')) : await search();
  if (!Array.isArray(data.items)) throw new Error('Capture must contain a public search items array');
  const results = data.items.map(issue => {
    try { return readBounty(issue); }
    catch (error) { return { status: 'invalid', issue: issue.html_url, error: error.message }; }
  });
  console.log(JSON.stringify({
    source: capture ? 'offline public search capture' : 'live unauthenticated public GitHub search',
    query: `is:issue is:open label:box-bounty repo:${repo}`,
    totalCount: data.total_count, incompleteResults: data.incomplete_results, results,
    howToAnswer: 'Fork the repository, branch from the published bounty branch, and open a pull request against that branch in the original repository. The poster chooses. A merged solution earns the whole reward; other solutions and parts used by hand earn nothing.',
    limitations: [
      'The issue body is an editable published statement, not proof of merge or payment. Comments are not read.',
      'createdAt uses a calendar UTC timestamp with seconds and Z; the page does not spell out every ISO 8601 variant it intends to allow.',
      'Commit identifier syntax is checked, but branch existence, branch tip equality, commit availability, and withChanges truth are not independently verified.',
      'There is no promise that anyone watches, uses an answer, or pays. Version 1 publishes a zero USD reward.',
    ],
  }, null, 2));
  if (results.some(result => result.status === 'invalid')) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: error.message }));
  process.exitCode = 1;
}
