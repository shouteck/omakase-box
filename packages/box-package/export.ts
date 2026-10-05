import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseAgreement } from './agreement.js';
import type { BoxAgreement } from './agreement.js';
import { ExportFailed, PreparationGap } from './errors.js';
import { git } from './git.js';
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
    const args = [...pnpm.args, 'install', '--lockfile-only'];
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
  const baseCommit = resolveBaseCommit(agreement, repo, agreement.sourceRoot);

  const selection = deriveSelection(agreement, sourceRoot);
  if (selection.gaps.length > 0) throw new PreparationGap(selection.gaps);

  const outDir = resolve(options.outDir);
  if (existsSync(outDir) && readdirSync(outDir).length > 0) throw new ExportFailed(`out directory ${outDir} is not empty`);
  mkdirSync(outDir, { recursive: true });

  const files: BoxManifest['files'][number][] = [];
  const written = new Set<string>();
  const ship = (box: string, owner: string | null, origin: 'runnable' | 'editable' | 'generated', content: Buffer | string, record: boolean): void => {
    if (written.has(box.toLowerCase())) throw new ExportFailed(`two inputs map to the same package path ${box}`);
    written.add(box.toLowerCase());
    write(outDir, box, content);
    if (record) files.push({ box, owner, origin, sha256: sha256(content), bytes: typeof content === 'string' ? Buffer.byteLength(content) : content.length });
  };
  for (const file of selection.files) {
    if (file.origin === 'generated') {
      ship(file.box, file.owner, 'generated', generate(file.generated ?? ''), true);
      continue;
    }
    ship(file.box, file.owner, file.origin, readFileSync(join(sourceRoot, file.owner)), true);
  }

  const manifestText = packageManifest(agreement);
  ship('package.json', null, 'generated', manifestText, false);
  ship('tsconfig.json', null, 'generated', tsconfigJson(), false);
  for (const check of agreement.evaluator) ship(check.box, null, 'generated', generate(check.generator), false);
  // The submission tool travels inside the folder: the recipient seals its work with
  // `node box/submit.mjs`, no box-cli or repository needed.
  ship(SUBMIT_TOOL_PATH, null, 'generated', SUBMIT_TOOL, false);
  ship('pnpm-lock.yaml', null, 'generated', resolveLockfile(manifestText, options.pnpm), false);

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
    toolchain: agreement.toolchain,
    declaredDependencies: agreement.declaredDependencies,
    files,
    editable,
    readContext: agreement.readContext,
    checks: agreement.checks,
    evaluator: agreement.evaluator.map(entry => ({ box: entry.box, generator: entry.generator })),
    submission: { format: 'editable-overlay', tool: SUBMIT_TOOL_PATH, editable, instructions: agreement.submission.instructions },
    disclosure: { shippedOwnerFiles: shippedOwner, inventoryFiles: inventory, share: inventory === 0 ? 0 : shippedOwner / inventory }
  };
  ship('box.json', null, 'generated', JSON.stringify(manifest, null, 2) + '\n', false);

  const produced: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else produced.push(toPosix(relative(outDir, target)));
    }
  };
  walk(outDir);
  return { outDir, baseCommit, files: produced.sort(), disclosure: manifest.disclosure };
}
