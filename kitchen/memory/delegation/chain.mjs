// K28 prototype — delegation-record event chains on custom git refs.
// Plain git plumbing, no dependencies. NOT product code.
//
// Shape (after git-bug's DAG-entity spec, https://github.com/git-bug/spec):
//   one ref per bounty: refs/box-bounty/<id>
//   each event = one commit whose tree holds a single blob `ops`
//   (a JSON object {v, author, ops:[event,...]}); the commit's parent is the
//   previous tip; a merge commit joins two diverged tips and carries ops:[].
//   Remote-tracking copies land in refs/remotes/origin/box-bounty/<id>.
//
// Usage:
//   node chain.mjs append <repo> <id> <event-json-file>
//   node chain.mjs fetch  <repo>            # fetch + merge all chains from origin
//   node chain.mjs push   <repo> [id]       # push all chains (or one), ff-only
//   node chain.mjs merge  <repo> <id>       # merge remote-tracking tip into local
//   node chain.mjs events <repo> [id]       # print every chain's events as JSONL
//   node chain.mjs ids    <repo>            # list local bounty ids with chains
//   node chain.mjs seed   <repo> <n> <k>    # n chains x k events via fast-import
//
// Every git call carries -c safe.directory for the kitchen checkout and the
// scratch repo (owner rule; scratch repos live in %TEMP%\kitchen-K28-*).

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAIN = 'C:/Users/shout/Desktop/Projects/private-task-mvp';
export const NS = 'refs/box-bounty';
const RT = 'refs/remotes/origin/box-bounty';

export function git(repo, args, opts = {}) {
  const r = spawnSync('git', [
    '-c', `safe.directory=${MAIN}`,
    '-c', `safe.directory=${repo.split(String.fromCharCode(92)).join('/')}`,
    ...args
  ], { cwd: repo, encoding: 'utf8', ...opts });
  if (opts.allowFail) return r;
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${repo}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const ref = id => `${NS}/${id}`;
const rtRef = id => `${RT}/${id}`;

function tip(repo, r) {
  const out = git(repo, ['rev-parse', '-q', '--verify', r], { allowFail: true });
  return out.status === 0 ? out.stdout.trim() : null;
}

// Write one commit: tree = {ops: <blob>}, parents given; update ref.
function commitEvent(repo, r, opsJson, parents, author) {
  const blob = git(repo, ['hash-object', '-w', '--stdin'], { input: opsJson });
  const tree = git(repo, ['mktree'], { input: `100644 blob ${blob}\tops\n` });
  const args = ['commit-tree', tree, '-m', `box-bounty chain event`];
  for (const p of parents) args.push('-p', p);
  const commit = git(repo, args, {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: `${author}@k28-prototype`,
      GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: `${author}@k28-prototype`,
    }
  });
  git(repo, ['update-ref', r, commit]);
  return commit;
}

export function append(repo, id, eventObj) {
  const r = ref(id);
  const parent = tip(repo, r);
  const who = eventObj.author ?? eventObj.actor ?? 'prototype';
  const ops = JSON.stringify({ v: 1, author: who, ops: [eventObj] }) + '\n';
  return commitEvent(repo, r, ops, parent ? [parent] : [], who);
}

// git-bug §10 five-scenario merge of refs/remotes/origin/box-bounty/<id> into
// refs/box-bounty/<id>. Returns 'new'|'identical'|'ahead'|'ff'|'merged'|'none'.
export function mergeOne(repo, id) {
  const local = tip(repo, ref(id));
  const remote = tip(repo, rtRef(id));
  if (!remote) return 'none';
  if (!local) { git(repo, ['update-ref', ref(id), remote]); return 'new'; }
  if (local === remote) return 'identical';
  const remoteIsAncestor = git(repo, ['merge-base', '--is-ancestor', remote, local], { allowFail: true }).status === 0;
  if (remoteIsAncestor) return 'ahead';
  const localIsAncestor = git(repo, ['merge-base', '--is-ancestor', local, remote], { allowFail: true }).status === 0;
  if (localIsAncestor) { git(repo, ['update-ref', ref(id), remote]); return 'ff'; }
  commitEvent(repo, ref(id), JSON.stringify({ v: 1, author: 'prototype-merge', ops: [] }) + '\n', [local, remote], 'prototype-merge');
  return 'merged';
}

export function fetchChains(repo) {
  git(repo, ['fetch', 'origin', `+${NS}/*:${RT}/*`, '--no-tags']);
  // One for-each-ref per side: every ref wholly new locally is adopted in a
  // single update-ref --stdin batch (git-bug scenarios 1 and 2 merged).
  const remoteLines = git(repo, ['for-each-ref', '--format=%(refname) %(objectname)', RT]).split('\n').filter(Boolean);
  const local = new Map(git(repo, ['for-each-ref', '--format=%(refname) %(objectname)', NS]).split('\n').filter(Boolean)
    .map(line => { const [r, sha] = line.split(' '); return [r.slice(`${NS}/`.length), sha]; }));
  const actions = {};
  const adopt = [];
  for (const line of remoteLines) {
    const [r, sha] = line.split(' ');
    const id = r.slice(`${RT}/`.length);
    const lsha = local.get(id);
    if (lsha === undefined) { adopt.push(`update ${ref(id)} ${sha}`); actions[id] = 'new'; }
    else if (lsha === sha) actions[id] = 'identical';
    else actions[id] = mergeOne(repo, id); // diverged or ff — resolved per ref
  }
  if (adopt.length) git(repo, ['update-ref', '--stdin'], { input: adopt.join('\n') + '\n' });
  return actions;
}

export function pushChains(repo, id) {
  const spec = id ? `${ref(id)}:${ref(id)}` : `${NS}/*:${NS}/*`;
  const out = git(repo, ['push', 'origin', spec], { allowFail: true });
  if (out.status !== 0) return { ok: false, stderr: (out.stderr || '') + (out.stdout || '') };
  return { ok: true };
}

export function ids(repo) {
  const out = git(repo, ['for-each-ref', '--format=%(refname)', NS]);
  return out.split('\n').filter(Boolean).map(r => r.slice(`${NS}/`.length)).sort();
}

// All events of one chain: every commit's ops blob, topological order.
export function events(repo, id) {
  const t = tip(repo, ref(id));
  if (!t) return [];
  const commits = git(repo, ['rev-list', '--topo-order', t]).split('\n').filter(Boolean);
  const out = [];
  for (const c of commits) {
    const raw = git(repo, ['cat-file', 'blob', `${c}:ops`]);
    const pack = JSON.parse(raw);
    for (const op of pack.ops) out.push({ commit: c, author: pack.author, ...op });
  }
  return out;
}

// Fast seed: n chains of k events each via one fast-import on temp heads,
// then update-ref into the namespace and delete the temp heads.
export function seed(repo, n, k) {
  const marks = [];
  const lines = [];
  for (let i = 1; i <= n; i++) {
    const id = `bt-${String(i).padStart(4, '0')}`;
    lines.push(`reset refs/heads/k28-tmp-${id}`);
    for (let e = 1; e <= k; e++) {
      lines.push(`commit refs/heads/k28-tmp-${id}`);
      lines.push(`mark :${i * 100000 + e}`);
      lines.push(`committer Prototype <prototype@k28> 1761000000 +0000`);
      const msg = `chain event ${e} of ${id}`;
      lines.push(`data ${msg.length}`, msg);
      const payload = JSON.stringify({ v: 1, author: 'prototype', ops: [{ type: 'seeded', bounty: id, n: e, why: `seeded event ${e} for ${id}`, at: '2026-10-17T00:00:00Z' }] }) + '\n';
      lines.push(`M 644 inline ops`, `data ${Buffer.byteLength(payload)}`, payload);
    }
    marks.push(id);
  }
  git(repo, ['fast-import', '--quiet'], { input: lines.join('\n') + '\n' });
  const updates = marks.map(id => `update ${ref(id)} refs/heads/k28-tmp-${id}\ndelete refs/heads/k28-tmp-${id}`).join('\n') + '\n';
  git(repo, ['update-ref', '--stdin'], { input: updates });
  return marks;
}

const [, , cmd, ...a] = process.argv;
if (cmd === 'append') console.log(append(a[0], a[1], JSON.parse(readFileSync(a[2], 'utf8'))));
else if (cmd === 'fetch') console.log(JSON.stringify(fetchChains(a[0])));
else if (cmd === 'push') { const r = pushChains(a[0], a[1]); if (!r.ok) { console.error(r.stderr); process.exit(1); } }
else if (cmd === 'merge') console.log(mergeOne(a[0], a[1]));
else if (cmd === 'ids') console.log(ids(a[0]).join('\n'));
else if (cmd === 'events') { const ids2 = a[1] ? [a[1]] : ids(a[0]); for (const id of ids2) for (const e of events(a[0], id)) console.log(JSON.stringify({ id, ...e })); }
else if (cmd === 'seed') { const m = seed(a[0], Number(a[1]), Number(a[2])); console.log(`seeded ${m.length} chains`); }
else if (cmd) { console.error(`unknown command ${cmd}`); process.exit(2); }
