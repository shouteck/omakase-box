// K28 prototype measurement — step 4 of waves/K28.md.
// Builds a scratch bare remote + two clones under --out (default
// %TEMP%\kitchen-K28-measure), seeds 1,000 bounty chains of 5 events, and
// measures: single-event push/fetch, first fetch of 1,000 chains, repo size,
// concurrent append + merge, remote-ref deletion + restore, default-clone
// contents, and default-branch visibility. Prints raw numbers + spread.
// Refuses a nonempty --out that lacks the .kitchen-K28-owned marker.
// Rerun: node kitchen/memory/delegation/measure.mjs [--out <dir>]

import { mkdtempSync, mkdirSync, existsSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { git, append, fetchChains, pushChains, events, ids, seed, NS } from './chain.mjs';

const out = (() => {
  const i = process.argv.indexOf('--out');
  if (i >= 0) return resolve(process.argv[i + 1]);
  return join(mkdtempSync(join(tmpdir(), 'kitchen-K28-measure-')), 'run');
})();
if (existsSync(out) && readdirSync(out).length > 0 && !existsSync(join(out, '.kitchen-K28-owned'))) {
  console.error(`refusing: ${out} is nonempty and was not created by this script (no .kitchen-K28-owned marker)`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, '.kitchen-K28-owned'), new Date().toISOString());
console.log(`scratch: ${out}`);

const ms = fn => { const t = performance.now(); const r = fn(); return { ms: Math.round(performance.now() - t), r }; };
const dirSize = p => { const r = spawnSync('git', ['-c','safe.directory='+p.split(String.fromCharCode(92)).join('/'),'-C',p,'count-objects','-vH'],{encoding:'utf8'}); return r.stdout; };

const remote = join(out, 'remote.git');
git(out, ['init', '--bare', remote]);
const cloneA = join(out, 'clone-a'), cloneB = join(out, 'clone-b'), cloneC = join(out, 'clone-c-default');
git(out, ['clone', remote, cloneA]);
git(out, ['clone', remote, cloneB]);
// minimal history on the default branch so clones exist meaningfully
writeFileSync(join(cloneA, 'README.md'), '# scratch project\n');
git(cloneA, ['add', 'README.md']);
git(cloneA, ['-c','user.name=proto','-c','user.email=proto@k28','commit','-m','init']);
git(cloneA, ['push','origin','HEAD:refs/heads/master']);
git(cloneB, ['pull']);
const event = f => { writeFileSync(f, JSON.stringify({ type: 'solution-arrived', bounty: 'bt-0001', attempt: 1, author: 'solver-a', at: '2026-10-17T10:00:00Z' })); return f; };

const report = [];
const rec = (name, value, note='') => { report.push({name, value, note}); console.log(`${name}: ${value}${note?`  (${note})`:''}`); };

// --- single event push/fetch, 5 runs each ---
append(cloneA, 'bt-0001', { type: 'posted', bounty: 'bt-0001', at: '2026-10-17T09:00:00Z' });
const pushTimes = [], fetchTimes = [];
for (let i = 0; i < 5; i++) {
  append(cloneA, 'bt-0001', { type: 'note', n: i, at: '2026-10-17T09:0'+i+'Z' });
  pushTimes.push(ms(() => pushChains(cloneA, 'bt-0001')).ms);
  fetchTimes.push(ms(() => fetchChains(cloneB)).ms);
}
rec('push-one-event ms (5 runs)', pushTimes.join(', '), `spread ${Math.min(...pushTimes)}-${Math.max(...pushTimes)}`);
rec('fetch-one-event ms (5 runs)', fetchTimes.join(', '), `spread ${Math.min(...fetchTimes)}-${Math.max(...fetchTimes)}`);

// --- 1,000 chains x 5 events ---
const seedT = ms(() => seed(cloneA, 1000, 5));
rec('seed-1000x5 s', (seedT.ms/1000).toFixed(1));
const bigPush = ms(() => pushChains(cloneA));
rec('push-1000-chains ms', bigPush.ms);
const sizeRemote = dirSize(remote);
rec('remote size after 1000x5', sizeRemote.split('\n').filter(l=>/size-pack|size:|count/.test(l)).join(' | '));
const firstFetch = ms(() => fetchChains(cloneB));
rec('first-fetch-1000-chains ms', firstFetch.ms);
const sizeB = dirSize(cloneB);
rec('clone-b size after fetch', sizeB.split('\n').filter(l=>/size-pack/.test(l)).join(' | '));

// --- concurrent append, merge ---
append(cloneA, 'bt-0001', { type: 'question', author: 'agent-A', text: 'from A', at: '2026-10-17T11:00:00Z' });
append(cloneB, 'bt-0001', { type: 'solution-arrived', author: 'agent-B', text: 'from B', at: '2026-10-17T11:01:00Z' });
pushChains(cloneB, 'bt-0001');
const rejected = pushChains(cloneA, 'bt-0001');
rec('concurrent second push rejected', !rejected.ok, rejected.ok ? '' : 'non-fast-forward');
const acts = fetchChains(cloneA);
rec('clone-a merge action for bt-0001', acts['bt-0001']);
const pushRetry = ms(() => pushChains(cloneA, 'bt-0001'));
rec('merge+retry push ms', pushRetry.ms, `ok=${pushRetry.r.ok}`);
const evA = events(cloneA, 'bt-0001');
fetchChains(cloneB);
const evB = events(cloneB, 'bt-0001');
const textsA = new Set(evA.map(e => e.text || e.type));
rec('concurrent merge: events in A', evA.length, `in B ${evB.length}; both A and B events present: ${[...textsA].includes('from A') && evA.some(e=>e.text==='from B')}`);

// --- deleted remote ref restored from a clone ---
git(remote, ['update-ref','-d', `${NS}/bt-0001`]);
const remoteHas = git(remote, ['for-each-ref', NS]);
rec('remote ref deleted (namespace count after)', remoteHas === '' ? '0' : remoteHas.split('\n').length);
const restore = ms(() => pushChains(cloneA, 'bt-0001'));
rec('restore push ok', restore.r.ok === true, `${restore.ms} ms`);

// --- default clone does not download chains ---
// --no-local: a plain `git clone <local-path>` hardlinks .git/objects, which
// would falsely report the chains' bytes as "downloaded". --no-local forces
// the real pack-negotiation path a network clone uses.
git(out, ['clone', '--no-local', remote, cloneC]);
const cRefs = git(cloneC, ['for-each-ref', '--format=%(refname)']);
rec('default clone refs', cRefs.split('\n').join(' '), 'note: no refs/box-bounty/*, no refs/remotes/origin/box-bounty/*');
const cHasBounty = cRefs.includes('box-bounty');
rec('default clone sees chains', cHasBounty);
const cSize = git(cloneC, ['count-objects','-vH']).split('\n').filter(l=>/size-pack|in-pack/.test(l)).join(' | ');
rec('default clone pack', cSize, 'compare with clone-b above: what a default clone downloads');

// --- default branch visibility ---
const grep = spawnSync('git',['-c','safe.directory='+cloneC.split(String.fromCharCode(92)).join('/'),'-C',cloneC,'grep','-l','bt-0001','--','*'],{encoding:'utf8'});
const rg = spawnSync('rg',['-l','bt-0001',cloneC],{encoding:'utf8'});
const logp = git(cloneC, ['log','-p','--all-match','master'],{allowFail:true});
rec('git grep on default clone finds chain data', (grep.stdout||'').trim() !== '');
rec('ripgrep on default clone finds chain data', (rg.stdout||'').trim() !== '');
rec('git log -p master mentions any bounty id', /bt-\d{4}/.test(logp.stdout||''));
const lsRemote = git(cloneC, ['ls-remote','origin']).split('\n').filter(l=>l.includes('box-bounty')).length;
rec('ls-remote shows chain refs', lsRemote, 'they exist on the remote; a default clone just does not fetch them');

writeFileSync(join(out, 'measure-report.json'), JSON.stringify({ at: new Date().toISOString(), node: process.version, report }, null, 2));
console.log(`\nreport written: ${join(out, 'measure-report.json')}`);
console.log(`scratch left at ${out} (kitchen-K28 owned; remove at wave close)`);
