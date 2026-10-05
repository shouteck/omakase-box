import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { GitCommitSchema } from '../box-contracts/index.js';
import { isPortablePath } from '../contracts/paths.js';
import { parseAgreement } from './agreement.js';
import { SubmissionFailed } from './errors.js';
import { git, gitBytes } from './git.js';
import { generate } from './scaffolds.js';
import { toPosix } from './selection.js';

// Owner-side half of the delegation loop: validate a recipient's submission artifact
// against the agreement that produced the Box, and report what it would apply. The
// artifact itself is produced inside the Box folder by the emitted box/submit.mjs
// (./submit-tool.ts). Full patch verification and merge is D3.1; this is the boundary:
// binding and scope only.
//
// Binding anchors (the tamper check):
// - agreementSha256: the artifact carries the sha256 of the agreement file, which the
//   recipient only ever saw inside box.json. A sealed artifact naming a different hash
//   means the agreement (or the manifest derived from it) was altered.
// - base commit: each file's declared baselineSha256 is recomputed owner-side from the
//   owner blob at the base commit (`git show <base>:<sourceRoot>/<owner>`) or, for a
//   generated scaffold, from the deterministic generator output.
// - editable map: only the agreement's declared editable box/owner paths are in scope;
//   anything else is rejected, so an edit outside the editable surface cannot be
//   submitted as a valid patch.
// - boxJsonSha256: carried for audit; verified only when the caller passes a pristine
//   retained export via boxDir, since the recipient controls their own copy.
// Scope decisions never read agreement.readContext: read context explains, it never
// scopes the contribution surface, so its known bare-directory wart cannot reach here.
// Path comparisons fold case: on this Windows host a case-aliased spelling of a real
// editable is the same file, and `git show` needs the agreement-declared spelling.

const PortablePath = z.string().refine(isPortablePath, 'Unsafe portable relative path.');
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const CONTENT_LIMIT = 1024 * 1024; // same ceiling as the D1 submission envelope

export const SubmissionFileSchema = z.strictObject({
  box: PortablePath,
  owner: PortablePath,
  baselineSha256: Sha256Schema.nullable(),
  sha256: Sha256Schema,
  content: z.string().refine(value => Buffer.byteLength(value, 'utf8') <= CONTENT_LIMIT, 'File content exceeds 1 MiB.')
});
export const SubmissionArtifactSchema = z.strictObject({
  schemaVersion: z.literal(1),
  format: z.literal('editable-overlay'),
  box: z.strictObject({ id: z.string().min(1).max(64), name: z.string().min(1).max(240), version: z.number().int().positive() }),
  baseCommit: GitCommitSchema,
  agreementSha256: Sha256Schema,
  boxJsonSha256: Sha256Schema,
  files: z.array(SubmissionFileSchema).min(1).max(64)
});
export type SubmissionArtifact = z.infer<typeof SubmissionArtifactSchema>;

export type SubmissionRejection =
  | 'malformed-submission'
  | 'agreement-mismatch'
  | 'box-mismatch'
  | 'base-commit-mismatch'
  | 'box-json-mismatch'
  | 'outside-editable'
  | 'missing-editable'
  | 'baseline-mismatch';

export interface SubmissionApply {
  readonly owner: string;
  readonly box: string;
  readonly changed: boolean;
  readonly sha256: string;
  readonly bytes: number;
}
export interface SubmissionReport {
  readonly accepted: boolean;
  readonly reason?: SubmissionRejection;
  readonly detail?: string;
  readonly box?: { readonly id: string; readonly name: string; readonly version: number };
  readonly baseCommit?: string;
  readonly expectedBaseCommit?: string;
  readonly baseSource?: 'flag' | 'agreement' | 'repo-head';
  readonly applies?: readonly SubmissionApply[];
}
export interface ValidateSubmissionOptions {
  readonly submissionPath: string;
  readonly agreementPath: string;
  readonly repoPath: string;
  readonly baseCommit?: string; // owner-declared expected base when the agreement is unpinned
  readonly boxDir?: string;     // a pristine export the owner retained; enables the box.json hash check
}

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const reject = (reason: SubmissionRejection, detail: string): SubmissionReport => ({ accepted: false, reason, detail });

export function validateSubmission(options: ValidateSubmissionOptions): SubmissionReport {
  const submissionPath = resolve(options.submissionPath);
  let raw: string;
  try { raw = readFileSync(submissionPath, 'utf8'); }
  catch { throw new SubmissionFailed(`cannot read submission ${submissionPath}`); }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return reject('malformed-submission', `${submissionPath} is not valid JSON`); }
  const artifact = SubmissionArtifactSchema.safeParse(parsed);
  if (!artifact.success) {
    const issue = artifact.error.issues[0];
    return reject('malformed-submission', `submission invalid: ${issue ? `${issue.path.join('.') || '(root)'}: ${issue.message}` : 'unknown issue'}`);
  }
  const submission = artifact.data;

  // An artifact that lies about its own content hashes is malformed, not merely wrong.
  const inconsistent = submission.files.findIndex(file => sha256(file.content) !== file.sha256);
  if (inconsistent >= 0) return reject('malformed-submission', `files[${inconsistent}] sha256 does not match its content`);
  const seen = new Set<string>();
  for (const file of submission.files) {
    const key = file.box.toLowerCase();
    if (seen.has(key)) return reject('malformed-submission', `duplicate file entry for ${file.box}`);
    seen.add(key);
  }

  const agreementPath = resolve(options.agreementPath);
  let agreementBytes: Buffer;
  try { agreementBytes = readFileSync(agreementPath); }
  catch { throw new SubmissionFailed(`cannot read agreement ${agreementPath}`); }
  let agreementRaw: unknown;
  try { agreementRaw = JSON.parse(agreementBytes.toString('utf8')); }
  catch { throw new SubmissionFailed(`agreement ${agreementPath} is not valid JSON`); }
  const agreement = parseAgreement(agreementRaw); // AgreementInvalid propagates: owner-side input error

  if (submission.agreementSha256 !== sha256(agreementBytes)) {
    return reject('agreement-mismatch', `submission was sealed against a different agreement than ${agreementPath}`);
  }
  if (submission.box.id !== agreement.box.id || submission.box.version !== agreement.box.version) {
    return reject('box-mismatch', `submission is for box ${submission.box.id}@${submission.box.version}, but the agreement is ${agreement.box.id}@${agreement.box.version}`);
  }

  const repo = resolve(options.repoPath);
  const expectedBase = options.baseCommit ?? agreement.baseCommit ?? git(repo, ['rev-parse', 'HEAD']);
  const baseSource: SubmissionReport['baseSource'] = options.baseCommit !== undefined ? 'flag' : agreement.baseCommit !== undefined ? 'agreement' : 'repo-head';
  if (submission.baseCommit !== expectedBase) {
    return reject('base-commit-mismatch', `submission pins base ${submission.baseCommit} but the expected base is ${expectedBase} (${baseSource})`);
  }

  if (options.boxDir !== undefined) {
    const retained = join(resolve(options.boxDir), 'box.json');
    let retainedBytes: Buffer;
    try { retainedBytes = readFileSync(retained); }
    catch { throw new SubmissionFailed(`cannot read retained manifest ${retained}`); }
    if (sha256(retainedBytes) !== submission.boxJsonSha256) {
      return reject('box-json-mismatch', 'the manifest the recipient sealed against is not the retained export box.json');
    }
  }

  const expected = new Map(agreement.editable.map(entry => [entry.box.toLowerCase(), entry]));
  for (const file of submission.files) {
    const entry = expected.get(file.box.toLowerCase());
    if (entry === undefined) return reject('outside-editable', `${file.box} is not an editable path in the agreement`);
    if (file.owner.toLowerCase() !== entry.owner.toLowerCase()) {
      return reject('agreement-mismatch', `submission maps ${file.box} to owner path ${file.owner}, but the agreement declares ${entry.owner}`);
    }
  }
  const missing = agreement.editable.filter(entry => !seen.has(entry.box.toLowerCase()));
  if (missing.length > 0) return reject('missing-editable', `submission omits editable path(s): ${missing.map(entry => entry.box).join(', ')}`);

  // Baselines: a copy editable's baseline is the owner blob at the base commit; a
  // generated scaffold's baseline is the deterministic generator output. Blob bytes
  // equal shipped bytes because .gitattributes pins `-text` for every path.
  const prefix = agreement.sourceRoot === '.' ? '' : `${toPosix(agreement.sourceRoot)}/`;
  const applies: SubmissionApply[] = [];
  for (const file of submission.files) {
    const entry = expected.get(file.box.toLowerCase());
    if (entry === undefined) continue; // unreachable: scope check above passed
    let baseline: string;
    if (entry.kind === 'copy') {
      let blob: Buffer;
      try { blob = gitBytes(repo, ['show', `${expectedBase}:${prefix}${entry.owner}`]); }
      catch (error) { return reject('baseline-mismatch', `cannot read ${entry.owner} at ${expectedBase}: ${error instanceof Error ? error.message : String(error)}`); }
      baseline = sha256(blob);
    } else {
      baseline = sha256(generate(entry.generator));
    }
    if (file.baselineSha256 !== baseline) {
      return reject('baseline-mismatch', `${file.box} declares baseline ${file.baselineSha256 ?? 'none'} but the owner baseline is ${baseline}`);
    }
    applies.push({ owner: entry.owner, box: entry.box, changed: file.sha256 !== baseline, sha256: file.sha256, bytes: Buffer.byteLength(file.content, 'utf8') });
  }
  return {
    accepted: true,
    box: submission.box,
    baseCommit: submission.baseCommit,
    expectedBaseCommit: expectedBase,
    baseSource,
    applies: applies.sort((left, right) => left.owner.localeCompare(right.owner))
  };
}
