#!/usr/bin/env node
// The stand-in GitHub for the bt11b replay — a `gh` program backed by one
// JSON file, answering each request the tool makes the way real GitHub does:
// one object for a single thing, a list for a collection, `page` selecting
// the page (never the number inside `per_page`), lists filtered by their
// query, and pull requests sharing the issues' number sequence.
// tests/kitchen/k19-github-standin.test.ts pins every behaviour below
// against kitchen/demo/bt11b-real-transcript.txt.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const statePath = process.env.REPLAY_STATE;
const bare = process.env.REPLAY_BARE;
const actor = process.env.REPLAY_ACTOR || 'owner';
const load = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
const save = state => {
  const next = statePath + '.next';
  fs.writeFileSync(next, JSON.stringify(state, null, 2));
  fs.renameSync(next, statePath);
};
const git = (...args) => spawnSync('git', ['-C', bare, ...args], { encoding: 'utf8' });
const now = () => new Date().toISOString();
const args = process.argv.slice(2);
const fail = () => { console.error('gh: not found'); process.exit(1); };
if (args[0] === 'version') { console.log('gh version 2.74.0 (2025-01-01)'); process.exit(0); }
if (args[0] === 'auth' && args[1] === 'status') { console.log('github.com\n  Logged in to github.com account ' + actor); process.exit(0); }
if (args[0] !== 'api') fail();
const endpoint = args.find((a, i) => i > 0 && !a.startsWith('-') && args[i - 1] !== '--hostname' && args[i - 1] !== '--input' && args[i - 1] !== '--method');
const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
const input = args.includes('--input') ? JSON.parse(fs.readFileSync(args[args.indexOf('--input') + 1], 'utf8')) : null;
const state = load();
const emit = value => { console.log(JSON.stringify(value)); process.exit(0); };
// Query parameters are read as parameters. `per_page` is a page size and
// `page` is which page — reading the page out of `per_page=100` was the K18
// fault that emptied every paged list.
const query = new URLSearchParams(endpoint.split('?')[1] ?? '');
const page = Math.max(1, Number(query.get('page') ?? 1) || 1);
const perPage = Math.min(100, Math.max(1, Number(query.get('per_page') ?? 30) || 30));
const pageOf = rows => rows.slice((page - 1) * perPage, page * perPage);
// Issues and pull requests share one number sequence on GitHub — after issue
// #1 the first pull request is #2.
const nextNumber = () => 1 + Math.max(0, ...state.issues.map(issue => issue.number), ...state.prs.map(pr => pr.number));
if (endpoint === 'user') emit({ login: actor });
if (endpoint === 'repos/owner/project') emit({ full_name: 'owner/project', private: false, visibility: 'public', permissions: { push: true }, default_branch: 'main', html_url: 'https://github.com/owner/project' });
if (endpoint === 'graphql') {
  if ((input.query || '').includes('markPullRequestReadyForReview')) {
    const pr = state.prs.find(pr => pr.head.ref && input.variables.id === `PR_${pr.number}`);
    if (!pr || pr.user.login !== actor || pr.state !== 'open') fail();
    pr.draft = false;
    if (typeof input.variables.body === 'string') pr.body = input.variables.body;
    pr.updated_at = now();
    save(state);
    emit({ data: { ready: { pullRequest: { isDraft: false } } } });
  }
  if ((input.query || '').includes('pullRequest')) {
    const pr = state.prs.find(pr => pr.number === input.variables.number);
    if (!pr) fail();
    if (pr.head.ref && input.query.includes('headRefName')) {
      syncPull(pr);
      const connection = { totalCount: 0, nodes: [] };
      emit({ data: { repository: { pullRequest: {
        id: `PR_${pr.number}`, isDraft: pr.draft, state: pr.merged ? 'MERGED' : pr.state.toUpperCase(), merged: pr.merged === true,
        mergedAt: pr.merged_at ?? null, baseRefName: pr.base.ref, headRefName: pr.head.ref, author: pr.user, body: pr.body,
        changedFiles: filesOf(pr).length, comments: connection, reviews: connection
      } } } });
    }
    emit({ data: { repository: { pullRequest: { body: pr.body ?? '', userContentEdits: { nodes: pr.editedBy ? [{ editor: { login: pr.editedBy } }] : [] } } } } });
  }
  const issue = state.issues.find(issue => issue.number === input.variables.number);
  if (!issue) fail();
  const offset = input.variables.after ? Number(input.variables.after) : 0;
  const own = state.comments.filter(comment => comment.issue === undefined || comment.issue === issue.number);
  const slice = own.slice(offset, offset + 100).map((comment, index) => ({ cursor: String(offset + index + 1), node: { body: comment.body, author: comment.user } }));
  emit({ data: { repository: { issue: { body: issue.body, author: { login: 'owner' }, comments: { edges: slice, pageInfo: { hasNextPage: offset + 100 < own.length } } } } } });
}
const match = /^repos\/owner\/project\/([^?]+?)(?:\?|$)/.exec(endpoint);
const rest = match ? match[1] : '';
if (rest === 'issues' && method === 'POST') {
  const number = nextNumber();
  const issue = { number, html_url: 'https://github.com/owner/project/issues/' + number, title: input.title, body: input.body, state: 'open', labels: (input.labels || []).map(name => ({ name })), user: { login: 'owner' } };
  state.issues.push(issue); save(state); emit(issue);
}
if (/^issues\/\d+\/comments$/.test(rest)) {
  const n = Number(rest.split('/')[1]);
  if (!state.issues.some(issue => issue.number === n)) fail();
  // The stored comment keeps its issue number; the answer carries GitHub's
  // issue_url instead, never a bare `issue` key.
  const wire = ({ issue, ...comment }) => ({ ...comment, issue_url: 'https://api.github.com/repos/owner/project/issues/' + n });
  if (method === 'POST') {
    const comment = { issue: n, body: input.body, user: { login: 'owner' }, created_at: new Date().toISOString(), html_url: 'https://github.com/owner/project/issues/' + n + '#comment-' + (state.comments.length + 1) };
    state.comments.push(comment); save(state); emit(wire(comment));
  }
  emit(pageOf(state.comments.filter(comment => comment.issue === undefined || comment.issue === n).map(wire)));
}
if (/^issues\/\d+$/.test(rest)) {
  const n = Number(rest.split('/')[1]);
  const issue = state.issues.find(issue => issue.number === n);
  if (!issue) fail();
  if (method === 'PATCH' && input) {
    if (input.state) {
      issue.state = input.state;
      if (process.env.REPLAY_ACTOR) issue.closed_at = input.state === 'closed' ? now() : null;
    }
    if (typeof input.body === 'string') issue.body = input.body;
    save(state);
  }
  // A single issue answers as one object — never the list (the other K18 fault).
  emit(issue);
}
if (rest === 'issues' && method === 'GET') {
  const label = query.get('labels');
  const wanted = query.get('state') ?? 'open';
  const rows = state.issues.filter(issue => (wanted === 'all' || issue.state === wanted) && (!label || (issue.labels || []).some(entry => entry.name === label)));
  emit(pageOf(rows));
}
if (rest === 'labels/box-bounty' && method === 'GET') { if (state.labels.some(label => label.name === 'box-bounty')) emit({ name: 'box-bounty' }); fail(); }
if (rest === 'labels' && method === 'POST') { state.labels.push({ name: input.name }); save(state); emit({ name: input.name }); }
function syncPull(pr) {
  if (pr.head.ref && pr.state === 'open') {
    const head = git('rev-parse', '--verify', 'refs/heads/' + pr.head.ref).stdout.trim();
    if (head && head !== pr.head.sha) {
      if (git('update-ref', 'refs/pull/' + pr.number + '/head', head).status !== 0) fail();
      pr.head.sha = head;
      pr.updated_at = now();
      save(state);
    }
  }
  // GitHub's rule (BT51): marked merged when its head reaches its base branch; the mark stays.
  if (pr.merged !== true && git('merge-base', '--is-ancestor', pr.head.sha, 'refs/heads/' + pr.base.ref).status === 0) {
    pr.merged = true; pr.merged_at = now(); pr.state = 'closed'; save(state);
  }
}
function filesOf(pr) {
  return git('diff', '--name-only', pr.base.ref, pr.head.sha).stdout.trim().split('\n').filter(Boolean).map(filename => ({ filename }));
}
if (/^pulls\/\d+$/.test(rest)) {
  const pr = state.prs.find(pr => pr.number === Number(rest.split('/')[1]));
  if (!pr) fail();
  syncPull(pr);
  emit({ merged: false, merged_at: null, created_at: '2020-01-01T00:00:00Z', ...pr });
}
if (/^pulls\/\d+\/files$/.test(rest)) {
  const pr = state.prs.find(pr => pr.number === Number(rest.split('/')[1]));
  if (!pr) fail();
  emit(pageOf(filesOf(pr)));
}
if (rest === 'pulls' && method === 'GET') {
  const wanted = query.get('state') ?? 'open';
  const base = query.get('base');
  emit(pageOf(state.prs.filter(pr => (wanted === 'all' || (pr.state ?? 'open') === wanted) && (!base || pr.base.ref === base))));
}
// compare/<base>...<head> (BT67's first-sight read): 'behind' when the head is already on the base, else 'ahead'.
if (/^compare\/[^/]+\.\.\.[a-f\d]{40}$/.test(rest) && method === 'GET') {
  const [base, head] = rest.slice('compare/'.length).split('...');
  emit({ status: spawnSync('git', ['-C', bare, 'merge-base', '--is-ancestor', head, 'refs/heads/' + decodeURIComponent(base)]).status === 0 ? 'behind' : 'ahead' });
}
if (rest === 'pulls' && method === 'POST') {
  const number = nextNumber();
  const ref = `refs/pull/${number}/head`;
  const head = typeof input.head === 'string' ? input.head : null;
  const sha = git('rev-parse', '--verify', head === null ? ref : 'refs/heads/' + head).stdout.trim();
  if (head !== null && (!sha || git('update-ref', ref, sha).status !== 0)) fail();
  const pr = { number, html_url: 'https://github.com/owner/project/pull/' + number, title: input.title, body: input.body, user: { login: input.author || (head === null ? 'solver' : actor) }, base: { ref: input.base, repo: { full_name: 'owner/project' } }, head: { sha }, state: 'open', draft: input.draft === true };
  if (head !== null) {
    pr.head.ref = head;
    pr.created_at = pr.updated_at = now();
  }
  state.prs.push(pr); save(state); emit(pr);
}
fail();
