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
const load = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
const save = state => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const args = process.argv.slice(2);
const fail = () => { console.error('gh: not found'); process.exit(1); };
if (args[0] === 'version') { console.log('gh version 2.74.0 (2025-01-01)'); process.exit(0); }
if (args[0] === 'auth' && args[1] === 'status') { console.log('github.com\n  Logged in to github.com account owner'); process.exit(0); }
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
if (endpoint === 'user') emit({ login: 'owner' });
if (endpoint === 'repos/owner/project') emit({ full_name: 'owner/project', private: false, visibility: 'public', permissions: { push: true }, html_url: 'https://github.com/owner/project' });
if (endpoint === 'graphql') {
  if ((input.query || '').includes('pullRequest')) {
    const pr = state.prs.find(pr => pr.number === input.variables.number);
    if (!pr) fail();
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
  if (method === 'POST') {
    const comment = { issue: n, body: input.body, user: { login: 'owner' }, created_at: new Date().toISOString(), html_url: 'https://github.com/owner/project/issues/' + n + '#comment-' + (state.comments.length + 1) };
    state.comments.push(comment); save(state); emit(comment);
  }
  emit(pageOf(state.comments.filter(comment => comment.issue === undefined || comment.issue === n)));
}
if (/^issues\/\d+$/.test(rest)) {
  const n = Number(rest.split('/')[1]);
  const issue = state.issues.find(issue => issue.number === n);
  if (!issue) fail();
  if (method === 'PATCH' && input) {
    if (input.state) issue.state = input.state;
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
if (/^pulls\/\d+$/.test(rest)) {
  const pr = state.prs.find(pr => pr.number === Number(rest.split('/')[1]));
  if (!pr) fail(); emit(pr);
}
if (/^pulls\/\d+\/files$/.test(rest)) {
  const pr = state.prs.find(pr => pr.number === Number(rest.split('/')[1]));
  if (!pr) fail();
  const base = spawnSync('git', ['-C', bare, 'diff', '--name-only', pr.base.ref, pr.head.sha], { encoding: 'utf8' });
  emit(pageOf(base.stdout.trim().split('\n').filter(Boolean).map(filename => ({ filename }))));
}
if (rest === 'pulls' && method === 'GET') {
  const wanted = query.get('state') ?? 'open';
  const base = query.get('base');
  emit(pageOf(state.prs.filter(pr => (wanted === 'all' || (pr.state ?? 'open') === wanted) && (!base || pr.base.ref === base))));
}
if (rest === 'pulls' && method === 'POST') {
  const number = nextNumber();
  const sha = spawnSync('git', ['-C', bare, 'rev-parse', 'refs/pull/' + number + '/head'], { encoding: 'utf8' }).stdout.trim();
  const pr = { number, html_url: 'https://github.com/owner/project/pull/' + number, title: input.title, body: input.body, user: { login: input.author || 'solver' }, base: { ref: input.base, repo: { full_name: 'owner/project' } }, head: { sha }, state: 'open' };
  state.prs.push(pr); save(state); emit(pr);
}
fail();
