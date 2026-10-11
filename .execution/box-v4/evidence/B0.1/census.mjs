// B0.1 (W001) census digest generator — read-only traversal; writes only census-digests.json.
// Run: node .execution/box-v4/evidence/B0.1/census.mjs  (from repo root)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.runtime', 'secrets']);
const SKIP_FILES = new Set(['.env']);
const isSkipped = (name) => SKIP_DIRS.has(name) || name.startsWith('.env.');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (isSkipped(e.name)) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (e.isFile() && !SKIP_FILES.has(e.name)) out.push(fp);
  }
  return out;
}
const allFiles = walk(root, []).map(rel).sort();

// --- glob matcher for legacy writePaths (supports **, *, ?) ---
function globToRe(g) {
  let r = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') { if (g[i + 1] === '*') { r += '.*'; i++; } else r += '[^/]*'; }
    else if (c === '?') r += '[^/]';
    else r += /[a-zA-Z0-9]/.test(c) ? c : '\\' + c;
  }
  return new RegExp('^' + r + '$');
}
const match = (glob) => allFiles.filter((f) => globToRe(glob).test(f));

const files = {};
const digestFile = (p) => {
  if (files[p]) return files[p];
  try {
    const buf = fs.readFileSync(path.join(root, p));
    files[p] = { sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
  } catch { files[p] = { sha256: null, bytes: null, missing: true }; }
  return files[p];
};
const compDigest = (list) => crypto.createHash('sha256')
  .update(list.map((p) => p + '\0' + files[p].sha256).join('\n')).digest('hex');

// --- component groups (major product directories) ---
const componentRoots = [
  'apps/contributor-portal/', 'apps/private-console/',
  'services/private-api/', 'services/external-api/', 'services/runner-controller/',
  'packages/contracts/', 'packages/planner/', 'packages/analyzer/', 'packages/compiler/',
  'packages/evaluation/', 'packages/runner-protocol/',
  'db/', 'infra/', 'scripts/', 'tests/', 'templates/', 'examples/',
];
const rootFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json',
  '.node-version', '.gitattributes', '.gitignore', 'AGENTS.md', 'START.md', 'PLAN.md', 'README.md'];

const components = {};
for (const r of componentRoots) {
  const list = allFiles.filter((f) => f.startsWith(r) && !f.includes('/dist/'));
  for (const f of list) digestFile(f);
  components[r] = { files: list, fileCount: list.length, componentSha256: compDigest(list) };
}
const rf = rootFiles.filter((f) => allFiles.includes(f));
rf.forEach(digestFile);
components['<root manifests>'] = { files: rf, fileCount: rf.length, componentSha256: compDigest(rf) };

// --- legacy task records: resolve writePaths ---
const graph = JSON.parse(fs.readFileSync('tasks/task-graph.json', 'utf8'));
const state = JSON.parse(fs.readFileSync('.execution/state.json', 'utf8'));
const tasks = {};
for (const t of graph.tasks) {
  const s = state.tasks[t.id] || {};
  const all = [...new Set((t.writePaths || []).flatMap(match))].sort();
  for (const f of all) digestFile(f);
  const manifestPaths = [];
  if (s.revision && s.revision.manifest) manifestPaths.push(s.revision.manifest);
  if (s.previousAccepted && s.previousAccepted.revision) manifestPaths.push(s.previousAccepted.revision.manifest);
  for (const h of s.reviewHistory || []) if (h.revision && h.revision.manifest) manifestPaths.push(h.revision.manifest);
  for (const m of manifestPaths) digestFile(m);
  tasks[t.id] = {
    title: t.title, milestone: t.milestone, status: s.status, implementationStatus: s.implementationStatus,
    independentReviewStatus: s.independentReviewStatus, revisionDigest: s.revision && s.revision.digest,
    blockers: s.blockers || [], writePathGlobs: t.writePaths || [], resolvedPaths: all,
    pathsSha256: compDigest(all), manifests: manifestPaths,
  };
}

// --- governance / evidence-integrity files ---
const govGlobs = [
  'docs/**', 'milestones/**', 'tasks/*.json',
  '.execution/state.json', '.execution/ACTIVE_PLAN.json', '.execution/PROTOCOL.md',
  '.execution/plan-validation.json', '.execution/handoffs/**', '.execution/box-v4/**',
  '.devin/config.json', '.devin/rules/**', '.cursor/rules/**',
];
const SELF = '.execution/box-v4/evidence/B0.1/census-digests.json';
const govFiles = [...new Set(govGlobs.flatMap(match))].sort().filter((f) => f !== SELF);
govFiles.forEach(digestFile);
const governance = { files: govFiles, fileCount: govFiles.length, componentSha256: compDigest(govFiles) };

// --- preservation-baseline drift comparison ---
const baseline = JSON.parse(fs.readFileSync('.execution/box-v4/preservation-baseline.json', 'utf8'));
const drift = { matched: 0, mismatched: [], missing: [], baselineCount: baseline.files.length };
const baselineSet = new Set(baseline.files.map((e) => e.path));
for (const e of baseline.files) {
  const cur = digestFile(e.path);
  if (cur.missing) drift.missing.push(e.path);
  else if (cur.sha256 !== e.sha256) drift.mismatched.push({ path: e.path, baseline: e.sha256, current: cur.sha256 });
  else drift.matched++;
}
const newUnderProductRoots = allFiles.filter((f) =>
  !baselineSet.has(f) && componentRoots.some((r) => f.startsWith(r)));

const out = {
  schemaVersion: 1,
  task: 'B0.1', wave: 'W001',
  generatedAt: new Date().toISOString(),
  hostNote: 'Windows dev host; sha256 over raw file bytes; node_modules, dist, .git, .runtime, secrets, .env* excluded by policy',
  components, governance, tasks,
  preservationBaselineDrift: drift,
  newFilesUnderProductRootsNotInBaseline: newUnderProductRoots,
  files,
};
fs.writeFileSync(path.join(root, '.execution/box-v4/evidence/B0.1/census-digests.json'), JSON.stringify(out, null, 1));

console.log('total files hashed:', Object.keys(files).length);
console.log('baseline matched:', drift.matched, 'mismatched:', drift.mismatched.length, 'missing:', drift.missing.length);
for (const m of drift.mismatched) console.log('DRIFT', m.path, m.baseline.slice(0, 12), '->', m.current.slice(0, 12));
for (const m of drift.missing) console.log('MISSING', m);
console.log('new under product roots:', newUnderProductRoots.length);
for (const f of newUnderProductRoots) console.log('NEW', f);
for (const [k, v] of Object.entries(components)) console.log('COMP', k, v.fileCount, v.componentSha256.slice(0, 16));
for (const [id, t] of Object.entries(tasks)) console.log('TASK', id, t.status, t.resolvedPaths.length, 'paths', t.pathsSha256.slice(0, 12));
