// K33 measurement: the kitchen's own record, measured.
// Read-only. Usage: node kitchen/review-k33/measure.mjs [--repo <dir>] [--base <sha>] [--cutoff <iso>] [--runs <dir>] [--gh <file>]
// Defaults: --repo cwd, --base 2b3eace (K33 kickoff commit), --cutoff 2026-10-18T19:29:02Z (kickoff commit time),
// --runs <repo>/.kitchen/runs (local-only, gitignored input; missing => run columns report "missing"),
// --gh kitchen/review-k33/gh-runs-snapshot.json (snapshot taken 2026-10-19 via `gh run list -R shouteck/omakase-box --limit 200 --json`).
// Reproduce: `gh run list -R shouteck/omakase-box --limit 200 --json databaseId,headSha,conclusion,status,event,headBranch,displayTitle,createdAt > kitchen/review-k33/gh-runs-snapshot.json`
// A missing value is printed as "missing", never as zero.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; }
const REPO = path.resolve(opt('repo', '.'));
const BASE = opt('base', '2b3eace72f30dd911f59f2a4672e96b7191f5c5c');
const CUTOFF = new Date(opt('cutoff', '2026-10-18T19:29:02Z'));
const RUNS = opt('runs', path.join(REPO, '.kitchen', 'runs'));
const GHFILE = opt('gh', path.join(REPO, 'kitchen', 'review-k33', 'gh-runs-snapshot.json'));

const SAFE = ['-c', 'safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp'];
function git(...a) {
  return execFileSync('git', [...SAFE, ...a], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// ---- Git inputs (pinned to BASE) ----
// first-parent log of master at BASE: sha, time, subject
const fpLog = git('log', '--first-parent', '--format=%H\t%cI\t%s', BASE).trim().split('\n').map(l => {
  const [sha, t, ...s] = l.split('\t'); return { sha, t: new Date(t), s: s.join('\t') };
}).filter(c => c.t <= CUTOFF);
const shaTime = new Map(fpLog.map(c => [c.sha, c.t]));

// Wave file inventory and contents come from the PINNED BASE tree, not the working copy:
// the report's numbers must not drift when wave files (including this one) are edited after BASE.
const waveIds = git('ls-tree', '--name-only', BASE, 'waves/')
  .trim().split('\n').map(l => l.replace(/^waves\//, ''))
  .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
  .filter(id => !/^night-/.test(id));
const waveText = new Map();
for (const id of waveIds) {
  try { waveText.set(id, git('show', BASE + ':waves/' + id + '.md')); }
  catch { waveText.set(id, ''); }
}

function commitsTouching(file) {
  const out = git('log', '--format=%H\t%cI\t%s', BASE, '--', file).trim();
  if (!out) return [];
  return out.split('\n').map(l => { const [sha, t, ...s] = l.split('\t'); return { sha, t: new Date(t), s: s.join('\t') }; })
    .filter(c => c.t <= CUTOFF).reverse(); // oldest first
}

// merge commit for a wave on first-parent master
function mergeCommit(id) {
  const re = new RegExp('^Merge (wave[ /]?)?' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  return fpLog.find(c => re.test(c.s));
}
function closeCommit(id, mergeT) {
  const re = new RegExp('close', 'i');
  const reId = new RegExp('\\b' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  return fpLog.filter(c => (!mergeT || c.t > mergeT) && re.test(c.s) && reId.test(c.s))
    .sort((a, b) => a.t - b.t)[0];
}

// commits on the wave's merged side: merge^2 ancestors not on merge^1
function waveCommits(m) {
  if (!m) return new Set();
  const out = git('rev-list', m.sha + '^2', '--not', m.sha + '^1').trim();
  return new Set(out ? out.split('\n') : []);
}

// ---- Run records (local-only input) ----
let runDirs = [];
let runsPresent = fs.existsSync(RUNS);
if (runsPresent) {
  for (const d of fs.readdirSync(RUNS)) {
    const sj = path.join(RUNS, d, 'summary.json');
    let rec = { dir: d, hasSummary: false };
    try {
      const j = JSON.parse(fs.readFileSync(sj, 'utf8'));
      rec = { dir: d, hasSummary: true, sha: j.sha, verdict: j.verdict, seconds: j.seconds,
        startedAt: j.startedAt, failure: j.failure, steps: j.steps || [], dirty: j.dirty, line: j.line };
    } catch { /* dir without readable summary = incomplete run */ }
    // dir name starts with ISO timestamp
    const m = d.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(\d{3})Z-([0-9a-f]+)/);
    if (m) rec.dirTime = new Date(d.slice(0, 24).replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1T$2:$3:$4.$5Z'));
    runDirs.push(rec);
  }
  runDirs = runDirs.filter(r => !r.dirTime || r.dirTime <= CUTOFF);
}

// ---- Hosted runs snapshot ----
let ghRuns = [];
if (fs.existsSync(GHFILE)) ghRuns = JSON.parse(fs.readFileSync(GHFILE, 'utf8'));
const ghBySha = new Map();
for (const r of ghRuns) if (!ghBySha.has(r.headSha)) ghBySha.set(r.headSha, r);

// ---- Per-wave rows ----
const rows = [];
for (const id of waveIds.sort()) {
  const file = 'waves/' + id + '.md';
  const text = waveText.get(id) ?? '';
  const touches = commitsTouching(file);
  const merge = mergeCommit(id);
  const close = merge ? closeCommit(id, merge.t) : undefined;
  const wc = waveCommits(merge);

  const myRuns = runsPresent ? runDirs.filter(r => r.hasSummary && r.sha && wc.has(r.sha)) : [];
  const incomplete = runsPresent ? runDirs.filter(r => !r.hasSummary && r.dirTime && merge && r.dirTime >= (touches[0]?.t || 0) && r.dirTime <= (close?.t || CUTOFF)) : [];
  const fails = myRuns.filter(r => r.verdict !== 'PASS');
  const timeoutOnly = [];
  for (const f of fails) {
    const bad = (f.steps || []).filter(s => s.exit !== 0);
    let allTimeout = bad.length > 0;
    for (const s of bad) {
      try {
        const log = fs.readFileSync(path.join(RUNS, f.dir, s.log), 'utf8');
        if (!/timed? ?out|timeout|took too long/i.test(log)) allTimeout = false;
      } catch { allTimeout = false; }
    }
    if (allTimeout) timeoutOnly.push(f.dir);
  }

  // corrections: FAIL verify lines quoted in the wave file + non-PASS attributed runs (dedup)
  const quotedFails = (text.match(/verify [0-9a-f]{7,}\s+FAIL/gi) || []).length;
  // review FAIL-verdict markers: a Verdict/Round/reviewer line that records a FAIL.
  // Mechanical detector; deliberately excludes 'verify <sha> FAIL' run-result lines.
  const failVerdictLines = text.split('\n').filter(l =>
    (/verdict[^\n]{0,40}\bfail/i.test(l)
      || /round\s*\d+[^\n]{0,50}\bfail\b/i.test(l)
      || /first\s+(pass|review|round)[^\n]{0,50}\bfail/i.test(l)
      || /reviewer\s+FAIL|review\s+FAIL(ed)?\b/i.test(l))
    && !/verify [0-9a-f]{7,}\s+FAIL|Master: FAIL|would fail|must fail|fail-safe|failsafe|fail under|fail on master/i.test(l));
  const failVerdicts = failVerdictLines.length;
  const workerM = text.match(/Worker:\s*([^\n·|]+)/);
  const reviewerM = text.match(/Reviewer:\s*([^\n]+)/);
  const hostText = ((workerM?.[1] || '') + ' ' + (reviewerM?.[1] || '')).toLowerCase();
  const host = /claude/.test(hostText) ? 'claude' : /devin/.test(hostText) ? 'devin' : /cursor/.test(hostText) ? 'cursor' : (workerM ? 'unstated' : 'missing');
  const verdict = (text.match(/Verdict:\s*\*?\*?(PASS|FAIL)/i) || [null, 'missing'])[1].toUpperCase();
  const briefDate = (text.match(/[Ww]ritten by the CTO on (\d+ \w+ \d+)/) || text.match(/(\d+ \w+ 2026)/) || [])[1] || 'missing';
  const rewrites = touches.filter(c => /rewrit|revis|rebrief|rework/i.test(c.s)).length;
  const gh = merge ? ghBySha.get(merge.sha) : null;

  const kind = /-ci\d*$/.test(id) ? 'correction' : /^BT/.test(id) ? 'product' : /^K/.test(id) ? 'kitchen' : 'other';
  rows.push({
    id, kind,
    briefFirstCommit: touches[0] ? touches[0].t.toISOString() : 'missing',
    fileTouches: touches.length,
    merge: merge ? merge.sha.slice(0, 9) : 'missing',
    mergeT: merge ? merge.t.toISOString() : 'missing',
    closeT: close ? close.t.toISOString() : 'missing',
    elapsedMin: (merge && touches[0]) ? Math.round((merge.t - touches[0].t) / 60000) : 'missing',
    mergeToCloseMin: (merge && close) ? Math.round((close.t - merge.t) / 60000) : 'missing',
    waveCommits: wc.size,
    verifyRuns: runsPresent ? myRuns.length : 'missing',
    verifySec: runsPresent ? myRuns.reduce((a, r) => a + (r.seconds || 0), 0) : 'missing',
    verifyFails: runsPresent ? fails.length : 'missing',
    timeoutOnlyFails: runsPresent ? timeoutOnly.length : 'missing',
    incompleteRunDirs: runsPresent ? incomplete.length : 'missing',
    quotedFailLines: quotedFails,
    failVerdicts,
    host, verdict, briefDate, rewrites,
    hostedAfterMerge: merge ? (gh ? gh.conclusion : 'no-run-found') : 'missing',
  });
}

// ---- Output ----
const cols = ['id', 'kind', 'briefFirstCommit', 'merge', 'elapsedMin', 'mergeToCloseMin', 'verifyRuns', 'verifySec', 'verifyFails', 'timeoutOnlyFails', 'incompleteRunDirs', 'quotedFailLines', 'failVerdicts', 'host', 'verdict', 'rewrites', 'hostedAfterMerge', 'fileTouches'];
const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c]).length)));
console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
for (const r of rows) console.log(cols.map((c, i) => String(r[c]).padEnd(w[i])).join('  '));

// summary helpers
const nums = rows.map(r => r.elapsedMin).filter(x => typeof x === 'number').sort((a, b) => a - b);
const med = nums.length ? nums[Math.floor(nums.length / 2)] : 'missing';
console.log('\n=== summary ===');
console.log('waves measured:', rows.length, '| merged:', rows.filter(r => r.merge !== 'missing').length);
console.log('median brief-to-merge minutes (merged only):', med);
for (const kind of ['product', 'kitchen', 'correction', 'other']) {
  const g = rows.filter(r => r.kind === kind && typeof r.elapsedMin === 'number').sort((a, b) => b.elapsedMin - a.elapsedMin);
  console.log(`kind=${kind} n=${g.length} top5-slowest:`, g.slice(0, 5).map(r => `${r.id}:${r.elapsedMin}m`).join(', ') || 'none');
}
console.log('\nverify totals: runs=', runDirs.filter(r => r.hasSummary).length, 'incomplete dirs=', runDirs.filter(r => !r.hasSummary).length,
  'total seconds=', runDirs.filter(r => r.hasSummary).reduce((a, r) => a + (r.seconds || 0), 0));
console.log('\nby host (verdict PASS/FAIL and attributed verify fails):');
for (const h of [...new Set(rows.map(r => r.host))]) {
  const g = rows.filter(r => r.host === h);
  console.log(` ${h}: n=${g.length} pass=${g.filter(r => r.verdict === 'PASS').length} fail-verdicts=${g.filter(r => r.verdict === 'FAIL').length} verifyFails=${g.reduce((a, r) => a + (typeof r.verifyFails === 'number' ? r.verifyFails : 0), 0)}`);
}
console.log('\nhosted runs not success after merge:', rows.filter(r => !['missing', 'no-run-found', 'success'].includes(r.hostedAfterMerge)).map(r => `${r.id}:${r.hostedAfterMerge}`).join(', ') || 'none');
console.log('\ntop verify-second waves:', rows.filter(r => typeof r.verifySec === 'number').sort((a, b) => b.verifySec - a.verifySec).slice(0, 10).map(r => `${r.id}:${r.verifySec}s/${r.verifyRuns}runs`).join(', '));
console.log('\nrewrites>0:', rows.filter(r => r.rewrites > 0).map(r => `${r.id}:${r.rewrites}`).join(', ') || 'none');
const fv = rows.filter(r => r.failVerdicts > 0);
console.log('\nwaves with >=1 review FAIL-verdict marker (mechanical regex on pinned wave text):', fv.length);
console.log(fv.map(r => `${r.id}:${r.failVerdicts}`).join(', '));
