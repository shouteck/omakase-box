// BT32 measurement — K28's step-4 numbers rerun against the REAL
// implementation (packages/box-bounty/chain.ts), not the prototype.
//
//   1. Bundles the production package once with vite (ssr) so the script
//      runs the shipping code, not a re-keyed copy.
//   2. Scratch bare remote + clones under --out. The clones name origin
//      exactly as a real github.com checkout does; the remote argument the
//      product passes to git is swapped to the bare path at the spawnSync
//      boundary (the same substitution the test stand-in performs — a
//      url.insteadOf rewrite is itself a product refusal). No global
//      config is touched.
//   3. Measures through production appendEvent/pushChain/syncChains:
//      one-event append+push and fetch+import (5 runs each; K28: ~0.3 s /
//      ~0.5 s), first fetch+import of N chains (K28: 3-6 s at N=1000),
//      remote pack size (K28: 1.54 MiB), concurrent-append merge+retry,
//      remote-ref deletion restored with CONTENT compared, default-clone
//      cleanliness, and K14 fetch/push counts per command via GIT_TRACE.
//      Every git subprocess carries `-c safe.directory=<repo>`.
//   4. Prints raw numbers with PASS/OVER against twice K28's numbers and
//      writes measure-report.json inside --out.
//
//   node kitchen/memory/delegation/bt32-measure.mjs [--out <dir>] [--chains 1000]
// Refuses a nonempty --out without the .kitchen-BT32-owned marker.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BS = String.fromCharCode(92);
const slash = p => p.split(BS).join('/');
const REPO = slash(fileURLToPath(new URL('../../..', import.meta.url)).replace(/[\/]+$/, ''));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const out = resolve(arg('--out', join(mkdtempSync(join(tmpdir(), 'kitchen-BT32-measure-')), 'run')));
const CHAINS = Number(arg('--chains', '1000'));
if (existsSync(out) && readdirSync(out).length > 0 && !existsSync(join(out, '.kitchen-BT32-owned'))) {
  console.error(`refusing: ${out} is nonempty and was not created by this script (no .kitchen-BT32-owned marker)`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, '.kitchen-BT32-owned'), new Date().toISOString());
console.log(`scratch: ${out}`);

// The clones' origin carries the real github.com URL, exactly as a real
// checkout does — the product REJECTS url.insteadOf rewrites of a GitHub
// address (github-remote-mismatch), so the stand-in substitutes at the
// spawn boundary, like the test fixture's GH_PRELOAD: every product
// spawnSync sees its remote argument swapped to the local bare remote.
// Nothing in config or state ever shows the rewrite. This must be installed
// BEFORE the production bundle is imported, on the CJS exports object plus
// syncBuiltinESMExports — the ESM namespace is read-only.
// gitc() runs git via execFileSync and is deliberately NOT patched —
// script-side git calls always name the bare remote by path, never 'origin'.
const named = 'https://github.com/owner/project.git';
const remote = join(out, 'remote.git');
{
  const req = (await import('node:module')).createRequire(import.meta.url);
  const cpMod = req('node:child_process');
  const realSpawn = cpMod.spawnSync;
  cpMod.spawnSync = function (program, args, options) {
    if (/(^|[\\/])git(?:\.exe)?$/i.test(program ?? '') && Array.isArray(args)) {
      args = args.map(arg => arg === named ? remote : arg);
    }
    return realSpawn.call(this, program, args, options);
  };
  req('node:module').syncBuiltinESMExports();
}

// --- bundle the production package ------------------------------------------
const entry = join(out, 'entry.ts');
writeFileSync(entry, `export * from '${REPO}/packages/box-bounty/index.ts';\n`);
const viteOut = join(out, 'bundle');
const vite = spawnSync(process.execPath, [join(REPO, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--ssr', entry, '--outDir', viteOut, '--emptyOutDir', '--logLevel', 'warn'], { encoding: 'utf8', cwd: REPO });
if (vite.status !== 0) { console.error(vite.stdout, vite.stderr); process.exit(1); }
const bundleFile = join(viteOut, 'entry.js');
const product = await import(pathToFileURL(bundleFile).href);
const { appendEvent, pushChain, syncChains, sharedRead } = product;
console.log(`product bundle: ${bundleFile}`);

// --- scratch remote + clones --------------------------------------------------
const gitc = (repo, args, opts = {}) =>
  execFileSync('git', ['-c', `safe.directory=${slash(repo)}`, ...(opts.c === false ? [] : ['-C', repo]), ...args], { encoding: 'utf8', input: opts.input }).trim();
mkdirSync(remote);
gitc(remote, ['init', '--bare']);
const cloneA = join(out, 'clone-a'), cloneB = join(out, 'clone-b'), cloneC = join(out, 'clone-c-default'), cloneD = join(out, 'clone-d-first');
gitc(out, ['clone', remote, cloneA]);
gitc(out, ['clone', remote, cloneB]);
writeFileSync(join(cloneA, 'README.md'), '# scratch project\n');
gitc(cloneA, ['add', 'README.md']);
gitc(cloneA, ['-c', 'user.name=m', '-c', 'user.email=m@m', 'commit', '-m', 'init']);
gitc(cloneA, ['push', 'origin', 'HEAD:refs/heads/main']);
gitc(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
// cloneB predates main: fetch it and check it out instead of pulling an
// unborn default branch.
gitc(cloneB, ['fetch', 'origin']);
gitc(cloneB, ['checkout', '-b', 'main', 'origin/main']);
for (const clone of [cloneA, cloneB]) {
  gitc(clone, ['remote', 'set-url', 'origin', named]);
}
process.env.BOX_BOUNTY_SETTINGS_DIR = join(out, 'settings');
mkdirSync(process.env.BOX_BOUNTY_SETTINGS_DIR, { recursive: true });
writeFileSync(join(process.env.BOX_BOUNTY_SETTINGS_DIR, 'settings.json'),
  JSON.stringify({ kind: 'box-owner-settings', default: { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [] }, projects: {}, repositories: { 'owner/project': { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [] } } }) + '\n');

const ms = fn => { const t = performance.now(); const r = fn(); return { ms: Math.round(performance.now() - t), r }; };
const ID = 'bt-aa55aa55aa55';
const event = (type, extra = {}) => ({ v: 1, type, at: '2026-10-18T00:00:00.000Z', actor: 'owner', ...extra });
const report = [];
const rec = (name, value, bar, pass) => {
  report.push({ name, value, k28bar: bar, withinTwice: pass });
  console.log(`${name}: ${value}   [K28 bar: ${bar}]${pass === undefined ? '' : pass ? '  PASS' : '  OVER'}`);
};
const eventsOf = (repo, ref) =>
  gitc(repo, ['rev-list', '--topo-order', ref]).split('\n').filter(s => s !== '')
    .map(sha => JSON.parse(gitc(repo, ['cat-file', 'blob', `${sha}:event.json`])));

// --- one event append+push / fetch+import, production calls -------------------
appendEvent(cloneA, ID, event('posted', { id: ID, title: 'Measure', task: 'x', base: 'a'.repeat(40), branch: 'main', issue: { number: 1, url: 'https://github.com/owner/project/issues/1' }, published: { pushed: [] } }));
const pushes = [], fetches = [];
for (let i = 0; i < 5; i++) {
  appendEvent(cloneA, ID, event('solution', { n: i + 1, commit: 'b'.repeat(40), changed: [], added: [], deleted: [] }));
  pushes.push(ms(() => pushChain(cloneA, ID).pushed).ms);
  fetches.push(ms(() => syncChains(cloneB, true)).ms);
}
rec('append+push one event ms (5 runs)', pushes.join(','), '~300', Math.max(...pushes) <= 600);
rec('fetch+import one event ms (5 runs)', fetches.join(','), '~500', Math.max(...fetches) <= 1000);

// --- scale: CHAINS chains x 5 events -------------------------------------------
// Seeded with ONE git fast-import: the product's per-event appendEvent costs
// ~6 process spawns an event and on this host each spawn can take seconds
// under AV scanning, so 5,000 appendEvent calls take tens of minutes. The
// commits fast-import writes are byte-identical to commitEvent's (same tree,
// same message, same identity), so what the remote holds and what
// syncChains then fetches and imports is exactly what real appends produce.
// The real appendEvent path is still measured above (append+push legs).
const seedT = ms(() => {
  let mark = 0;
  const chunks = [];
  const put = (s) => chunks.push(s);
  for (let c = 0; c < CHAINS; c++) {
    const id = `bt-${String(c).padStart(12, '0')}`;
    let prev = null;
    for (let e = 0; e < 5; e++) {
      const body = JSON.stringify(event(e === 0 ? 'posted' : 'solution', e === 0
        ? { id, title: `t${c}`, task: 'x', base: 'a'.repeat(40), branch: 'main', issue: { number: c, url: `https://github.com/owner/project/issues/${c}` }, published: { pushed: [] } }
        : { n: e, commit: 'b'.repeat(40), changed: [], added: [], deleted: [] })) + '\n';
      const msg = `box-bounty ${id} chain event\n`;
      put(`commit refs/box-bounty/${id}\nmark :${++mark}\n`);
      put(`committer box-bounty <box-bounty@localhost> 1770672000 +0000\n`);
      put(`data ${Buffer.byteLength(msg)}\n${msg}`);
      if (prev !== null) put(`from :${prev}\n`);
      put(`M 644 inline event.json\ndata ${Buffer.byteLength(body)}\n${body}\n`);
      prev = mark;
    }
  }
  gitc(cloneA, ['fast-import', '--quiet'], { input: chunks.join('') });
});
rec(`seed ${CHAINS}x5 events s (one fast-import)`, (seedT.ms / 1000).toFixed(1));
// push by URL, not 'origin': gitc bypasses the spawn patch and 'origin'
// would resolve to real github.com.
const bulkPush = ms(() => gitc(cloneA, ['push', remote, '+refs/box-bounty/*:refs/box-bounty/*']));
rec(`push ${CHAINS} chains ms`, bulkPush.ms);
const sizeLine = gitc(remote, ['count-objects', '-vH']).split('\n').find(l => /size-pack/.test(l)) ?? '';
const packKiB = (() => { const m = /([\d.]+)\s*(KiB|MiB|GiB)/.exec(sizeLine); const n = m === null ? NaN : parseFloat(m[1]); return n * { KiB: 1, MiB: 1024, GiB: 1048576 }[m?.[2] ?? 'KiB']; })();
rec(`remote size-pack after ${CHAINS}x5`, sizeLine.trim(), '1.54 MiB', packKiB <= 2 * 1.54 * 1024);
gitc(out, ['clone', '--no-local', remote, cloneD]);
gitc(cloneD, ['remote', 'set-url', 'origin', named]);
const firstFetch = ms(() => syncChains(cloneD, true));
rec(`first fetch+import ${CHAINS} chains ms`, firstFetch.ms, '3000-6000', firstFetch.ms <= 12000);
rec('imported shared row readable (bt-000000000007)', sharedRead(cloneD, 'bt-000000000007')?.stage, 'posted', sharedRead(cloneD, 'bt-000000000007') !== null);

// --- concurrent append: B wins, A merges, nothing lost ------------------------
appendEvent(cloneB, ID, event('closed', { kind: 'withdrawn', reason: 'from B' }));
pushChain(cloneB, ID);
appendEvent(cloneA, ID, event('closed', { kind: 'rejected', reason: 'from A' }));
const retried = ms(() => pushChain(cloneA, ID));
rec('concurrent push merged+retried ok', retried.r.pushed === true, 'true', retried.r.pushed === true);
rec('merge+retry push ms', retried.ms);
const both = eventsOf(cloneA, `refs/box-bounty/${ID}`);
rec('concurrent: both events kept, merge present',
  `${both.filter(e => e.type === 'closed').length} closed + ${both.filter(e => e.type === 'merge').length} merge`,
  '2 closed + >=1 merge',
  both.filter(e => e.type === 'closed').length === 2 && both.some(e => e.type === 'merge'));

// --- remote ref deleted: restored with identical content ---
const before = both.map(e => JSON.stringify(e)).sort();
// Recovery lives on the push side (pushChain restores a remote ref this
// machine pushed before); a fetch alone only prunes the tracking ref.
gitc(remote, ['update-ref', '-d', `refs/box-bounty/${ID}`]);
pushChain(cloneA, ID);
const restoredTip = gitc(remote, ['rev-parse', `refs/box-bounty/${ID}`]).split('\n')[0];
const after = eventsOf(cloneA, restoredTip).map(e => JSON.stringify(e)).sort();
rec('remote-deleted ref restored, content identical', JSON.stringify(before) === JSON.stringify(after), 'true', JSON.stringify(before) === JSON.stringify(after));

// --- default clone sees nothing ---
gitc(out, ['clone', '--no-local', remote, cloneC]);
const cRefs = gitc(cloneC, ['for-each-ref', '--format=%(refname)']);
rec('default clone: no box-bounty refs anywhere', !/box-bounty/.test(cRefs), 'true', !/box-bounty/.test(cRefs));
let grepHit = '';
try { grepHit = execFileSync('git', ['-c', `safe.directory=${slash(cloneC)}`, '-C', cloneC, 'grep', '-l', 'box-bounty', 'HEAD'], { encoding: 'utf8' }); } catch { /* 1 = no match */ }
const logp = gitc(cloneC, ['log', '-p', '--all']);
rec('grep/log -p on default clone clean', grepHit.trim() === '' && !logp.includes('event.json'), 'true', grepHit.trim() === '' && !logp.includes('event.json'));

// --- K14 legs: fetch/push per command ---
const traceFile = join(out, 'k14-trace.log');
process.env.GIT_TRACE = traceFile;
// trace lines arrive as "trace: built-in: git 'fetch' '--no-tags' ..." —
// tolerate Git's single-quoted argv form.
const count = (text, verb) => (text.match(new RegExp(`git '?${verb}'?\\b`, 'g')) ?? []).length;
// Legs run back-to-back, inside the once-a-minute refresh window — clear the
// recorded fetchedAt before each so every fetching command shows its real
// contract: one fetch, no pushes.
const statePath = join(process.env.BOX_BOUNTY_SETTINGS_DIR, 'state.json');
const clearFetched = () => {
  try {
    const s = JSON.parse(readFileSync(statePath, 'utf8'));
    if (s.chains !== undefined) { delete s.chains[realpathSync(cloneD)]; writeFileSync(statePath, JSON.stringify(s) + '\n'); }
  } catch { /* no state yet */ }
};
try {
  for (const [name, run] of [
    ['status', () => product.renderStatus(cloneD)],
    ['status --json', () => product.statusDocument(cloneD, {}, () => { })],
    ['find', () => product.findBounties(cloneD, 'Measure')],
    ['box bounty (overview)', () => product.renderOverview(cloneD)],
    ['help', () => product.renderHelp()],
    ['describe', () => product.renderDescribe(cloneD)],
    ['config', () => product.configDocument(cloneD, () => { })],
  ]) {
    const had = existsSync(traceFile) ? readFileSync(traceFile, 'utf8').length : 0;
    clearFetched();
    run();
    const added = readFileSync(traceFile, 'utf8').slice(had);
    rec(`K14 ${name}: fetch/push per call`, `${count(added, 'fetch')}/${count(added, 'push')}`, 'fetching <=1 / others 0,0');
  }
} finally { delete process.env.GIT_TRACE; }

writeFileSync(join(out, 'measure-report.json'), JSON.stringify({ at: new Date().toISOString(), node: process.version, chains: CHAINS, report }, null, 2));
console.log(`
report: ${join(out, 'measure-report.json')}`);
console.log(`scratch left at ${out} (kitchen-BT32 owned; remove at wave close)`);
