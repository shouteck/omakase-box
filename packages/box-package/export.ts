import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseAgreement } from './agreement.js';
import type { BoxAgreement } from './agreement.js';
import { materializeTooling, preflightPrograms, runDeclaredChecks, runSetup } from './commands.js';
import type { CheckRecord } from './commands.js';
import type { CommandCheck } from './agreement.js';
import { ExportFailed, PreparationGap } from './errors.js';
import { git } from './git.js';
import { productInstallArgs } from './install.js';
import type { BoxManifest } from './manifest.js';
import { generate, packageManifest, tsconfigJson } from './scaffolds.js';
import { deriveSelection, toPosix } from './selection.js';
import { SUBMIT_TOOL, SUBMIT_TOOL_PATH } from './submit-tool.js';

// Folder export: agreement -> selection -> bytes -> generated scaffold -> lockfile ->
// box.json. Export never reaches back into the owner repository beyond the declared
// source root, and never emits a partial folder: a selection gap fails before writing.

export interface PnpmInvocation { readonly command: string; readonly args: readonly string[] }
export interface ExportOptions {
  readonly agreementPath: string;
  readonly repoPath: string;
  readonly outDir: string;
  readonly pnpm: PnpmInvocation;
}
export interface ExportResult {
  readonly outDir: string;
  readonly baseCommit: string;
  readonly files: readonly string[];
  readonly disclosure: { readonly shippedOwnerFiles: number; readonly inventoryFiles: number; readonly share: number };
}

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');

function resolveBaseCommit(agreement: BoxAgreement, repo: string, sourceRoot: string): string {
  const head = git(repo, ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(head)) throw new ExportFailed(`cannot resolve HEAD in ${repo}`);
  if (agreement.baseCommit !== undefined && agreement.baseCommit !== head) throw new ExportFailed(`agreement pins base commit ${agreement.baseCommit} but ${repo} is at ${head} (wrong base commit)`);
  const dirty = git(repo, ['status', '--porcelain', '--', sourceRoot]);
  if (dirty !== '') throw new ExportFailed(`source root ${sourceRoot} differs from the base commit: ${dirty.split('\n').join(', ')}`);
  return head;
}

function inventoryCount(root: string, excluded: readonly string[]): number {
  const prefixes = excluded.map(prefix => prefix.toLowerCase());
  let count = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // A link is not an owner file: its target is counted at its real path (or not part
      // of this tree at all), and recursing it would count the same bytes twice.
      if (entry.isSymbolicLink()) continue;
      const rel = toPosix(relative(root, join(dir, entry.name)));
      if (entry.isDirectory()) { if (!prefixes.some(prefix => `${rel}/`.toLowerCase().startsWith(prefix))) walk(join(dir, entry.name)); continue; }
      if (!prefixes.some(prefix => rel.toLowerCase().startsWith(prefix))) count += 1;
    }
  };
  walk(root);
  return count;
}

function write(outDir: string, rel: string, content: string | Buffer): void {
  const target = join(outDir, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function resolveLockfile(manifestText: string, pnpm: PnpmInvocation): string {
  const staging = mkdtempSync(join(tmpdir(), 'box-export-stage-'));
  try {
    writeFileSync(join(staging, 'package.json'), manifestText);
    const args = productInstallArgs(pnpm, ['install', '--lockfile-only']);
    const result = spawnSync(pnpm.command, args, { cwd: staging, encoding: 'utf8' });
    if (result.status !== 0) throw new ExportFailed(`lockfile resolution failed (pnpm install --lockfile-only in ${staging}): ${(result.stderr || result.stdout || '').trim().slice(0, 2000)}`);
    const lockfile = join(staging, 'pnpm-lock.yaml');
    if (!existsSync(lockfile)) throw new ExportFailed('pnpm produced no pnpm-lock.yaml in the staging directory');
    return readFileSync(lockfile, 'utf8');
  } finally {
    rmSync(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

export function exportBox(options: ExportOptions): ExportResult {
  const agreementPath = resolve(options.agreementPath);
  const agreement = parseAgreement(JSON.parse(readFileSync(agreementPath, 'utf8')) as unknown);
  const repo = resolve(options.repoPath);
  const sourceRoot = resolve(repo, agreement.sourceRoot === '.' ? '' : agreement.sourceRoot);
  if (!statSync(sourceRoot, { throwIfNoEntry: false })?.isDirectory()) throw new ExportFailed(`source root ${sourceRoot} does not exist`);
  if (agreement.evaluator.length > 0 && agreement.nodejs === undefined) {
    throw new ExportFailed('evaluator entries are emitted as vitest test files: declare the nodejs helper configuration or drop evaluator');
  }
  const baseCommit = resolveBaseCommit(agreement, repo, agreement.sourceRoot);

  // A nonempty output is refused before any declared command executes or any
  // input is written — the exporter never deletes or clobbers another directory.
  const outDir = resolve(options.outDir);
  if (existsSync(outDir) && readdirSync(outDir).length > 0) throw new ExportFailed(`out directory ${outDir} is not empty`);

  const selection = deriveSelection(agreement, sourceRoot);
  if (selection.gaps.length > 0) throw new PreparationGap(selection.gaps);

  const warnings: string[] = [];
  if (agreement.checks.length > 0) {
    warnings.push(`${agreement.checks.length} legacy 'checks' entr(ies) are owner-readable descriptions, not runnable descriptors — no base results recorded for them`);
  }
  const baseChecks: CheckRecord[] = [];
  const failedGuard = (): CheckRecord | undefined => baseChecks.find(record => record.role === 'guard' && record.result !== 'pass');

  // The folder is emitted into a sibling staging directory and renamed into
  // place only after every declared check has a recorded base result, so a
  // failed export never leaves a partial Box behind.
  const staging = mkdtempSync(join(dirname(outDir), '.box-staging-'));
  try {

  const files: BoxManifest['files'][number][] = [];
  const written = new Set<string>();
  const ship = (box: string, owner: string | null, origin: 'runnable' | 'editable' | 'generated', content: Buffer | string, record: boolean): void => {
    if (written.has(box.toLowerCase())) throw new ExportFailed(`two inputs map to the same package path ${box}`);
    written.add(box.toLowerCase());
    write(staging, box, content);
    if (record) files.push({ box, owner, origin, sha256: sha256(content), bytes: typeof content === 'string' ? Buffer.byteLength(content) : content.length });
  };
  for (const file of selection.files) {
    if (file.origin === 'generated') {
      ship(file.box, file.owner, 'generated', generate(file.generated ?? ''), true);
      continue;
    }
    ship(file.box, file.owner, file.origin, readFileSync(join(sourceRoot, file.owner)), true);
  }

  if (agreement.nodejs !== undefined) {
    const manifestText = existsSync(join(staging, 'package.json'))
      ? readFileSync(join(staging, 'package.json'), 'utf8')
      : packageManifest(agreement);
    if (!written.has('package.json')) ship('package.json', null, 'generated', manifestText, false);
    if (!written.has('tsconfig.json')) ship('tsconfig.json', null, 'generated', tsconfigJson(), false);
    if (!written.has('pnpm-lock.yaml')) ship('pnpm-lock.yaml', null, 'generated', resolveLockfile(manifestText, options.pnpm), false);
  }
  for (const check of agreement.evaluator) ship(check.box, null, 'generated', generate(check.generator), false);
  // The submission tool travels inside the folder: the recipient seals its work with
  // `node box/submit.mjs`, no box-cli or repository needed.
  ship(SUBMIT_TOOL_PATH, null, 'generated', SUBMIT_TOOL, false);

  // Every declared program (owner setup/checks, recipient setup/checks) and
  // every executable prerequisite resolves before the first declared command
  // runs, so a missing program is named before any setup side effect — of any
  // context — can occur. Recipient-relative paths resolve against the emitted
  // staging tree (the recipient run directory is a byte-identical copy).
  preflightPrograms({
    setup: agreement.setup.filter(command => command.context === 'owner'),
    commands: agreement.commands.filter(command => command.context === 'owner'),
    requires: agreement.requires
  }, repo);
  preflightPrograms({
    setup: agreement.setup.filter(command => command.context === 'recipient'),
    commands: agreement.commands.filter(command => command.context === 'recipient'),
    requires: []
  }, staging);

  const ownerSetup = agreement.setup.filter(command => command.context === 'owner');
  const ownerChecks = agreement.commands.filter(check => check.context === 'owner');
  const recipientSetup = agreement.setup.filter(command => command.context === 'recipient');
  const recipientChecks = agreement.commands.filter(check => check.context === 'recipient');
  const pairBase = new Map<string, CheckRecord>();
  const paired: { check: CommandCheck; owner: CheckRecord; box: CheckRecord }[] = [];
  let basePairRoot: string | undefined;

  // Every declared owner-context check runs on the untouched base in a
  // disposable clone — never in the real owner repository, which approved
  // commands must leave unchanged. A red guard is a preparation/environment
  // gap: the base the agreement claims to start from does not hold.
  if (ownerSetup.length > 0 || ownerChecks.length > 0 || recipientSetup.length > 0 || recipientChecks.length > 0) {
    const baseWork = mkdtempSync(join(tmpdir(), 'box-base-'));
    try {
      const clone = join(baseWork, 'owner');
      git(repo, ['clone', '--local', '--quiet', repo, clone]);
      git(clone, ['checkout', '--quiet', baseCommit]);
      materializeTooling(repo, clone);
      baseChecks.push(...runSetup(agreement.setup, clone, 'owner'));
      const setup = baseChecks.find(record => record.role === 'setup' && record.result !== 'pass');
      if (setup !== undefined) {
        throw new ExportFailed(`setup command '${setup.name}' did not exit 0 on the untouched base (context ${setup.context}, result: ${setup.result}, exit ${setup.exit}): ${setup.log}`);
      }
      baseChecks.push(...runDeclaredChecks(agreement.commands, clone, 'owner'));
      if (recipientSetup.length > 0 || recipientChecks.length > 0) {
        const baseSub = agreement.sourceRoot === '.' ? clone : join(clone, ...toPosix(agreement.sourceRoot).split('/'));
        if (!statSync(baseSub, { throwIfNoEntry: false })?.isDirectory()) throw new ExportFailed(`source root ${agreement.sourceRoot} is absent from the base clone, so the declared recipient checks cannot be paired against it`);
        basePairRoot = realpathSync(baseSub);
        for (const record of runSetup(agreement.setup, baseSub, 'recipient')) {
          if (record.result !== 'pass') throw new ExportFailed(`setup command '${record.name}' did not exit 0 on the untouched base subtree (context ${record.context}, result: ${record.result}, exit ${record.exit}): ${record.log}`);
        }
        for (const record of runDeclaredChecks(agreement.commands, baseSub, 'recipient')) pairBase.set(record.name, record);
      }
    } finally {
      rmSync(baseWork, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
    const guard = failedGuard();
    if (guard !== undefined) {
      throw new ExportFailed(`guard check '${guard.name}' does not pass on the untouched base (context ${guard.context}, result: ${guard.result}, exit ${guard.exit}): ${guard.log}`);
    }
  }

  // Every declared recipient-context check runs on the emitted folder at the
  // base state: the staging tree is copied to a run directory outside the
  // checkout, installed from its own lockfile when a pinned tool needs it, and
  // the declared commands execute there. A red guard (a runtime-path gap in the
  // package is exactly that) refuses the export even when owner checks are
  // green; the result is recorded either way.
  if (recipientSetup.length > 0 || recipientChecks.length > 0) {
    const runRootDir = mkdtempSync(join(tmpdir(), 'box-recipient-'));
    try {
      const box = join(runRootDir, 'box');
      cpSync(staging, box, { recursive: true });
      baseChecks.push(...runSetup(agreement.setup, box, 'recipient'));
      const setup = baseChecks.find(record => record.role === 'setup' && record.result !== 'pass');
      if (setup !== undefined) {
        throw new ExportFailed(`setup command '${setup.name}' did not exit 0 in the staged Box (context ${setup.context}, result: ${setup.result}, exit ${setup.exit}): ${setup.log}`);
      }
      const boxRuns = runDeclaredChecks(agreement.commands, box, 'recipient');
      baseChecks.push(...boxRuns);
      const boxRoot = realpathSync(box);
      for (const check of recipientChecks) {
        const owner = pairBase.get(check.name);
        const isolated = boxRuns.find(record => record.name === check.name);
        if (owner === undefined || isolated === undefined || basePairRoot === undefined) throw new ExportFailed(`paired check '${check.name}' has no counterpart record to compare against`);
        if (owner.result === 'error' || owner.result === 'timeout' || isolated.result === 'error' || isolated.result === 'timeout') {
          throw new ExportFailed(`paired check '${check.name}' could not be compared (base: ${owner.result} exit ${owner.exit}; box: ${isolated.result} exit ${isolated.exit}): ${(owner.result === 'fail' || owner.result === 'pass' ? isolated : owner).log}`);
        }
        if (owner.result !== isolated.result || owner.exit !== isolated.exit) {
          throw new ExportFailed(`paired check '${check.name}' disagrees between the untouched base and the isolated Box (base ${owner.result} exit ${owner.exit}; box ${isolated.result} exit ${isolated.exit}): ${isolated.log}`);
        }
        const normalize = (log: string, root: string): string => {
          let out = log.replace(/\r\n/g, '\n');
          for (const spelling of new Set([root, toPosix(root)])) if (spelling !== '') out = out.split(spelling).join('<root>');
          return out;
        };
        if (normalize(owner.log, basePairRoot) !== normalize(isolated.log, boxRoot)) {
          throw new ExportFailed(`paired check '${check.name}' exits identically but fails differently in the isolated Box than on the untouched base — a missing selected file cannot masquerade as the declared outcome. base: ${normalize(owner.log, basePairRoot).slice(-800)} | box: ${normalize(isolated.log, boxRoot).slice(-800)}`);
        }
        paired.push({ check, owner, box: isolated });
      }
    } finally {
      rmSync(runRootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
    const guard = failedGuard();
    if (guard !== undefined) {
      throw new ExportFailed(`guard check '${guard.name}' does not pass on the untouched base (context ${guard.context}, result: ${guard.result}, exit ${guard.exit}): ${guard.log}`);
    }
  }
  if (recipientChecks.length === 0) {
    warnings.push('no runnable recipient-context checks are declared: the explicit selection is not proven inside the emitted Box');
  }
  if (baseChecks.length > 0 && !baseChecks.some(record => record.role === 'outcome' && record.result === 'fail')) {
    warnings.push('no declared outcome check fails on the untouched base: the declared checks cannot evidence change');
  }

  const inventory = inventoryCount(sourceRoot, agreement.inventoryExcludePrefixes);
  const shippedOwner = files.filter(file => file.origin !== 'generated').length;
  const editable = agreement.editable.map(entry => ({ box: entry.box, owner: entry.owner }));
  const manifest: BoxManifest = {
    schemaVersion: 1,
    box: agreement.box,
    outcome: agreement.outcome,
    baseCommit,
    agreementSha256: sha256(readFileSync(agreementPath)),
    sourceRoot: agreement.sourceRoot,
    ...(agreement.nodejs !== undefined ? { nodejs: agreement.nodejs } : {}),
    requires: agreement.requires,
    declaredDependencies: agreement.declaredDependencies,
    files,
    editable,
    readContext: agreement.readContext,
    checks: agreement.checks,
    evaluator: agreement.evaluator.map(entry => ({ box: entry.box, generator: entry.generator })),
    setup: agreement.setup,
    commands: agreement.commands,
    baseChecks: baseChecks.map(record => ({
      name: record.name, program: record.program, argv: [...record.declaredArgv], cwd: record.cwd,
      context: record.context, role: record.role, exit: record.exit, result: record.result,
      log: record.log, seconds: record.seconds
    })),
    paired: paired.map(pair => ({
      name: pair.check.name, program: pair.check.program, argv: [...pair.check.args], cwd: pair.check.cwd,
      owner: { exit: pair.owner.exit, result: pair.owner.result, log: pair.owner.log, seconds: pair.owner.seconds },
      box: { exit: pair.box.exit, result: pair.box.result, log: pair.box.log, seconds: pair.box.seconds }
    })),
    warnings,
    submission: { format: 'editable-overlay', tool: SUBMIT_TOOL_PATH, editable, instructions: agreement.submission.instructions },
    disclosure: { shippedOwnerFiles: shippedOwner, inventoryFiles: inventory, share: inventory === 0 ? 0 : shippedOwner / inventory }
  };
  ship('box.json', null, 'generated', JSON.stringify(manifest, null, 2) + '\n', false);

  const produced: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else produced.push(toPosix(relative(staging, target)));
    }
  };
  walk(staging);
  if (existsSync(outDir)) rmdirSync(outDir); // only reachable when outDir is empty (checked above)
  renameSync(staging, outDir);
  return { outDir, baseCommit, files: produced.sort(), disclosure: manifest.disclosure };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    throw error;
  }
}
