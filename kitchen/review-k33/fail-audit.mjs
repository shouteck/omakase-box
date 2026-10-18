// K33 correction: auditable per-wave review-FAIL inventory.
// fail-inventory.json classifies every one of the 115 pinned wave files (base 2b3eace) into:
//   A  explicit reviewer FAIL verdict followed by cook correction round(s)
//   B  explicit reviewer FAIL verdict; correction handled outside the wave (park / split / -ci)
//   C  verify/CI/environment/test failure recorded; no reviewer FAIL verdict
//   E  the word FAIL appears only as requirement wording, test design, or narrative
//   F  prior review rounds implied; no explicit FAIL verdict retained in the pinned text
//   G  post-review correction without a FAIL verdict (defect found outside review)
//   D  no FAIL in the Result section at all
// This script re-checks the inventory against the pinned wave texts and derives every
// report figure from it, so the headline, class and host tables cannot drift apart.
// Usage: node kitchen/review-k33/fail-audit.mjs [--repo <dir>] [--base <sha>]
// Exits 1 and names the row if any stored excerpt is absent from the pinned text,
// any D row contains FAIL in its Result, or any A/B row lacks a review-FAIL-shaped line.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const REPO = path.resolve(opt('repo', '.'));
const INV = JSON.parse(fs.readFileSync(path.join(REPO, 'kitchen', 'review-k33', 'fail-inventory.json'), 'utf8'));
const BASE = opt('base', INV.base);
const SAFE = ['-c', 'safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp'];
const git = (...a) => execFileSync('git', [...SAFE, ...a], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const waveIds = git('ls-tree', '--name-only', BASE, 'waves/')
  .trim().split('\n').map(l => l.replace(/^waves\//, ''))
  .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).filter(id => !/^night-/.test(id)).sort();

let errors = 0;
const bad = (id, msg) => { errors++; console.log(`ERROR ${id}: ${msg}`); };

// (a) every pinned wave classified exactly once, no extras
const invIds = Object.keys(INV.rows).sort();
if (JSON.stringify(invIds) !== JSON.stringify(waveIds)) {
  const missing = waveIds.filter(i => !INV.rows[i]);
  const extra = invIds.filter(i => !waveIds.includes(i));
  bad('(set)', `inventory rows ${invIds.length} vs pinned waves ${waveIds.length}; missing=${missing} extra=${extra}`);
}

const REVIEW_FAIL = /verdict[^\n]*\bfail|fail[^\n]*verdict|first (pass|review|round)[^\n]*\bfail|round[^\n]*\bfail|fail[^\n]*round|review[^\n]*fail|fail(ed)?[^\n]*fix|fail[^\n]*correct|superseded[^\n]*fail|fail[^\n]*superseded/i;

const texts = new Map();
for (const id of waveIds) {
  let t = ''; try { t = git('show', BASE + ':waves/' + id + '.md'); } catch { }
  texts.set(id, t);
}

for (const id of waveIds) {
  const r = INV.rows[id];
  if (!r) continue;
  const text = texts.get(id);
  const resStart = text.split('\n').findIndex(l => /^##\s+Result/i.test(l));
  const result = resStart >= 0 ? text.split('\n').slice(resStart).join('\n') : '';
  // (b) stored excerpt must be verbatim in the pinned text
  if (r.excerpt) {
    const quote = r.excerpt.replace(/^L\d+:\s*/, '');
    if (!text.includes(quote)) bad(id, `stored excerpt not found verbatim in pinned text: ${r.excerpt.slice(0, 80)}`);
  }
  // (c) D rows: no FAIL anywhere in the Result section
  if (r.cat === 'D' && /\bFAIL(ed|ure)?\b/i.test(result)) bad(id, 'classed D but Result contains FAIL');
  // (d) A/B rows: at least one review-FAIL-shaped line in the Result
  if ((r.cat === 'A' || r.cat === 'B') && !result.split('\n').some(l => REVIEW_FAIL.test(l)))
    bad(id, 'classed ' + r.cat + ' but no review-FAIL-shaped line found in Result');
}

// ---- derived tables (all report figures come from here) ----
const rows = waveIds.map(id => ({ id, ...INV.rows[id] }));
const byCat = c => rows.filter(r => r.cat === c);
const failRows = byCat('A').concat(byCat('B'));
const mergedSubjects = git('log', '--first-parent', '--format=%s', BASE).split('\n');
// a bare word boundary is not enough: 'K7' must not match 'Merge wave/K7-ci2' and
// 'BT7' must not match 'Merge BT7b' — the id must not be followed by a letter, digit or '-'
const merged = id => mergedSubjects.some(s => new RegExp('^Merge (wave[ /]?)?' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9-])', 'i').test(s));
const mergedCount = mergedSubjects.filter(s => /^Merge /i.test(s) && !/remote-tracking/.test(s)).length;

console.log('=== K33 review-FAIL audit (base ' + BASE.slice(0, 7) + ') ===');
console.log('waves at base:', waveIds.length, '| merge commits on first-parent master:', mergedCount);
console.log('category counts:', ['A', 'B', 'C', 'E', 'F', 'G', 'D'].map(c => `${c}=${byCat(c).length}`).join(' '));
console.log('\nwaves with >=1 explicit reviewer FAIL verdict (A+B):', failRows.length,
  '| explicit FAIL verdicts summed:', failRows.reduce((a, r) => a + (r.fails || 0), 0));
console.log('  A (FAIL -> cook correction):', byCat('A').map(r => `${r.id}:${r.fails}`).join(' '));
console.log('  B (FAIL -> correction outside wave):', byCat('B').map(r => r.id).join(' '));
console.log('  merged among A+B:', failRows.filter(r => merged(r.id)).map(r => r.id).join(' '));
console.log('  unmerged among A+B:', failRows.filter(r => !merged(r.id)).map(r => r.id).join(' '));

const cls = {}, host = {};
for (const r of failRows) { cls[r.cls] = (cls[r.cls] || 0) + 1; host[r.host || 'unstated'] = (host[r.host || 'unstated'] || 0) + 1; }
console.log('\nby assigned class (judgement, see report):', JSON.stringify(cls));
console.log('by stated host:', JSON.stringify(host));
console.log('\nC (verify/CI/env failures only):', byCat('C').map(r => r.id).join(' '));
console.log('F (rounds implied, no FAIL verdict kept):', byCat('F').map(r => r.id).join(' '));
console.log('G (post-review correction, no FAIL verdict):', byCat('G').map(r => r.id).join(' '));
console.log('\nerrors:', errors);
process.exit(errors ? 1 : 0);
