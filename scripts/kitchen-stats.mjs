// Prints one page of honest kitchen numbers from .kitchen/runs and Git, so the
// K5/K6/K7 speed waves measure instead of guess. Read-only: nothing here writes
// outside stdout. scripts/verify.mjs reuses readRuns/stallCheck for its STALL
// line, and tests/kitchen drives the same functions on fabricated run dirs.
//
//   node scripts/kitchen-stats.mjs [--root=<dir>]
//
// Fairness rules (kitchen/stations/evidence.md): every run dir counts, including
// ones with no summary.json; a missing observation is printed as missing, never
// as zero; every figure names the runs it came from.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root as repoRoot } from './process.mjs';

// --- reading runs ------------------------------------------------------------

// .kitchen/runs/<startedAt-with-:. -as-->-<sha7>/summary.json. Returns one entry
// per directory, sorted oldest first; a dir without a parseable summary keeps
// its dir-name sha and timestamp so it still counts.
export function readRuns(runsDir) {
  if (!existsSync(runsDir)) return [];
  const runs = [];
  for (const name of readdirSync(runsDir).sort()) {
    const dir = join(runsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const match = name.match(/^(.*)-([0-9a-f]{7,40})$/);
    const dirStamp = Date.parse((match ? match[1] : name).replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1T$2:$3:$4.$5Z'));
    const run = { name, sha: match ? match[2] : null, startedAt: Number.isNaN(dirStamp) ? null : dirStamp, seconds: null, verdict: null, dirty: null, steps: [], summary: 'missing' };
    const summaryPath = join(dir, 'summary.json');
    if (existsSync(summaryPath)) {
      try {
        const parsed = JSON.parse(readFileSync(summaryPath, 'utf8'));
        run.summary = 'ok';
        run.sha = typeof parsed.sha === 'string' ? parsed.sha : run.sha;
        const started = Date.parse(parsed.startedAt);
        run.startedAt = Number.isNaN(started) ? run.startedAt : started;
        run.seconds = typeof parsed.seconds === 'number' ? parsed.seconds : null;
        run.verdict = typeof parsed.verdict === 'string' ? parsed.verdict : null;
        run.dirty = typeof parsed.dirty === 'boolean' ? parsed.dirty : null;
        run.steps = Array.isArray(parsed.steps) ? parsed.steps.map(step => ({ name: String(step && step.name), exit: step && typeof step.exit === 'number' ? step.exit : null, seconds: step && typeof step.seconds === 'number' ? step.seconds : null, reused: step && typeof step.reused === 'string' ? step.reused : null })) : [];
        run.profile = typeof parsed.profile === 'string' ? parsed.profile : null;
      } catch { run.summary = 'malformed'; }
    }
    runs.push(run);
  }
  return runs.sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity));
}

// --- the stall signal verify.mjs prints --------------------------------------

// commits: the SHAs that count as "this branch" (verify passes merge-base..HEAD
// plus HEAD itself, so a run at the branch point still counts). A run belongs
// when its summary sha — or its dir-name sha when no summary was written —
// equals or prefixes one of them. Only a clean PASS breaks the streak: FAIL,
// UNCOMMITTED, dirty and summary-less runs all count as non-PASS, so a dirty
// tree can never pass as a committed PASS.
export function stallCheck(runs, commits, { now = Date.now(), maxRuns = 6, maxMinutes = 90 } = {}) {
  const set = commits instanceof Set ? commits : new Set(commits);
  const onBranch = sha => typeof sha === 'string' && (set.has(sha) || (sha.length < 40 && [...set].some(full => full.startsWith(sha))));
  const ours = runs.filter(run => onBranch(run.sha) && run.startedAt !== null).sort((a, b) => a.startedAt - b.startedAt);
  const streak = [];
  for (let index = ours.length - 1; index >= 0; index -= 1) {
    const run = ours[index];
    if (run.verdict === 'PASS' && run.dirty === false) break;
    streak.unshift(run);
  }
  const minutes = streak.length ? (now - streak[0].startedAt) / 60000 : 0;
  const triggers = [];
  if (streak.length >= maxRuns) triggers.push(streak.length + ' consecutive non-PASS runs on this branch (limit ' + maxRuns + ')');
  if (minutes >= maxMinutes) triggers.push(Math.round(minutes) + ' min since the last PASS on this branch (limit ' + maxMinutes + ' min)');
  return triggers.length ? { consecutive: streak.length, minutes, triggers } : null;
}

// --- the kitchen's own limits -------------------------------------------------

function fileText(root, name) {
  try { return readFileSync(join(root, name), 'utf8'); } catch { return null; }
}
function lineCount(text) {
  return text === '' ? 0 : (text.match(/\n/g) || []).length + (text.endsWith('\n') ? 0 : 1);
}
// Each check reports { label, actual, limit, ok } — ok is true/false, or the
// string 'missing' when the input file is absent (missing is labelled, not a pass).
export function checkLimits(root) {
  const checks = [];
  const agents = fileText(root, 'AGENTS.md');
  const kitchen = fileText(root, 'docs/box-v4/KITCHEN.md');
  const bytes = (agents === null || kitchen === null) ? null : Buffer.byteLength(agents) + Buffer.byteLength(kitchen);
  checks.push({ label: 'AGENTS.md + docs/box-v4/KITCHEN.md combined size', actual: bytes === null ? 'missing' : bytes + ' B', limit: '20480 B', ok: bytes === null ? 'missing' : bytes <= 20480 });
  const inbox = fileText(root, 'kitchen/INBOX.md');
  if (inbox === null) checks.push({ label: 'kitchen/INBOX.md entry lines', actual: 'missing', limit: '10', ok: 'missing' });
  else {
    const entries = inbox.split('\n').filter(line => /^\s*-\s/.test(line)).length;
    // The file's own contract is "one line each, ten at most", so entries are
    // counted; a file with no bullet entries but still over ten lines trips the
    // same limit under the brief's literal wording.
    const over = entries > 10 || (entries === 0 && lineCount(inbox) > 10);
    checks.push({ label: 'kitchen/INBOX.md entry lines', actual: entries + ' (' + lineCount(inbox) + ' lines in file)', limit: '10', ok: !over });
  }
  const status = fileText(root, 'STATUS.md');
  checks.push({ label: 'STATUS.md lines', actual: status === null ? 'missing' : String(lineCount(status)), limit: '60', ok: status === null ? 'missing' : lineCount(status) <= 60 });
  return checks;
}

export const ACCEPTANCE_PROFILE = 'verify --full test:box-package test:kitchen';
export const ACCEPTANCE_STEPS = ['check', 'build', 'test:box-package', 'test:kitchen'];
export const ACCEPTANCE_BUDGET_SECONDS = 330;
export function budgetCheck(runs, { profile = ACCEPTANCE_PROFILE, steps = ACCEPTANCE_STEPS, budgetSeconds = ACCEPTANCE_BUDGET_SECONDS } = {}) {
  const label = `acceptance profile "${profile}" executed seconds`;
  // The latest run dir that could be a profile observation is the only thing
  // judged: a valid run of this profile, or one whose summary is missing or
  // unparseable and so cannot be scoped to any profile. Uncertainty is judged
  // invalid — never skipped toward an older pass.
  const candidates = runs.filter(run => run.summary !== 'ok' || run.profile === profile);
  if (!candidates.length) return { label, actual: 'missing', limit: `${budgetSeconds}s`, ok: 'missing' };
  const latest = candidates[candidates.length - 1];
  const invalid = reason => ({ label, actual: `invalid latest run ${latest.name}: ${reason}`, limit: `${budgetSeconds}s`, ok: 'missing' });
  if (latest.summary !== 'ok') return invalid(`summary ${latest.summary}`);
  if (latest.verdict !== 'PASS' || latest.dirty !== false) return invalid(`verdict ${latest.verdict ?? 'missing'}${latest.dirty !== false ? ', dirty tree' : ''}`);
  const bad = latest.steps.find(step => step.reused || step.exit !== 0 || typeof step.seconds !== 'number' || !Number.isFinite(step.seconds) || step.seconds < 0);
  if (bad) return invalid(`step ${bad.name} ${bad.reused ? 'was reused' : bad.exit !== 0 ? `exited ${bad.exit}` : 'seconds missing or invalid'}`);
  const missingStep = steps.find(name => !latest.steps.some(step => step.name === name));
  if (missingStep) return invalid(`profile step ${missingStep} missing`);
  const executed = latest.steps.reduce((sum, step) => sum + step.seconds, 0);
  if (!(executed > 0)) return invalid('zero executed seconds');
  return { label, actual: `${executed}s`, limit: `${budgetSeconds}s`, ok: executed <= budgetSeconds };
}

// --- git helpers (read-only) --------------------------------------------------

const BACKSLASH = String.fromCharCode(92);
const forwardSlash = path => path.replace(/[/\x5c]+$/, '').replaceAll(BACKSLASH, '/');
function git(root, args) {
  const run = spawnSync('git', ['-c', 'safe.directory=' + forwardSlash(root), ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  return run.status === 0 ? run.stdout : null;
}
const isCommit = (root, sha) => (git(root, ['cat-file', '-t', sha]) || '').trim() === 'commit';
const isAncestor = (root, a, b) =>
  spawnSync('git', ['-c', 'safe.directory=' + forwardSlash(root), 'merge-base', '--is-ancestor', a, b], { cwd: root, windowsHide: true }).status === 0;

// --- wave history -------------------------------------------------------------

// Reads waves/*.md (skipping night-*.md plan files) for the recorded Commit and
// Merged SHAs, then resolves each wave's branch commits and duration from git.
function readWaves(root) {
  const dir = join(root, 'waves');
  if (!existsSync(dir)) return [];
  const waves = [];
  for (const file of readdirSync(dir).filter(name => name.endsWith('.md') && !name.startsWith('night-')).sort()) {
    const text = fileText(root, join('waves', file)) || '';
    const commits = [...text.matchAll(/- Commit:\s*`?([0-9a-f]{7,40})/g)].map(match => match[1]);
    const merge = (text.match(/- Merged:\s*`?([0-9a-f]{7,40})/) || [])[1] || null;
    const branches = [...text.matchAll(/`((?:wave|proto)\/[^`\s]+)`/g)].map(match => match[1]);
    waves.push({ id: file.slice(0, -3), commits, merge, branches });
  }
  return waves;
}

// Branch commits and first-commit-to-merge duration per wave. A wave whose
// record is incomplete reports "missing", never a guess.
function waveHistory(root, waves) {
  const history = [];
  const merges = (git(root, ['log', '--first-parent', '--format=%H %cI %P', 'master']) || '').split('\n')
    .map(line => line.trim().split(/\s+/)).filter(parts => parts.length === 4)
    .map(parts => ({ sha: parts[0], at: parts[1], parent1: parts[2], parent2: parts[3] }));
  for (const wave of waves) {
    const entry = { id: wave.id, branchCommits: [], firstCommitAt: null, mergedAt: null, mergeSha: null, note: null };
    let merge = wave.merge ? merges.find(item => item.sha.startsWith(wave.merge)) || null : null;
    if (!merge && wave.commits.length) {
      merge = merges.find(item => wave.commits.some(sha => isAncestor(root, sha, item.parent2) && !isAncestor(root, sha, item.parent1))) || null;
    }
    if (merge) {
      entry.mergeSha = merge.sha;
      entry.mergedAt = Date.parse(merge.at);
      entry.branchCommits = (git(root, ['rev-list', merge.parent1 + '..' + merge.parent2]) || '').split('\n').filter(Boolean);
      const oldest = entry.branchCommits[entry.branchCommits.length - 1];
      const at = oldest ? (git(root, ['show', '-s', '--format=%cI', oldest]) || '').trim() : null;
      entry.firstCommitAt = at ? Date.parse(at) : null;
      if (entry.firstCommitAt === null) entry.note = 'merge found but first commit unreadable';
    } else {
      const branch = wave.branches.find(name => git(root, ['rev-parse', '--verify', 'refs/heads/' + name]));
      if (branch) {
        const base = (git(root, ['merge-base', 'master', branch]) || '').trim();
        entry.branchCommits = base ? (git(root, ['rev-list', base + '..' + branch]) || '').split('\n').filter(Boolean) : [];
        entry.note = 'not merged — local branch ' + branch;
      } else entry.note = 'no merged branch or recorded merge found';
    }
    history.push(entry);
  }
  return history;
}

// --- the page -----------------------------------------------------------------

const fmtMin = seconds => (seconds / 60).toFixed(1);
const sha7 = sha => (sha || '???????').slice(0, 7);
const has = (list, sha) => typeof sha === 'string' && (list.includes(sha) || (sha.length < 40 && list.some(full => full.startsWith(sha))));

function page(root) {
  const out = [];
  const runsDir = join(root, '.kitchen', 'runs');
  const runs = readRuns(runsDir);
  const withSummary = runs.filter(run => run.summary === 'ok');
  const without = runs.filter(run => run.summary !== 'ok');
  const verdictCount = name => withSummary.filter(run => run.verdict === name).length;
  const totalSeconds = withSummary.reduce((sum, run) => sum + (run.seconds || 0), 0);

  out.push('kitchen stats — ' + new Date().toISOString());
  out.push('source: ' + runsDir + ' (' + runs.length + ' run dirs) + git log; read-only, nothing written');
  out.push('');
  out.push('Verify runs');
  out.push('  ' + withSummary.length + ' runs with summary.json · ' + without.length + ' without — ' + (without.length ? without.map(run => run.name + (run.summary === 'malformed' ? ' (malformed summary)' : '')).join(', ') : 'none'));
  out.push('  verdicts: ' + verdictCount('PASS') + ' PASS · ' + verdictCount('FAIL') + ' FAIL · ' + verdictCount('UNCOMMITTED') + ' UNCOMMITTED · ' + (withSummary.length - verdictCount('PASS') - verdictCount('FAIL') - verdictCount('UNCOMMITTED')) + ' other');
  out.push('  total verify time: ' + fmtMin(totalSeconds) + ' min across ' + withSummary.length + ' runs (runs without summary carry no timing)');

  // Each waves/night-*.md opens a window at the time it was first committed, so
  // the page can answer "what did that night run cost" from raw records.
  const waveDir = join(root, 'waves');
  const nights = existsSync(waveDir) ? readdirSync(waveDir).filter(name => /^night-.*\.md$/.test(name)).sort() : [];
  let nightStart = null;
  let nightName = null;
  for (const night of nights) {
    const added = ((git(root, ['log', '--diff-filter=A', '--follow', '--format=%cI', '--', join('waves', night)]) || '').trim().split('\n') || []).pop();
    const start = added ? Date.parse(added) : null;
    const inside = start === null ? [] : withSummary.filter(run => run.startedAt !== null && run.startedAt >= start);
    const seconds = inside.reduce((sum, run) => sum + (run.seconds || 0), 0);
    out.push('  ' + night.slice(0, -3) + ' (file first committed ' + (added || 'missing') + '): ' + inside.length + ' runs · ' + fmtMin(seconds) + ' min');
    if (start !== null) { nightStart = start; nightName = night.slice(0, -3); }
  }
  out.push('');

  const steps = new Map();
  for (const run of withSummary) for (const step of run.steps) {
    const bucket = steps.get(step.name) || { runs: 0, failed: 0, seconds: 0, night: 0, largest: { seconds: -1, run: null } };
    bucket.runs += 1;
    if (step.exit !== 0) bucket.failed += 1;
    bucket.seconds += step.seconds || 0;
    if (nightStart !== null && run.startedAt !== null && run.startedAt >= nightStart) bucket.night += step.seconds || 0;
    if ((step.seconds || 0) > bucket.largest.seconds) bucket.largest = { seconds: step.seconds || 0, run: run.name };
    steps.set(step.name, bucket);
  }
  out.push('Verify minutes per step (sum of step seconds' + (nightName ? '; the ' + nightName + ' column is that window only' : '') + '; runs without a summary add nothing)');
  if (!steps.size) out.push('  missing — no run summaries found');
  for (const [name, bucket] of [...steps].sort((a, b) => b[1].seconds - a[1].seconds))
    out.push('  ' + name.padEnd(22) + ' ' + String(bucket.runs).padStart(3) + ' runs · ' + bucket.failed + ' failed · ' + fmtMin(bucket.seconds).padStart(6) + ' min' + (nightName ? ' (' + fmtMin(bucket.night) + ' ' + nightName + ')' : '') + ' · largest ' + bucket.largest.seconds + 's in ' + bucket.largest.run);
  out.push('');

  const waves = waveHistory(root, readWaves(root));
  const attributed = new Map();
  const leftovers = [];
  for (const run of runs) {
    const wave = run.sha ? waves.find(item => has(item.branchCommits, run.sha)) : null;
    if (wave) attributed.set(wave.id, [...(attributed.get(wave.id) || []), run]);
    else leftovers.push(run);
  }
  out.push('Runs per wave branch (a run belongs to the wave whose merged branch holds its commit)');
  for (const wave of waves) {
    const mine = attributed.get(wave.id) || [];
    const counts = mine.length + ' runs (' + mine.filter(r => r.verdict === 'PASS' && r.dirty === false).length + ' PASS · ' + mine.filter(r => r.verdict === 'FAIL').length + ' FAIL · ' + mine.filter(r => r.verdict === 'UNCOMMITTED').length + ' UNCOMMITTED · ' + mine.filter(r => r.summary !== 'ok').length + ' no summary)';
    const seconds = mine.reduce((sum, run) => sum + (run.seconds || 0), 0);
    const duration = wave.mergedAt !== null && wave.firstCommitAt !== null
      ? Math.round((wave.mergedAt - wave.firstCommitAt) / 60000) + ' min first-commit->merge (' + wave.mergeSha.slice(0, 7) + ')'
      : 'duration missing — ' + (wave.note || 'no first-commit or merge time');
    out.push('  ' + wave.id.padEnd(10) + ' ' + counts + ' · verify ' + fmtMin(seconds) + ' min · ' + duration);
  }
  if (leftovers.length) {
    const groups = new Map();
    for (const run of leftovers) {
      const key = run.sha ? sha7(run.sha) : 'unparseable-dir-name';
      groups.set(key, [...(groups.get(key) || []), run]);
    }
    out.push('  not on a wave branch: ' + leftovers.length + ' runs');
    for (const [sha, group] of groups) {
      let where = 'commit not in this repository';
      if (isCommit(root, sha)) where = isAncestor(root, sha, 'master') ? 'on master between waves' : 'commit exists but is on no merged wave branch (superseded or abandoned work)';
      out.push('    ' + sha + ' x' + group.length + ' — ' + where + ' (' + group.map(run => run.name.slice(0, 19)).join(', ') + ')');
    }
  }
  out.push('');

  out.push('Largest costs');
  [...steps].sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 3).forEach(([name, bucket], index) => out.push('  ' + (index + 1) + '. ' + name + ' — ' + fmtMin(bucket.seconds) + ' min across ' + bucket.runs + ' runs'));
  [...withSummary].sort((a, b) => (b.seconds || 0) - (a.seconds || 0)).slice(0, 3).forEach((run, index) => out.push('  single run ' + (index + 1) + ': ' + run.name + ' — ' + run.seconds + 's (' + (run.verdict || 'no verdict') + ')'));
  if (!steps.size) out.push('  missing — no run data');
  out.push('');

  const checks = checkLimits(root);
  checks.push(budgetCheck(runs));
  const failures = [];
  out.push('Kitchen limits');
  for (const check of checks) {
    const mark = check.ok === 'missing' ? 'MISSING' : check.ok ? 'ok' : 'FAIL';
    out.push('  ' + mark.padEnd(7) + ' ' + check.label + ': ' + check.actual + ' (limit ' + check.limit + ')');
    if (check.ok === false) failures.push(check.label + ': ' + check.actual + ' over limit ' + check.limit);
  }
  console.log(out.join('\n'));
  for (const failure of failures) console.error('LIMIT FAIL: ' + failure);
  if (failures.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const rootArg = process.argv.slice(2).find(arg => arg.startsWith('--root='));
  const root = (rootArg ? rootArg.slice(7) : repoRoot).replace(/[/\x5c]+$/, '');
  try { page(root); } catch (error) { console.error('kitchen-stats failed: ' + (error instanceof Error ? error.message : String(error))); process.exit(2); }
}
