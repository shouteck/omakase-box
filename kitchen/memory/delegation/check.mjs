// K28 regression check — NOT a product test. Rerunnable:
//   node kitchen/memory/delegation/check.mjs
// Asserts the pass's finding is fixed and stays fixed:
//   1. chain.mjs run directly still works as a CLI;
//   2. importing chain.mjs does NOT consume the importer's argv (no exit 2);
//   3. measure.mjs --out and worlds.mjs --out run on the script's own clean scratch;
//   4. a foreign nonempty directory is refused BY THE OWNERSHIP MARKER check
//      (message names the marker, exit 1, sentinel byte-identical) — not the
//      incidental "unknown command" exit 2 that used to mask it.
// Everything runs under a fresh %TEMP%\kitchen-K28-check-* dir.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const chain = join(HERE, 'chain.mjs');
const measure = join(HERE, 'measure.mjs');
const worlds = join(HERE, 'worlds.mjs');
const root = mkdtempSync(join(tmpdir(), 'kitchen-K28-check-'));
let failures = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!cond) failures++; };
const run = (file, args, opts = {}) => spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', timeout: 280000, ...opts });

// 1. direct CLI: init a repo, append one event, ids lists it.
const repo = join(root, 'repo');
mkdirSync(repo, { recursive: true });
for (const args of [['init'], ['config', 'user.name', 'k28'], ['config', 'user.email', 'k28@prototype']]) {
  const r = spawnSync('git', ['-c', `safe.directory=${repo.split(String.fromCharCode(92)).join('/')}`, ...args], { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) { ok('setup git repo', false, r.stderr); process.exit(1); }
}
const evFile = join(root, 'ev.json');
writeFileSync(evFile, JSON.stringify({ type: 'decided', why: 'check', at: '2026-10-18T00:00:00Z', actor: 'check' }));
const ap = run(chain, ['append', repo, 'bt-check', evFile]);
ok('direct CLI append', ap.status === 0, ap.stderr.trim());
const idList = run(chain, ['ids', repo]);
ok('direct CLI ids', idList.status === 0 && idList.stdout.trim() === 'bt-check', `${idList.status} ${idList.stdout.trim()}`);

// 2. import does not dispatch: pass junk argv — must exit 0, print the marker.
const imp = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(pathToFileURL(chain).href)}).then(m => console.log('imported', typeof m.append, typeof m.ids))`, 'bogus-cmd', 'x', 'junk'], { encoding: 'utf8' });
ok('import does not consume argv', imp.status === 0 && imp.stdout.includes('imported function function'), `status ${imp.status} stderr ${imp.stderr.trim()}`);

// 3. both --out scripts on their own clean scratch.
const mOut = join(root, 'measure-scratch');
const mr = run(measure, ['--out', mOut]);
ok('measure.mjs --out own scratch', mr.status === 0 && existsSync(join(mOut, 'measure-report.json')), `status ${mr.status} ${(mr.stderr || '').trim().slice(0, 200)}`);
const wOut = join(root, 'worlds-scratch');
const wr = run(worlds, ['--out', wOut]);
ok('worlds.mjs --out own scratch', wr.status === 0 && existsSync(join(wOut, 'truth-key.json')) && existsSync(join(wOut, 'world-a', '.git')), `status ${wr.status} ${(wr.stderr || '').trim().slice(0, 200)}`);

// 4. foreign nonempty dir: marker refusal, sentinel unchanged, exit 1 not 2.
for (const [name, script] of [['measure.mjs', measure], ['worlds.mjs', worlds]]) {
  const foreign = join(root, `foreign-${name}`);
  mkdirSync(foreign, { recursive: true });
  writeFileSync(join(foreign, 'sentinel.txt'), 'foreign-sentinel-do-not-touch');
  const r = run(script, ['--out', foreign]);
  const msg = (r.stderr || '') + (r.stdout || '');
  const sentinelOk = readFileSync(join(foreign, 'sentinel.txt'), 'utf8') === 'foreign-sentinel-do-not-touch';
  ok(`${name} foreign dir refused by marker check`, r.status === 1 && /marker|not created by this script/.test(msg) && sentinelOk, `status ${r.status} msg ${msg.trim().slice(0, 160)}`);
}

// 5. Committed evidence sanity: the files the report cites exist, and the
// post-fix raw record carries every measurement (guards the run-pairing bug —
// a regenerated JSON once overwrote run 2 while its log stayed).
const evDir = join(HERE, 'evidence');
const cited = ['measure-report-run3-postfix.json', 'measure-console-run2-prefixed.log', 'truth-key.json', 'README.md'];
ok('committed evidence files present', cited.every(f => existsSync(join(evDir, f))), cited.filter(f => !existsSync(join(evDir, f))).join(',') || 'all present');
try {
  const r3 = JSON.parse(readFileSync(join(evDir, 'measure-report-run3-postfix.json'), 'utf8'));
  ok('post-fix raw record complete', Array.isArray(r3.report) && r3.report.length === 20 && r3.report.every(e => e.value !== '' && e.value != null), `entries ${r3.report?.length}`);
} catch (e) { ok('post-fix raw record complete', false, e.message); }

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`} — scratch left at ${root} (kitchen-K28 owned)`);
process.exit(failures === 0 ? 0 : 1);
