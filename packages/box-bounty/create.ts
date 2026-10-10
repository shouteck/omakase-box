import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runDeclaredCheck } from '../box-package/commands.js';
import type { CheckRecord } from '../box-package/commands.js';
import { BountyRefused } from './errors.js';
import { gitOutcome } from './git.js';
import type { BountyManifest } from './manifest.js';
import { BUILTIN_RULES, loadOwnerList } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { createSnapshot } from './snapshot.js';
import type { SnapshotFile, SnapshotRemoval } from './snapshot.js';

// `bounty create` in two phases so the preview always comes first and a refused
// bounty never leaves a folder behind:
//   planBounty     — resolve the repository, pin the working state in a snapshot
//                    commit, and classify every file; writes nothing but Git objects.
//   finalizeBounty — emit the folder into sibling staging, prove the declared check
//                    really fails on a clean copy of the finished snapshot outside
//                    the checkout, then rename into place. Refusal = no folder.

export const TOOL_VERSION = 'box-bounty@0.1.0';
const COMMAND_TIMEOUT_MS = 300_000;
const PREVIEW_NAMES_PER_RULE = 20;

export interface CreateOptions {
  readonly repoPath: string;
  readonly title: string;
  readonly taskPath: string;
  readonly notePath?: string;
  readonly setup?: readonly string[];
  readonly check?: readonly string[];
  readonly outDir: string;
}

export interface PlanFile extends SnapshotFile { readonly bytes: number }
export interface RuleRemoval { readonly rule: string; readonly removed: number; readonly paths: readonly string[] }

export interface BountyPlan {
  readonly repoRoot: string;
  readonly title: string;
  readonly task: { readonly file: string; readonly text: string };
  readonly note: { readonly file: string; readonly text: string } | null;
  readonly setup: readonly string[] | null;
  readonly check: readonly string[] | null;
  readonly level: 'mechanical' | 'reviewed';
  readonly snapshot: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  readonly files: readonly PlanFile[];
  readonly removed: readonly SnapshotRemoval[];
  readonly ruleRemovals: readonly RuleRemoval[];
  readonly totalBytes: number;
  readonly outDir: string;
}

export interface BountyResult {
  readonly id: string;
  readonly outDir: string;
  readonly plan: BountyPlan;
}

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const tail = (text: string): string => text.slice(-2000);

const toPosixPath = (path: string): string => path.split('\\').join('/');

function readTextFile(path: string, reason: string, repoRoot: string): { file: string; text: string } {
  const absolute = resolve(path);
  if (!statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
    throw new BountyRefused(reason, `file ${path} does not exist — pass a readable file`);
  }
  const text = readFileSync(absolute, 'utf8');
  if (text.trim() === '') throw new BountyRefused(reason, `file ${path} is empty — a bounty needs real content`);
  const offset = toPosixPath(relative(repoRoot, absolute));
  const file = offset === '' || offset.startsWith('../') || offset === '..' || isAbsolute(offset) ? basename(absolute) : offset;
  return { file, text };
}

function resolveRepoRoot(repoPath: string): string {
  const repo = resolve(repoPath);
  const top = gitOutcome(repo, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0 || top.stdout.trim() === '') {
    throw new BountyRefused('not-a-repository', `${repo} is not inside a Git checkout — bounty create needs a repository to snapshot`);
  }
  return realpathSync(top.stdout.trim());
}

export function planBounty(options: CreateOptions): BountyPlan {
  const title = options.title.trim();
  if (title === '') throw new BountyRefused('missing-title', 'a bounty needs a one-line --title');
  const repoRoot = resolveRepoRoot(options.repoPath);
  const task = readTextFile(options.taskPath, 'missing-task', repoRoot);
  const note = options.notePath !== undefined ? readTextFile(options.notePath, 'missing-note', repoRoot) : null;
  const ownerList = loadOwnerList(repoRoot);
  const rules: NeverShipRule[] = ownerList === null ? [...BUILTIN_RULES] : [...BUILTIN_RULES, ownerList.rule];

  const workDir = mkdtempSync(join(tmpdir(), 'box-bt1-snap-'));
  let snapshot: ReturnType<typeof createSnapshot>;
  try {
    snapshot = createSnapshot(repoRoot, workDir, rules);
  } finally {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }

  const files: PlanFile[] = snapshot.files.map(file => ({ ...file, bytes: statSync(file.realPath).size }));
  const removed = snapshot.removed;
  const ruleRemovals: RuleRemoval[] = rules
    .map(rule => ({ rule: rule.name, paths: removed.filter(entry => entry.rule === rule.name).map(entry => entry.path) }))
    .filter(entry => entry.paths.length > 0)
    .map(entry => ({ rule: entry.rule, removed: entry.paths.length, paths: entry.paths.sort() }));

  return {
    repoRoot,
    title,
    task,
    note,
    setup: options.setup !== undefined && options.setup.length > 0 ? [...options.setup] : null,
    check: options.check !== undefined && options.check.length > 0 ? [...options.check] : null,
    level: options.check !== undefined && options.check.length > 0 ? 'mechanical' : 'reviewed',
    snapshot: { commit: snapshot.commit, tree: snapshot.tree, baseCommit: snapshot.baseCommit },
    files,
    removed,
    ruleRemovals,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    outDir: resolve(options.outDir)
  };
}

const describeCommand = (argv: readonly string[]): string => argv.map(token => (token.includes(' ') ? JSON.stringify(token) : token)).join(' ');

function runOne(argv: readonly string[], name: string, root: string): CheckRecord {
  const [program, ...args] = argv;
  return runDeclaredCheck({ name, program: program!, args, cwd: '.', context: 'recipient', timeoutMs: COMMAND_TIMEOUT_MS }, root);
}

const runRecord = (record: CheckRecord, argv: readonly string[]) => ({ argv: [...argv], exit: record.exit, result: record.result, tail: tail(record.log) });

// Runs setup then the check on a clean copy of the finished snapshot outside the
// checkout, exactly as a solver would. The staged folder itself stays pristine.
function proveCheckFails(plan: BountyPlan, snapshotDir: string): BountyManifest['verification'] {
  if (plan.check === null) return null;
  const runRoot = mkdtempSync(join(tmpdir(), 'box-bt1-check-'));
  try {
    const work = join(runRoot, 'repo');
    cpSync(snapshotDir, work, { recursive: true });
    const setupRuns: { record: CheckRecord; argv: readonly string[] }[] = [];
    if (plan.setup !== null) {
      const record = runOne(plan.setup, 'setup', work);
      setupRuns.push({ record, argv: plan.setup });
      if (record.result === 'error' || record.result === 'timeout') {
        throw new BountyRefused('setup-unrunnable', `setup step '${describeCommand(plan.setup)}' cannot run here: ${tail(record.log)} — name a program that exists on PATH or inside the repository`);
      }
      if (record.result !== 'pass') {
        throw new BountyRefused('setup-failed', `setup step '${describeCommand(plan.setup)}' exited ${record.exit}: ${tail(record.log)}`);
      }
    }
    const check = runOne(plan.check, 'check', work);
    if (check.result === 'error' || check.result === 'timeout') {
      throw new BountyRefused('check-unrunnable', `check '${describeCommand(plan.check)}' cannot run here: ${tail(check.log)} — name a program that exists on PATH or inside the repository`);
    }
    if (check.result === 'pass') {
      throw new BountyRefused('check-already-passes', `check '${describeCommand(plan.check)}' exits 0 in the snapshot today — there is nothing to solve`);
    }
    return { setup: setupRuns.map(run => runRecord(run.record, run.argv)), check: runRecord(check, plan.check) };
  } finally {
    rmSync(runRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

export function renderListing(manifest: BountyManifest, note: { file: string; text: string } | null): string {
  const lines: string[] = [];
  lines.push(`# Bounty: ${manifest.title}`);
  lines.push('');
  lines.push(`id ${manifest.id} · level ${manifest.level} · created ${manifest.createdAt} by ${manifest.tool}`);
  lines.push('');
  lines.push('## What is wanted');
  lines.push('');
  lines.push(manifest.task.text.trim());
  lines.push('');
  if (note !== null) {
    lines.push('## What was already tried');
    lines.push('');
    lines.push(note.text.trim());
    lines.push('');
  }
  lines.push('## The code');
  lines.push('');
  lines.push('`repo/` holds a snapshot of the repository as it stood when the bounty was');
  lines.push('created — the full working state, minus files that never ship (secrets, keys,');
  lines.push('anything the owner listed). There is no `.git` and no history.');
  if (manifest.setup !== null) {
    lines.push('');
    lines.push('## Set up');
    lines.push('');
    lines.push(`    ${describeCommand(manifest.setup.argv)}`);
    lines.push('');
  }
  lines.push('## How you know you are done');
  lines.push('');
  if (manifest.check !== null && manifest.verification !== null) {
    lines.push(`    ${describeCommand(manifest.check.argv)}`);
    lines.push('');
    lines.push(`Run it inside \`repo/\`. Today it exits ${manifest.verification.check.exit}; your answer`);
    lines.push('is done when it exits 0 and nothing else broke. Existing behaviour must keep working.');
  } else {
    lines.push('No automated check decides this bounty: a person will read your answer.');
    lines.push('Keep every existing test passing and the change small and readable.');
  }
  lines.push('');
  lines.push('## What was kept out');
  lines.push('');
  if (manifest.neverShip.every(rule => rule.removed === 0)) {
    lines.push('No files were removed by the never-ship rules.');
  } else {
    lines.push(`${manifest.counts.removed} file(s) were removed by built-in and owner-listed never-ship`);
    lines.push('rules before packaging. Their names are not listed here by design.');
  }
  lines.push('');
  lines.push('Answers are returned through the tool that posted this bounty; `bounty.json` in');
  lines.push('this folder is the machine-readable record of everything above.');
  lines.push('');
  return lines.join('\n');
}

export function renderPreview(plan: BountyPlan): string {
  const lines: string[] = [];
  lines.push('box bounty create — preview of what would leave');
  lines.push(`  repository: ${plan.repoRoot}`);
  lines.push(`  snapshot: commit ${plan.snapshot.commit} (tree ${plan.snapshot.tree}, base ${plan.snapshot.baseCommit ?? 'none — unborn HEAD'})`);
  lines.push(`  would ship: ${plan.files.length} file(s), ${plan.totalBytes} bytes`);
  if (plan.removed.length === 0) {
    lines.push('  never-ship removed: nothing');
  } else {
    lines.push(`  never-ship removed: ${plan.removed.length} file(s)`);
    for (const entry of plan.ruleRemovals) {
      lines.push(`    ${entry.rule}: ${entry.removed}`);
      for (const path of entry.paths.slice(0, PREVIEW_NAMES_PER_RULE)) lines.push(`      ${path}`);
      if (entry.paths.length > PREVIEW_NAMES_PER_RULE) lines.push(`      … and ${entry.paths.length - PREVIEW_NAMES_PER_RULE} more`);
    }
  }
  lines.push(`  task: ${plan.task.file}`);
  for (const line of plan.task.text.trim().split('\n')) lines.push(`    ${line}`);
  if (plan.note !== null) lines.push(`  note: ${plan.note.file}`);
  lines.push(`  setup: ${plan.setup !== null ? describeCommand(plan.setup) : 'none'}`);
  lines.push(`  check: ${plan.check !== null ? describeCommand(plan.check) : 'none'}`);
  lines.push(`  level: ${plan.level}${plan.level === 'mechanical' ? ' (the declared check must fail today — it will be run to prove it)' : ' (no check — a person reads the answer)'}`);
  lines.push(`  out: ${plan.outDir}`);
  return lines.join('\n');
}

export function finalizeBounty(plan: BountyPlan): BountyResult {
  const outDir = plan.outDir;
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    throw new BountyRefused('out-dir-not-empty', `out directory ${outDir} is not empty — point --out at a new or empty folder`);
  }
  mkdirSync(dirname(outDir), { recursive: true });
  const staging = mkdtempSync(join(dirname(outDir), '.box-bounty-staging-'));
  try {
    const snapshotDir = join(staging, 'repo');
    mkdirSync(snapshotDir, { recursive: true }); // the folder exists even when nothing ships
    const files: BountyManifest['files'][number][] = [];
    for (const file of plan.files) {
      const bytes = readFileSync(file.realPath);
      const target = join(snapshotDir, ...file.path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      files.push({ path: file.path, sha256: sha256(bytes), bytes: bytes.length });
    }
    const verification = proveCheckFails(plan, snapshotDir);
    const createdAt = new Date().toISOString();
    const id = `bt-${sha256(`${plan.snapshot.commit}\n${plan.title}\n${createdAt}`).slice(0, 12)}`;
    const manifest: BountyManifest = {
      schemaVersion: 1,
      kind: 'box-bounty',
      id,
      title: plan.title,
      createdAt,
      tool: TOOL_VERSION,
      task: plan.task,
      note: plan.note,
      setup: plan.setup !== null ? { argv: [...plan.setup] } : null,
      check: plan.check !== null ? { argv: [...plan.check] } : null,
      level: plan.level,
      snapshot: plan.snapshot,
      files,
      counts: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), removed: plan.removed.length },
      neverShip: plan.ruleRemovals.map(entry => ({ rule: entry.rule, removed: entry.removed })),
      verification
    };
    writeFileSync(join(staging, 'bounty.json'), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(join(staging, 'README.md'), renderListing(manifest, plan.note));
    if (existsSync(outDir)) rmdirSync(outDir); // only reachable when outDir is empty (checked above)
    renameSync(staging, outDir);
    return { id, outDir, plan };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    throw error;
  }
}
