import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const started = performance.now();
const root = realpathSync(fileURLToPath(new URL('../../../../..', import.meta.url)));
const stage = 'C:/Users/shout/AppData/Local/Temp/w002-b11-stage';
const evidence = '.execution/box-v4/evidence/B1.1/verification-recovery/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const hash = (base, path) => {
  const actual = realpathSync(resolve(base, path));
  const rel = relative(realpathSync(base), actual);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw new Error('Boundary escape: ' + path);
  return sha(readFileSync(actual));
};
const compare = (base, files) => Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, expected]) => {
  const actual = hash(base, path);
  return { path, expected, actual, matches: actual === expected };
});
const r3 = json(evidence + 'candidate-manifest-r3.json').candidateFiles;
const r8 = json(evidence + 'harness-review-r8-final.json').candidateFiles;
const inputs = json(evidence + 'review-inputs-r8.json');
const omitted = new Set(['scripts/docker.mjs', 'scripts/vitest.config.mjs', 'scripts/box-verification/fixture-command-manifest.json', 'scripts/box-verification/fixture-exec-client.mjs', 'scripts/box-verification/fixture-exec-host.mjs', 'tests/box/auth/support.ts']);
const protectedFiles = Object.fromEntries(Object.entries(r3).filter(([path]) => !omitted.has(path)));
const groups = {
  current14: compare(root, r8),
  protected16: compare(root, protectedFiles),
  oldStaged22: compare(stage, r3),
  auxiliaryHost6: compare(root, inputs.auxiliarySourceFiles),
  auxiliaryStage6: compare(stage, inputs.auxiliarySourceFiles)
};
const mailboxRoot = resolve(stage, '.verification-mailbox');
const metadata = directory => readdirSync(resolve(mailboxRoot, directory)).sort().map(name => {
  const file = resolve(mailboxRoot, directory, name);
  const stat = statSync(file);
  return { name, bytes: stat.size, modifiedMs: stat.mtimeMs };
});
const requests = metadata('requests');
const responses = metadata('responses');
const responseNames = new Set(responses.map(row => row.name));
const mailbox = {
  requests: requests.length,
  responses: responses.length,
  unanswered: requests.filter(row => !responseNames.has(row.name)).map(row => row.name),
  metadataSha256: sha(JSON.stringify({ requests, responses, state: metadata('state') })),
  payloadsRead: false,
  replayPermitted: false
};
const git = args => execFileSync('git', ['-c', 'safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp', ...args], { cwd: root, encoding: 'utf8' }).trim();
const leaseFiles = readdirSync(resolve(root, evidence)).filter(name => /^team-lease.*\.json$/.test(name));
const leases = leaseFiles.map(name => {
  const path = evidence + name;
  const data = json(path);
  return { path, sha256: hash(root, path), status: data.leaseStatus };
});
const bindings = ['.execution/box-v4/briefings/W002-D1-r2.md', '.execution/box-v4/approvals/W002-D1-r2-approval.json', '.execution/box-v4/approvals/W002-hold-diagnosis-20261005.json', evidence + 'candidate-manifest-r3.json', evidence + 'harness-review-r8-final.json', evidence + 'review-inputs-r8.json'];
const result = {
  observedAt: new Date().toISOString(), root, stage,
  head: git(['rev-parse', 'HEAD']), index: git(['diff', '--cached', '--name-status']),
  candidateMapSha256: sha(JSON.stringify(Object.fromEntries([...Object.entries(protectedFiles), ...Object.entries(r8)].sort(([a], [b]) => a.localeCompare(b))))),
  groups, mismatches: Object.values(groups).flat().filter(row => !row.matches), mailbox, leases,
  historicalBindings: Object.fromEntries(bindings.map(path => [path, hash(root, path)])),
  elapsedMs: performance.now() - started,
  meaning: 'Read-only byte/metadata reconciliation. No candidate execution, DB query, lifecycle operation, lease transfer or agent-shutdown claim.'
};
const state = json('.execution/box-v4/state.json');
const wave = json('.execution/box-v4/waves/W002.json');
const reconciliation = json(evidence + 'ownership-reconciliation-d1-r3.json');
result.pendingGovernance = {
  stateProposal: state.nextProposal,
  waveProposal: wave.pendingProposal,
  currentApproval: state.currentApproval,
  hold: state.executionHold.status,
  leaseGranted: state.executionHold.productLeaseGranted,
  resumeAuthorized: state.executionHold.resumeAuthorized,
  canonicalTaskLease: state.tasks['B1.1'].lease,
  executionPermitted: state.dispatchStop.executionPermitted,
  budget: state.pendingRecoveryBudget,
  budgetConsistent: JSON.stringify(state.pendingRecoveryBudget) === JSON.stringify(wave.pendingRecoveryBudget) && state.pendingRecoveryBudget.chargedMinutes === reconciliation.budget.chargedAtFreezeMinutes
};
result.proposalFiles = Object.fromEntries(['.execution/box-v4/briefings/W002-D1-r3.md', evidence + 'ownership-reconciliation-d1-r3.json', evidence + 'ownership-check-d1-r3.mjs'].map(path => [path, hash(root, path)]));
const failed = result.mismatches.length || result.index || leases.some(row => !row.status?.startsWith('inactive')) || state.currentApproval !== null || state.executionHold.status !== 'held' || state.executionHold.productLeaseGranted || state.executionHold.resumeAuthorized || state.dispatchStop.executionPermitted || !result.pendingGovernance.budgetConsistent || state.nextProposal !== wave.pendingProposal;
const output = process.argv.includes('--summary') ? { ...result, groups: Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, { count: rows.length, mismatches: rows.filter(row => !row.matches).length }])) } : result;
console.log(JSON.stringify(output, null, 2));
if (failed) process.exitCode = 1;
