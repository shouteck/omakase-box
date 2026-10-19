// Prints one page of honest kitchen numbers from .kitchen/runs and Git, so the
// K5/K6/K7 speed waves measure instead of guess. Read-only: nothing here writes
// outside stdout. scripts/verify.mjs reuses readRuns/stallCheck for its STALL
// line, and tests/kitchen drives the same functions on fabricated run dirs.
//
//   node scripts/kitchen-stats.mjs [--root=<dir>] [--budget=<seconds>]
//
// --budget configures an explicit executed-seconds limit on the acceptance
// profile. With no flag the profile is reported unbudgeted (see budgetCheck).
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
// K37: a summary's (or start marker's) load snapshot, sanitized field by
// field. Old records carry none (null); malformed ones keep the fields that
// parse and lose the rest. `loadAverage.supported === false` means the
// platform stubbed the metric (Windows) — never an observed zero.
function sanitizeLoad(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const la = raw.loadAverage && typeof raw.loadAverage === 'object' ? raw.loadAverage : {};
  const cpu = raw.cpu && typeof raw.cpu === 'object' ? raw.cpu : {};
  const mem = raw.memory && typeof raw.memory === 'object' ? raw.memory : {};
  return {
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : null,
    platform: typeof raw.platform === 'string' ? raw.platform : null,
    logicalCores: typeof cpu.logicalCores === 'number' ? cpu.logicalCores : null,
    memoryFreeBytes: typeof mem.freeBytes === 'number' ? mem.freeBytes : null,
    loadAverage: {
      supported: la.supported === true,
      five: typeof la.five === 'number' ? la.five : null,
      note: typeof la.note === 'string' ? la.note : null,
    },
  };
}

export function readRuns(runsDir) {
  if (!existsSync(runsDir)) return [];
  const runs = [];
  for (const name of readdirSync(runsDir).sort()) {
    const dir = join(runsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const match = name.match(/^(.*)-([0-9a-f]{7,40})$/);
    const dirStamp = Date.parse((match ? match[1] : name).replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1T$2:$3:$4.$5Z'));
    const run = { name, sha: match ? match[2] : null, startedAt: Number.isNaN(dirStamp) ? null : dirStamp, seconds: null, verdict: null, dirty: null, steps: [], summary: 'missing', start: 'missing', load: null, loadFrom: null };
    // K34: started.json — the record verify writes when the run directory is
    // created — can make an unfinished run legible (planned steps, flags,
    // dirty-at-start). It is never authoritative: its facts are used only
    // when they agree with the directory name verify itself minted (sha
    // prefix and timestamp), so a forged or transplanted marker changes the
    // label, never the attribution, and it can never stand in for a
    // completed summary.json.
    const startPath = join(dir, 'started.json');
    if (existsSync(startPath)) {
      try {
        const marker = JSON.parse(readFileSync(startPath, 'utf8'));
        const markerSha = typeof marker.sha === 'string' ? marker.sha : null;
        const markerAt = Date.parse(marker.startedAt);
        const agrees = markerSha !== null && run.sha !== null && markerSha.startsWith(run.sha)
          && !Number.isNaN(markerAt) && markerAt === run.startedAt;
        if (agrees) {
          run.start = 'ok';
          run.plannedSteps = Array.isArray(marker.steps) ? marker.steps.map(String) : [];
          run.startedDirty = typeof marker.dirty === 'boolean' ? marker.dirty : null;
          run.flags = marker.flags && typeof marker.flags === 'object' && marker.flags !== null ? { only: !!marker.flags.only, fresh: !!marker.flags.fresh, full: !!marker.flags.full } : {};
          run.load = sanitizeLoad(marker.load);
          if (run.load !== null) run.loadFrom = 'started';
        } else run.start = 'mismatched';
      } catch { run.start = 'malformed'; }
    }
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
        run.notRun = Array.isArray(parsed.notRun) ? parsed.notRun.map(String) : [];
        const summaryLoad = sanitizeLoad(parsed.load);
        if (summaryLoad !== null) { run.load = summaryLoad; run.loadFrom = 'summary'; }
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

// K35 (P2/P8): the living station cards are the only active cards, each bounded
// at CARD_LIMIT_BYTES UTF-8 bytes, and retired roles/stations (station-chef,
// service-data, console) must not survive as live instructions or options in
// any file a dispatch reads. LIVE_RULE_FILES is the fixed half of that set —
// the host routing adapters and the brigade/template documents; role files and
// station cards are enumerated from their directories, so a new card or role
// is measured without an edit here. suite.mjs imports the same list so every
// path a kitchen test reads also triggers test:kitchen and the hosted run.
export const CARD_LIMIT_BYTES = 12288;
export const LIVE_RULE_FILES = [
  'kitchen/README.md',
  'templates/wave.md',
  '.devin/rules/box-kitchen.md',
  '.claude/skills/kitchen/SKILL.md',
  '.cursor/rules/box-kitchen.mdc',
  '.devin/plugins/box-pstack/skills/poteto-mode/SKILL.md',
  '.devin/plugins/box-pstack/DEVIN-COMPATIBILITY.md',
];
const RETIRED_TOKENS = [/\bstation[- ]chef\b/i, /\bbox-station-chef\b/i, /\bservice-data\b/i, /\bstations\/console\b/i];
function ruleFiles(root) {
  const files = ['AGENTS.md', 'docs/box-v4/KITCHEN.md', ...LIVE_RULE_FILES];
  const rolesDir = join(root, 'kitchen', 'roles');
  if (existsSync(rolesDir)) for (const name of readdirSync(rolesDir).filter(name => name.endsWith('.md')).sort()) files.push(join('kitchen', 'roles', name));
  return files;
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

  // K35: living cards are bounded; retired names are not live options; every
  // station a dispatch can name has a card and every card is named.
  const stationsDir = join(root, 'kitchen', 'stations');
  const cards = existsSync(stationsDir) ? readdirSync(stationsDir).filter(name => name.endsWith('.md')).sort() : [];
  if (!cards.length) checks.push({ label: 'living station cards', actual: 'missing', limit: `each <= ${CARD_LIMIT_BYTES} B`, ok: 'missing' });
  for (const card of cards) {
    const bytes = Buffer.byteLength(fileText(root, join('kitchen', 'stations', card)) ?? '');
    checks.push({ label: `living card kitchen/stations/${card} size`, actual: bytes + ' B', limit: `${CARD_LIMIT_BYTES} B`, ok: bytes <= CARD_LIMIT_BYTES });
  }
  const scanned = ruleFiles(root).map(name => ({ name, text: fileText(root, name) })).filter(item => item.text !== null);
  if (!scanned.length) checks.push({ label: 'retired role/station names absent from live rules', actual: 'missing', limit: 'none', ok: 'missing' });
  else {
    const hits = [];
    for (const { name, text } of scanned) for (const token of RETIRED_TOKENS) if (token.test(text)) hits.push(`${name} matches ${token}`);
    checks.push({ label: 'retired role/station names absent from live rules', actual: hits.length ? hits.join('; ') : 'none', limit: 'none', ok: hits.length === 0 });
  }
  const readme = fileText(root, 'kitchen/README.md');
  const template = fileText(root, 'templates/wave.md');
  if (readme === null || template === null) checks.push({ label: 'station listings match living cards', actual: 'missing', limit: 'exactly the cards on disk', ok: 'missing' });
  else {
    const named = new Set([...readme.matchAll(/stations\/([a-z0-9-]+)\.md/g)].map(match => match[1] + '.md'));
    const slot = (template.match(/Station:\s*<([^>]+)>/) || [])[1] || '';
    for (const option of slot.split('|').map(name => name.trim()).filter(Boolean)) named.add(option + '.md');
    const missing = [...named].filter(name => !cards.includes(name));
    const unlisted = cards.filter(name => !named.has(name));
    const actual = [...missing.map(name => `listed without card: ${name}`), ...unlisted.map(name => `card not listed: ${name}`)].join('; ') || 'match';
    checks.push({ label: 'station listings match living cards', actual, limit: 'exactly the cards on disk', ok: missing.length === 0 && unlisted.length === 0 });
  }
  return checks;
}

export const ACCEPTANCE_PROFILE = 'verify --full test:box-bounty test:kitchen';
export const ACCEPTANCE_STEPS = ['check', 'build', 'test:box-bounty', 'test:kitchen'];
// K29 correction: the 330-second K6 ratchet was calibrated for the retired
// exporter profile `verify --full test:box-package`; it never described the
// bounty workload, so its enforcement retired with its subject — not raised,
// not transplanted (K6's no-auto-rise rule). The surviving profile has no
// calibrated budget: the check reports the executed seconds and says so.
// budgetSeconds is a real limit only when a caller configures one.
export const RETIRED_EXPORTER_BUDGET_SECONDS = 330;
export function budgetCheck(runs, { profile = ACCEPTANCE_PROFILE, steps = ACCEPTANCE_STEPS, budgetSeconds = null } = {}) {
  const label = `acceptance profile "${profile}" executed seconds`;
  const limit = typeof budgetSeconds === 'number' ? `${budgetSeconds}s` : `none calibrated — K29 retired the ${RETIRED_EXPORTER_BUDGET_SECONDS}s exporter ratchet with test:box-package`;
  // The latest run dir that could be a profile observation is the only thing
  // judged: a valid run of this profile, or one whose summary is missing or
  // unparseable and so cannot be scoped to any profile. Uncertainty is judged
  // invalid — never skipped toward an older pass.
  const candidates = runs.filter(run => run.summary !== 'ok' || run.profile === profile);
  if (!candidates.length) return { label, actual: 'missing', limit, ok: 'missing' };
  const latest = candidates[candidates.length - 1];
  const invalid = reason => ({ label, actual: `invalid latest run ${latest.name}: ${reason}`, limit, ok: 'missing' });
  if (latest.summary !== 'ok') return invalid(`summary ${latest.summary}`);
  if (latest.verdict !== 'PASS' || latest.dirty !== false) return invalid(`verdict ${latest.verdict ?? 'missing'}${latest.dirty !== false ? ', dirty tree' : ''}`);
  const bad = latest.steps.find(step => step.reused || step.exit !== 0 || typeof step.seconds !== 'number' || !Number.isFinite(step.seconds) || step.seconds < 0);
  if (bad) return invalid(`step ${bad.name} ${bad.reused ? 'was reused' : bad.exit !== 0 ? `exited ${bad.exit}` : 'seconds missing or invalid'}`);
  const missingStep = steps.find(name => !latest.steps.some(step => step.name === name));
  if (missingStep) return invalid(`profile step ${missingStep} missing`);
  const executed = latest.steps.reduce((sum, step) => sum + step.seconds, 0);
  if (!(executed > 0)) return invalid('zero executed seconds');
  // With no configured budget there is nothing to exceed: the seconds are
  // reported and named as unbudgeted, never silently passed nor failed.
  if (typeof budgetSeconds !== 'number') return { label, actual: `${executed}s`, limit, ok: true };
  return { label, actual: `${executed}s`, limit, ok: executed <= budgetSeconds };
}

// --- git helpers (read-only) --------------------------------------------------

const BACKSLASH = String.fromCharCode(92);
const forwardSlash = path => path.replace(/[/\x5c]+$/, '').replaceAll(BACKSLASH, '/');
// Every Git spawn this page makes funnels through here so tests can count them
// (K11: the count must not grow with the number of run records). The count is
// printed to stderr only when KITCHEN_STATS_GIT_TRACE is set.
let gitProcesses = 0;
function git(root, args, options = {}) {
  gitProcesses += 1;
  const run = spawnSync('git', ['-c', 'safe.directory=' + forwardSlash(root), ...args], { cwd: root, encoding: 'utf8', windowsHide: true, ...options });
  return run.status === 0 ? run.stdout : null;
}
// The page used to start Git once per run record (K11: 252 records cost ~470
// spawns). Everything it needs now comes from a fixed set of reads instead:
// one `git log --all` for the commit graph, one `rev-parse`/`for-each-ref` for
// master and the branch tips, and one `cat-file --batch-check` that resolves
// every leftover sha at once. Ancestor questions become set lookups, so the
// spawn count stays fixed however many records .kitchen/runs holds.

// sha -> { at: commit time in ms, parents: [sha] } for every commit reachable
// from any ref. Empty when root is not a repository; callers then report
// missing, matching the old failed-command behaviour.
function commitGraph(root) {
  const nodes = new Map();
  const text = git(root, ['log', '--all', '--format=%H %cI %P']);
  if (text === null) return nodes;
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2 || !/^[0-9a-f]{40}$/.test(parts[0])) continue;
    nodes.set(parts[0], { at: Date.parse(parts[1]), parents: parts.slice(2) });
  }
  return nodes;
}

// A full sha for a name only when it is exactly or uniquely prefix-matched in
// the graph — the resolution `git` applies to abbreviated shas.
function resolveSha(graph, name) {
  if (typeof name !== 'string') return null;
  if (graph.has(name)) return name;
  if (!/^[0-9a-f]{4,39}$/.test(name)) return null;
  let found = null;
  for (const sha of graph.keys()) {
    if (sha.startsWith(name)) {
      if (found !== null) return null;
      found = sha;
    }
  }
  return found;
}

// One batch answers "is this name a commit" for every leftover sha at once;
// missing, ambiguous or non-commit input maps to null — the same failures the
// old per-name `cat-file -t` returned. Batch output is one line per input in
// order; a mismatched count degrades every name to null rather than guessing.
function resolveCommits(root, names) {
  const resolved = new Map(names.map(name => [name, null]));
  if (!names.length) return resolved;
  const text = git(root, ['cat-file', '--batch-check'], { input: names.join('\n') + '\n' });
  if (text === null) return resolved;
  const lines = text.split('\n').filter(line => line.trim() !== '');
  if (lines.length !== names.length) return resolved;
  names.forEach((name, index) => {
    const parts = lines[index].trim().split(/\s+/);
    if (parts[1] === 'commit' && (parts[0] === name || (name.length < 40 && parts[0].startsWith(name)))) resolved.set(name, parts[0]);
  });
  return resolved;
}

// Everything `git log <root>` would need to answer ancestor questions: the
// commit graph, master's tip, the local branch tips, and a memoized ancestor
// walk — `isAncestor(sha, x)` becomes `repo.anc(x).has(sha)`, start included.
function repoView(root) {
  const graph = commitGraph(root);
  const tip = (git(root, ['rev-parse', '--verify', 'master^{commit}']) || '').trim();
  const masterTip = /^[0-9a-f]{40}$/.test(tip) ? tip : null;
  const tips = new Map();
  for (const line of (git(root, ['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads/']) || '').split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 2) tips.set(parts[0], parts[1]);
  }
  const cache = new Map();
  const anc = start => {
    let seen = cache.get(start);
    if (seen) return seen;
    seen = new Set();
    const stack = [start];
    while (stack.length) {
      const sha = stack.pop();
      if (seen.has(sha)) continue;
      seen.add(sha);
      const node = graph.get(sha);
      if (node) stack.push(...node.parents);
    }
    cache.set(start, seen);
    return seen;
  };
  return { graph, masterTip, tips, anc };
}

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

// Branch commits and first-commit-to-merge duration per wave, all read from
// the commit graph in repo. A wave whose record is incomplete reports
// "missing", never a guess.
function waveHistory(root, waves, repo) {
  const history = [];
  // `git log --first-parent master` in graph form: first-parent chain from the
  // tip; the merges are the chain nodes with two parents, in the same order.
  const merges = [];
  for (let sha = repo.masterTip, seen = new Set(); sha && !seen.has(sha);) {
    seen.add(sha);
    const node = repo.graph.get(sha);
    if (!node) break;
    if (node.parents.length >= 2) merges.push({ sha, at: node.at, parent1: node.parents[0], parent2: node.parents[1] });
    sha = node.parents[0];
  }
  for (const wave of waves) {
    const entry = { id: wave.id, branchCommits: [], firstCommitAt: null, mergedAt: null, mergeSha: null, note: null };
    let merge = wave.merge ? merges.find(item => item.sha.startsWith(wave.merge)) || null : null;
    if (!merge && wave.commits.length) {
      merge = merges.find(item => wave.commits.some(name => {
        const sha = resolveSha(repo.graph, name);
        return sha !== null && repo.anc(item.parent2).has(sha) && !repo.anc(item.parent1).has(sha);
      })) || null;
    }
    if (merge) {
      entry.mergeSha = merge.sha;
      entry.mergedAt = merge.at;
      // rev-list parent1..parent2: on the merged branch, not already on master.
      const onMaster = repo.anc(merge.parent1);
      entry.branchCommits = [...repo.anc(merge.parent2)].filter(sha => !onMaster.has(sha));
      // rev-list prints newest first, so the branch's first commit is the one
      // with the earliest commit time.
      const times = entry.branchCommits.map(sha => repo.graph.get(sha)).filter(node => node && !Number.isNaN(node.at)).map(node => node.at);
      entry.firstCommitAt = times.length ? Math.min(...times) : null;
      if (entry.firstCommitAt === null) entry.note = 'merge found but first commit unreadable';
    } else {
      const branch = wave.branches.find(name => repo.tips.has(name));
      if (branch) {
        // rev-list (merge-base master branch)..branch. A merge-base is a
        // common ancestor no other common ancestor descends from; when the
        // graph yields exactly one the range is a set difference. Ambiguous
        // ancestry (criss-cross merges — not this history) asks Git directly.
        const onBranch = repo.anc(repo.tips.get(branch));
        const onMaster = repo.masterTip ? repo.anc(repo.masterTip) : new Set();
        const common = [...onBranch].filter(sha => onMaster.has(sha));
        const dominated = new Set();
        for (const sha of common) for (const s of repo.anc(sha)) if (s !== sha) dominated.add(s);
        const bases = common.filter(sha => !dominated.has(sha));
        if (bases.length === 1) {
          const underBase = repo.anc(bases[0]);
          entry.branchCommits = [...onBranch].filter(sha => !underBase.has(sha));
        } else if (bases.length > 1) {
          const base = (git(root, ['merge-base', 'master', branch]) || '').trim();
          entry.branchCommits = base ? (git(root, ['rev-list', base + '..' + branch]) || '').split('\n').filter(Boolean) : [];
        }
        entry.note = 'not merged — local branch ' + branch;
      } else entry.note = 'no merged branch or recorded merge found';
    }
    history.push(entry);
  }
  return history;
}

// --- comparable-duration advisory (K37 P10) -----------------------------------

// A duration observation is eligible only when it describes one fully
// executed invocation: a parseable summary on a clean tree, the whole step
// plan attempted (notRun empty), no step reused, and a valid positive wall
// time. Reused invocations, dirty runs, incomplete plans and missing or
// invalid durations are excluded — they say nothing honest about duration.
function durationEligible(run) {
  return run.summary === 'ok' && run.dirty === false
    && Array.isArray(run.notRun) && run.notRun.length === 0
    && run.steps.length > 0 && run.steps.every(step => step.reused === null && typeof step.seconds === 'number' && Number.isFinite(step.seconds) && step.seconds >= 0)
    && typeof run.seconds === 'number' && Number.isFinite(run.seconds) && run.seconds > 0;
}
// The comparable cohort is the same effective executed plan on the same
// platform where known: an explicit --full profile when recorded, else the
// executed step set. Platform comes only from a recorded load snapshot —
// 'unknown' runs compare only against other 'unknown' runs, never across.
const cohortPlatform = run => (run.load && run.load.platform) || 'unknown';
function cohortPlan(run) {
  if (run.profile) return 'profile ' + run.profile;
  const names = run.steps.map(step => step.name).sort();
  return names.length ? 'steps ' + names.join(',') : null;
}
const median = list => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// One advisory report per candidate run: the candidate's seconds against the
// earlier eligible runs of its own cohort (never itself — a candidate cannot
// inflate its own baseline). With `candidates` null the latest eligible run
// of each cohort is evaluated. Fewer than minEarlier earlier observations
// means 'unavailable', not a pass; strictly more than factor times the median
// flags 'outlier'. Advisory only — it names a duration outlier, never a cause
// (load, CPU or otherwise), and never touches a verdict.
export function durationAdvisory(runs, { candidates = null, minEarlier = 3, factor = 2 } = {}) {
  const cohorts = new Map();
  for (const run of runs.filter(durationEligible)) {
    const plan = cohortPlan(run);
    if (plan === null) continue;
    const key = plan + '|' + cohortPlatform(run);
    if (!cohorts.has(key)) cohorts.set(key, { plan, platform: cohortPlatform(run), eligible: [] });
    cohorts.get(key).eligible.push(run);
  }
  const reports = [];
  for (const cohort of cohorts.values()) {
    cohort.eligible.sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity));
    const mine = candidates === null ? [cohort.eligible[cohort.eligible.length - 1]] : cohort.eligible.filter(run => candidates.includes(run));
    for (const candidate of mine) {
      const earlier = cohort.eligible.filter(run => run !== candidate && (run.startedAt ?? Infinity) < (candidate.startedAt ?? Infinity));
      const base = { plan: cohort.plan, platform: cohort.platform, run: candidate.name, seconds: candidate.seconds,
        load: candidate.load ? (candidate.load.loadAverage.supported && candidate.load.loadAverage.five !== null ? 'loadavg5=' + candidate.load.loadAverage.five : 'load average not observed (' + (candidate.load.loadAverage.note || 'unsupported metric') + ')') : 'load not recorded' };
      if (earlier.length < minEarlier) {
        reports.push({ ...base, status: 'unavailable', reason: earlier.length + ' earlier eligible observations (need ' + minEarlier + ')', sources: earlier.map(run => run.name) });
        continue;
      }
      const times = earlier.map(run => run.seconds);
      const med = median(times);
      reports.push({ ...base, status: candidate.seconds > factor * med ? 'outlier' : 'within',
        n: earlier.length, median: med, min: Math.min(...times), max: Math.max(...times),
        factor, sources: earlier.map(run => run.name) });
    }
  }
  return reports;
}

// --- per-wave verification cost (K37 P10) --------------------------------------

// Read-only machine-readable totals for one wave, for the close line
// `verify: N runs, total Ns`. Attribution is by recorded sha against the
// wave's branch-commit bounds (merge second-parent minus already-on-master,
// or merge-base..branch for an unmerged branch — the same bounds the page
// uses). A run whose sha is missing, ambiguous, outside those bounds or
// unknown to the repository is counted as unattributed — never silently
// dropped, never double-counted with a sibling wave. Invocation wall seconds
// and executed step seconds are kept apart: a reused step adds nothing to
// the executed total, and the reused invocation still carries its own small
// wall time. History is local: a checkout without .kitchen/runs reports
// 'missing', not zero.
export function waveReport(root, waveId) {
  const runsDir = join(root, '.kitchen', 'runs');
  const history = existsSync(runsDir) ? 'present' : 'missing';
  const runs = history === 'present' ? readRuns(runsDir) : [];
  const repo = repoView(root);
  const waves = waveHistory(root, readWaves(root), repo);
  const wave = waves.find(item => item.id === waveId) || null;
  const report = {
    wave: waveId,
    history,
    waveRecord: wave === null ? 'missing' : 'found',
    attribution: {
      method: 'run sha resolved against the wave branch commits: rev-list merge.parent1..merge.parent2 for a merged wave, merge-base..branch for an unmerged one',
      merge: wave && wave.mergeSha ? wave.mergeSha : null,
      branchCommits: wave ? wave.branchCommits.length : 0,
      limits: 'attribution is by recorded commit only — a correction or sibling sharing these exact bounds counts here; a run on a commit outside them never does',
    },
    runs: { attributed: 0, withSummary: 0, missingSummary: 0, malformedSummary: 0, verdicts: { PASS: 0, FAIL: 0, UNCOMMITTED: 0, other: 0, unfinished: 0 } },
    wallSeconds: { known: 0, missing: 0 },
    executedStepSeconds: { known: 0, stepsMissingSeconds: 0 },
    runIds: [],
    unattributed: { count: 0, ids: [], note: 'runs outside the wave bounds; first 50 ids listed' },
    durationAdvisory: [],
    provenance: 'local ' + runsDir + (history === 'missing' ? ' — absent: a fresh clone has no run history, reported missing not zero' : ''),
  };
  if (wave === null) { report.error = 'no wave record ' + waveId + ' in waves/ or no merge/branch found'; }
  const bounds = wave ? new Set(wave.branchCommits) : new Set();
  const attributedRuns = [];
  for (const run of runs) {
    const full = resolveSha(repo.graph, run.sha);
    if (full !== null && bounds.has(full)) { attributedRuns.push(run); report.runIds.push(run.name); }
    else { report.unattributed.count += 1; if (report.unattributed.ids.length < 50) report.unattributed.ids.push(run.name); }
  }
  for (const run of attributedRuns) {
    report.runs.attributed += 1;
    if (run.summary === 'ok') {
      report.runs.withSummary += 1;
      report.runs.verdicts[run.verdict === 'PASS' || run.verdict === 'FAIL' || run.verdict === 'UNCOMMITTED' ? run.verdict : 'other'] += 1;
    } else if (run.summary === 'malformed') report.runs.malformedSummary += 1;
    else { report.runs.missingSummary += 1; report.runs.verdicts.unfinished += 1; }
    if (typeof run.seconds === 'number' && Number.isFinite(run.seconds)) report.wallSeconds.known += run.seconds;
    else report.wallSeconds.missing += 1;
    for (const step of run.steps) {
      if (step.reused !== null) continue; // a reused step executed nothing here
      if (typeof step.seconds === 'number' && Number.isFinite(step.seconds)) report.executedStepSeconds.known += step.seconds;
      else report.executedStepSeconds.stepsMissingSeconds += 1;
    }
  }
  report.line = 'verify: ' + report.runs.attributed + ' runs, total ' + report.wallSeconds.known + 's'
    + (report.wallSeconds.missing ? ' (' + report.wallSeconds.missing + ' runs without a recorded wall time)' : '');
  report.durationAdvisory = durationAdvisory(runs, { candidates: attributedRuns });
  return report;
}

// --- the page -----------------------------------------------------------------

const fmtMin = seconds => (seconds / 60).toFixed(1);
const sha7 = sha => (sha || '???????').slice(0, 7);
const has = (list, sha) => typeof sha === 'string' && (list.includes(sha) || (sha.length < 40 && list.some(full => full.startsWith(sha))));

function page(root, { budgetSeconds = null } = {}) {
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
  const withoutLabel = run => run.summary === 'malformed' ? ' (malformed summary)'
    : run.start === 'ok' ? ` (started, unfinished — running or interrupted; planned ${run.plannedSteps.length ? run.plannedSteps.join(',') : 'missing'}${run.startedDirty === true ? ', dirty at start' : ''})`
    : run.start === 'malformed' ? ' (malformed started.json)'
    : run.start === 'mismatched' ? ' (started.json disagrees with the dir name)'
    : ' (no start record — predates K34 or died before the marker)';
  out.push('  ' + withSummary.length + ' runs with summary.json · ' + without.length + ' without — ' + (without.length ? without.map(run => run.name + withoutLabel(run)).join(', ') : 'none'));
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

  const repo = repoView(root);
  const waves = waveHistory(root, readWaves(root), repo);
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
    const resolved = resolveCommits(root, [...groups.keys()]);
    const onMaster = repo.masterTip ? repo.anc(repo.masterTip) : null;
    for (const [sha, group] of groups) {
      let where = 'commit not in this repository';
      const full = resolved.get(sha);
      if (full !== null && full !== undefined) where = onMaster !== null && onMaster.has(full) ? 'on master between waves' : 'commit exists but is on no merged wave branch (superseded or abandoned work)';
      out.push('    ' + sha + ' x' + group.length + ' — ' + where + ' (' + group.map(run => run.name.slice(0, 19)).join(', ') + ')');
    }
  }
  out.push('');

  out.push('Largest costs');
  [...steps].sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 3).forEach(([name, bucket], index) => out.push('  ' + (index + 1) + '. ' + name + ' — ' + fmtMin(bucket.seconds) + ' min across ' + bucket.runs + ' runs'));
  [...withSummary].sort((a, b) => (b.seconds || 0) - (a.seconds || 0)).slice(0, 3).forEach((run, index) => out.push('  single run ' + (index + 1) + ': ' + run.name + ' — ' + run.seconds + 's (' + (run.verdict || 'no verdict') + ')'));
  if (!steps.size) out.push('  missing — no run data');
  out.push('');

  // K37: duration compared only to a documented comparable cohort — same
  // executed plan and recorded platform — and only as an advisory. A flag is
  // a duration outlier, never a cause (high load included), never a verdict,
  // and a rerun never erases the first failed attempt.
  out.push('Duration vs comparable runs (advisory — an outlier is a slow observation, not a cause or a verdict)');
  const advisories = durationAdvisory(runs);
  if (!advisories.length) out.push('  missing — no eligible duration observations');
  for (const report of advisories) {
    if (report.status === 'unavailable') out.push('  ' + report.plan + ' on ' + report.platform + ': ' + report.run + ' ' + report.seconds + 's — comparison unavailable, ' + report.reason + '; ' + report.load);
    else out.push('  ' + report.plan + ' on ' + report.platform + ': ' + report.run + ' ' + report.seconds + 's vs median ' + report.median + 's (n=' + report.n + ', range ' + report.min + '-' + report.max + 's, sources ' + report.sources.join(', ') + '; ' + report.load + ')' + (report.status === 'outlier' ? ' — OUTLIER >' + report.factor + 'x median' : ' — within'));
  }
  out.push('');

  const checks = checkLimits(root);
  checks.push(budgetCheck(runs, { budgetSeconds }));
  const failures = [];
  out.push('Kitchen limits');
  for (const check of checks) {
    const mark = check.ok === 'missing' ? 'MISSING' : check.ok ? 'ok' : 'FAIL';
    out.push('  ' + mark.padEnd(7) + ' ' + check.label + ': ' + check.actual + ' (limit ' + check.limit + ')');
    if (check.ok === false) failures.push(check.label + ': ' + check.actual + ' over limit ' + check.limit);
  }
  console.log(out.join('\n'));
  if (process.env.KITCHEN_STATS_GIT_TRACE) console.error('git processes: ' + gitProcesses);
  for (const failure of failures) console.error('LIMIT FAIL: ' + failure);
  if (failures.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const rootArg = process.argv.slice(2).find(arg => arg.startsWith('--root='));
  const root = (rootArg ? rootArg.slice(7) : repoRoot).replace(/[/\x5c]+$/, '');
  const waveArg = process.argv.slice(2).find(arg => arg.startsWith('--wave='));
  if (waveArg !== undefined) {
    // Close-time query: machine-readable per-wave verification cost.
    // `node scripts/kitchen-stats.mjs [--root=<dir>] --wave=<id>` prints one
    // JSON document and nothing else. Read-only.
    try {
      const root = (rootArg ? rootArg.slice(7) : repoRoot).replace(/[/\x5c]+$/, '');
      console.log(JSON.stringify(waveReport(root, waveArg.slice(7)), null, 2));
      process.exit(0);
    } catch (error) { console.error('kitchen-stats --wave failed: ' + (error instanceof Error ? error.message : String(error))); process.exit(2); }
  }
  const budgetArg = process.argv.slice(2).find(arg => arg.startsWith('--budget'));
  let budgetSeconds = null;
  if (budgetArg !== undefined) {
    budgetSeconds = Number(budgetArg.startsWith('--budget=') ? budgetArg.slice(9) : NaN);
    if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0) {
      console.error('kitchen-stats: --budget=<seconds> needs a positive number of seconds');
      process.exit(2);
    }
  }
  try { page(root, { budgetSeconds }); } catch (error) { console.error('kitchen-stats failed: ' + (error instanceof Error ? error.message : String(error))); process.exit(2); }
}
