import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseAgreement } from './agreement.js';
import { runDeclaredChecks } from './commands.js';
import type { CheckRecord } from './commands.js';
import type { PnpmInvocation } from './export.js';
import { git } from './git.js';
import { ownerCheck } from './owner-checks.js';
import type { OwnerCheck } from './owner-checks.js';
import { toPosix } from './selection.js';
import { SubmissionArtifactSchema, validateSubmission } from './submission.js';
import type { SubmissionApply, SubmissionArtifact, SubmissionRejection, SubmissionReport } from './submission.js';

// Owner-side verify + scratch merge (D3.1): the second half of the delegation loop.
// validateSubmission proves the artifact binds to the agreement, box and base commit;
// this proves the patch WORKS in the owner repository: a clean clone at the base
// commit, the exact overlay applied to the declared owner paths, then the owner-side
// checks — a full compile plus a generated outcome check that drives the applied file
// through the real owner modules. On pass the change lands as an ordinary git commit
// on a scratch branch inside the throwaway clone, with box/attempt identity in the
// message. The clone is removed afterwards; real history is never touched.
//
// Failure classification (every failure names its class; none is silent):
// - preparation-defect: the submission was rejected at the binding boundary
//   (malformed, wrong box/base/agreement, outside the editable surface, bad baseline)
//   or the agreement names evaluator generators with no registered owner check —
//   the package lacked something, so nothing was applied or run.
// - environment-failure: the machinery could not run — unreadable inputs, git
//   clone/checkout failure, or dependency install failure in the scratch checkout.
// - implementation-failure: the patch applied cleanly but an owner check exited
//   non-zero (compile or outcome). This is the local-pass-but-owner-fail class: the
//   box evaluator can be green while the applied outcome is wrong.
//
// Replay policy: idempotent-accept. Verify is stateless and deterministic — the same
// artifact re-verifies against the same base and lands an equivalent merge in a fresh
// scratch history. Whether an owner accepts a repeated attempt is history policy,
// not this command's concern.

export type VerifyFailureClass = 'preparation-defect' | 'environment-failure' | 'implementation-failure';
export type VerifyCheckName = 'install' | 'compile' | 'outcome';
export interface VerifyCheck {
  readonly name: VerifyCheckName;
  readonly status: 'pass' | 'fail' | 'skipped';
  readonly detail?: string;
}
export interface VerifyMerge {
  readonly branch: string;
  readonly commit: string;
  readonly message: string;
  readonly scratch: string | null; // kept clone path when keepScratch, else null (removed)
}
export interface VerifyReport {
  readonly verdict: 'pass' | 'fail';
  readonly failureClass?: VerifyFailureClass;
  readonly reason?: SubmissionRejection | 'no-owner-check' | 'outside-owner-root' | VerifyCheckName | 'command-check' | 'operational';
  readonly detail?: string;
  readonly box?: { readonly id: string; readonly name: string; readonly version: number };
  readonly baseCommit?: string;
  readonly expectedBaseCommit?: string;
  readonly attemptSha256?: string;
  readonly applies?: readonly SubmissionApply[];
  readonly checks: readonly VerifyCheck[];
  readonly commandChecks?: readonly CheckRecord[];
  readonly merge?: VerifyMerge;
}
export interface VerifyOptions {
  readonly submissionPath: string;
  readonly agreementPath: string;
  readonly repoPath: string;
  readonly baseCommit?: string;
  readonly boxDir?: string;
  readonly pnpm: PnpmInvocation;
  readonly workRoot?: string;   // parent for the scratch clone; defaults to the OS temp dir
  readonly keepScratch?: boolean;
}

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_TAIL = 4000;

type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
const fail = (failureClass: VerifyFailureClass, reason: NonNullable<VerifyReport['reason']>, detail: string, base: Partial<VerifyReport> = {}): VerifyReport =>
  ({ verdict: 'fail', failureClass, reason, detail, checks: [], ...base });

function inside(rootDir: string, rel: string): string {
  // Defense in depth behind the submission boundary: every path written in the
  // scratch checkout is portable by schema and declared by the agreement, and here
  // it must still resolve inside the directory it claims to live under.
  const target = resolve(rootDir, rel);
  const offset = relative(rootDir, target);
  if (offset === '' || offset.startsWith('..') || isAbsolute(offset)) throw new VerifyApplyOutsideRoot(rel);
  return target;
}
class VerifyApplyOutsideRoot extends Error {
  constructor(readonly path: string) {
    super(`declared path ${path} resolves outside the owner root`);
    this.name = 'VerifyApplyOutsideRoot';
  }
}

interface StepResult { readonly status: number | null; readonly output: string }
function step(pnpm: PnpmInvocation, cwd: string, args: readonly string[]): StepResult {
  const result = spawnSync(pnpm.command, [...pnpm.args, ...args], { cwd, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS, windowsHide: true });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const detail = result.error !== undefined ? `${result.error.message}\n${output}` : output;
  return { status: result.error !== undefined ? null : result.status, output: detail.slice(-OUTPUT_TAIL) };
}

export function verifySubmission(options: VerifyOptions): VerifyReport {
  // Phase 1: the D2.2 binding boundary, unchanged. A rejection here means the
  // package lacked integrity or scope — a preparation defect, not a bad patch.
  let validation: SubmissionReport;
  try {
    validation = validateSubmission({
      submissionPath: options.submissionPath,
      agreementPath: options.agreementPath,
      repoPath: options.repoPath,
      ...(options.baseCommit !== undefined ? { baseCommit: options.baseCommit } : {}),
      ...(options.boxDir !== undefined ? { boxDir: options.boxDir } : {})
    });
  } catch (error) {
    return fail('environment-failure', 'operational', error instanceof Error ? error.message : String(error));
  }
  const base: Mutable<VerifyReport> = {
    ...(validation.box !== undefined ? { box: validation.box } : {}),
    ...(validation.baseCommit !== undefined ? { baseCommit: validation.baseCommit } : {}),
    ...(validation.expectedBaseCommit !== undefined ? { expectedBaseCommit: validation.expectedBaseCommit } : {})
  };
  if (!validation.accepted) {
    return fail('preparation-defect', validation.reason ?? 'malformed-submission', validation.detail ?? 'submission rejected at the binding boundary', base);
  }
  const applies = validation.applies ?? [];

  // The artifact and agreement already parsed once inside validateSubmission;
  // re-read for the apply plan (owner path spellings, source root, check names).
  let artifact: SubmissionArtifact;
  let agreement: ReturnType<typeof parseAgreement>;
  try {
    artifact = SubmissionArtifactSchema.parse(JSON.parse(readFileSync(resolve(options.submissionPath), 'utf8')));
    agreement = parseAgreement(JSON.parse(readFileSync(resolve(options.agreementPath), 'utf8')));
  } catch (error) {
    return fail('environment-failure', 'operational', error instanceof Error ? error.message : String(error), base);
  }
  const attemptSha256 = sha256(JSON.stringify({
    box: artifact.box, baseCommit: artifact.baseCommit,
    files: artifact.files.map(file => ({ box: file.box.toLowerCase(), sha256: file.sha256 })).sort((left, right) => left.box.localeCompare(right.box))
  }));
  base.attemptSha256 = attemptSha256;
  base.applies = applies;

  // Phase 2: resolve the owner-side checks the agreement names. Every declared
  // evaluator generator must have a registered owner check; a gap means the Box
  // cannot prove its outcome owner-side — a preparation defect, not a pass.
  const checks: OwnerCheck[] = [];
  const unchecked: string[] = [];
  for (const entry of agreement.evaluator) {
    const check = ownerCheck(entry.generator, agreement.sourceRoot);
    if (check === undefined) unchecked.push(entry.generator);
    else checks.push(check);
  }
  if (unchecked.length > 0) {
    return fail('preparation-defect', 'no-owner-check', `no owner-side check is registered for generator(s): ${unchecked.join(', ')}`, base);
  }

  // Phase 3: scratch owner history. clone --local keeps it cheap and fully
  // disposable; the branch is created at the submission's base commit.
  const scratch = mkdtempSync(join(resolve(options.workRoot ?? tmpdir()), 'box-verify-'));
  const clone = join(scratch, 'owner');
  const branch = `box-verify/${artifact.box.id}-v${artifact.box.version}-${attemptSha256.slice(0, 12)}`;
  const repo = resolve(options.repoPath);
  const runChecks: VerifyCheck[] = [];
  try {
    try {
      git(repo, ['clone', '--local', '--quiet', repo, clone]);
      git(clone, ['checkout', '--quiet', '-b', branch, artifact.baseCommit]);
    } catch (error) {
      return fail('environment-failure', 'operational', `scratch checkout failed: ${error instanceof Error ? error.message : String(error)}`, { ...base, checks: runChecks });
    }

    // Phase 4: apply the exact submitted overlay, under the agreement-declared
    // owner spellings only. Unchanged files already equal the baseline bytes.
    const ownerRoot = resolve(clone, agreement.sourceRoot === '.' ? '' : agreement.sourceRoot);
    const contentByBox = new Map(artifact.files.map(file => [file.box.toLowerCase(), file.content]));
    const applied: string[] = [];
    try {
      for (const apply of applies) {
        if (!apply.changed) continue;
        const content = contentByBox.get(apply.box.toLowerCase());
        if (content === undefined) return fail('environment-failure', 'operational', `validated apply for ${apply.box} has no artifact content`, { ...base, checks: runChecks });
        const target = inside(ownerRoot, apply.owner);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
        applied.push(`${agreement.sourceRoot === '.' ? '' : `${toPosix(agreement.sourceRoot)}/`}${apply.owner}`);
      }
      for (const check of checks) {
        const target = inside(clone, check.file);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, check.source);
      }
    } catch (error) {
      if (error instanceof VerifyApplyOutsideRoot) return fail('preparation-defect', 'outside-owner-root', error.message, { ...base, checks: runChecks });
      return fail('environment-failure', 'operational', `apply failed: ${error instanceof Error ? error.message : String(error)}`, { ...base, checks: runChecks });
    }

    // Phase 5: owner checks, in order, fail-fast. install prepares the checkout
    // (an infrastructure concern); compile and outcome judge the patch itself.
    // The outcome step exists only when evaluator generators named registered
    // owner checks — a bare `vitest run` would execute the clone's whole suite.
    const steps: Array<{ name: VerifyCheckName; args: string[] }> = [
      { name: 'install', args: ['install', '--frozen-lockfile'] },
      { name: 'compile', args: ['exec', 'tsc', '--noEmit'] },
      ...(checks.length > 0 ? [{ name: 'outcome' as const, args: ['exec', 'vitest', 'run', ...checks.map(check => check.file)] }] : [])
    ];
    for (const [index, current] of steps.entries()) {
      const result = step(options.pnpm, clone, current.args);
      if (result.status === 0) {
        runChecks.push({ name: current.name, status: 'pass' });
        continue;
      }
      runChecks.push({ name: current.name, status: 'fail', detail: result.output });
      for (const rest of steps.slice(index + 1)) runChecks.push({ name: rest.name, status: 'skipped' });
      const failureClass: VerifyFailureClass = current.name === 'install' ? 'environment-failure' : 'implementation-failure';
      return fail(failureClass, current.name, `owner check '${current.name}' failed in the scratch checkout`, { ...base, checks: runChecks });
    }

    // Phase 5b: the agreement's declared owner-context commands run in the
    // scratch clone, on the applied bytes — immutable agreement data, not the
    // submission's or manifest's claims. Any non-pass is implementation-failure:
    // a red guard means broken behavior, a red outcome means the request is not
    // met (a no-op patch keeps the untouched-base result).
    let commandChecks: CheckRecord[] | undefined;
    if (agreement.commands.length > 0) {
      commandChecks = runDeclaredChecks(agreement.commands, clone, options.pnpm, 'owner');
      const failed = commandChecks.find(record => record.result !== 'pass');
      if (failed !== undefined) {
        return fail('implementation-failure', 'command-check', `declared ${failed.role} check '${failed.name}' did not pass (result: ${failed.result}, exit ${failed.exit}): ${failed.log}`, { ...base, checks: runChecks, commandChecks });
      }
    }

    // Phase 6: land the change in the scratch history — ordinary git, box and
    // attempt identity in the message, applied paths only (check files stay out).
    const message = [
      `box-verify: ${artifact.box.id} v${artifact.box.version} attempt ${attemptSha256.slice(0, 12)}`,
      '',
      `Applied an editable-overlay submission on base ${artifact.baseCommit}.`,
      `box: ${artifact.box.id} v${artifact.box.version}`,
      `attempt: ${attemptSha256}`,
      `base: ${artifact.baseCommit}`,
      `files: ${applied.length === 0 ? 'no changed files' : applied.join(', ')}`,
      'owner checks: install, compile, outcome — pass'
    ].join('\n');
    let commit: string;
    try {
      if (applied.length > 0) git(clone, ['add', '--', ...applied]);
      git(clone, ['-c', 'user.name=box-verify', '-c', 'user.email=box-verify@owner.invalid', 'commit', '--quiet', '--allow-empty', '-m', message]);
      commit = git(clone, ['rev-parse', 'HEAD']);
    } catch (error) {
      return fail('environment-failure', 'operational', `scratch merge failed: ${error instanceof Error ? error.message : String(error)}`, { ...base, checks: runChecks });
    }
    return {
      verdict: 'pass',
      box: validation.box!,
      baseCommit: validation.baseCommit!,
      expectedBaseCommit: validation.expectedBaseCommit!,
      attemptSha256,
      applies,
      checks: runChecks,
      ...(commandChecks !== undefined ? { commandChecks } : {}),
      merge: { branch, commit, message, scratch: options.keepScratch === true ? clone : null }
    };
  } finally {
    if (options.keepScratch !== true) rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}
