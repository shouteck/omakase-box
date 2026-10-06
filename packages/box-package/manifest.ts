import { z } from 'zod';
import { GitCommitSchema } from '../box-contracts/index.js';
import { isPortablePath } from '../contracts/paths.js';
import { CommandCheckSchema, NodejsHelperSchema, RequiredToolSchema, SetupCommandSchema } from './agreement.js';

// box.json is the self-describing manifest inside every exported Box folder: it carries the
// outcome, the pinned base commit, per-file provenance (owner path -> package path, or
// generated), the declared read context, checks, disclosure share and the submission
// contract D2.2 needs. Defined here (not in box-contracts): the folder format is the
// packaging station's contract, separate from the D1.x store/API schemas.

const PortablePath = z.string().refine(isPortablePath, 'Unsafe portable relative path.');
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const BoxFileSchema = z.strictObject({
  box: PortablePath,
  owner: PortablePath.nullable(),
  origin: z.enum(['runnable', 'editable', 'generated']),
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative()
});
export const BoxManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  box: z.strictObject({ id: z.string().min(1).max(64), name: z.string().min(1).max(240), version: z.number().int().positive() }),
  outcome: z.string().min(1),
  baseCommit: GitCommitSchema,
  agreementSha256: Sha256Schema,
  sourceRoot: z.string().min(1).max(240),
  nodejs: NodejsHelperSchema.optional(),
  requires: z.array(RequiredToolSchema).max(32).default([]),
  declaredDependencies: z.record(z.string(), z.string()),
  files: z.array(BoxFileSchema).min(1),
  editable: z.array(z.strictObject({ box: PortablePath, owner: PortablePath })).min(1),
  readContext: z.array(PortablePath),
  checks: z.array(z.string().min(1)).min(1),
  evaluator: z.array(z.strictObject({ box: PortablePath, generator: z.string() })).max(16).default([]),
  setup: z.array(SetupCommandSchema).max(16).default([]),
  commands: z.array(CommandCheckSchema).max(16).default([]),
  // The untouched-base record for each declared owner-context check, captured at
  // export: the declared tool/argv/cwd, context and role, exit, bounded log,
  // seconds. The declared command is recorded, not the resolved host path — the
  // folder must carry no owner-machine absolute paths.
  baseChecks: z.array(z.strictObject({
    name: z.string().min(1),
    program: z.string().min(1),
    argv: z.array(z.string()),
    cwd: z.string().min(1),
    context: z.enum(['owner', 'recipient']),
    role: z.enum(['setup', 'guard', 'outcome']),
    exit: z.number().int().nullable(),
    result: z.enum(['pass', 'fail', 'timeout', 'error']),
    log: z.string(),
    seconds: z.number().nonnegative()
  })).default([]),
  paired: z.array(z.strictObject({
    name: z.string().min(1),
    program: z.string().min(1),
    argv: z.array(z.string()),
    cwd: z.string().min(1),
    owner: z.strictObject({ exit: z.number().int().nullable(), result: z.enum(['pass', 'fail', 'timeout', 'error']), log: z.string(), seconds: z.number().nonnegative() }),
    box: z.strictObject({ exit: z.number().int().nullable(), result: z.enum(['pass', 'fail', 'timeout', 'error']), log: z.string(), seconds: z.number().nonnegative() })
  })).default([]),
  warnings: z.array(z.string()).default([]),
  submission: z.strictObject({
    format: z.literal('editable-overlay'),
    tool: z.literal('box/submit.mjs'),
    editable: z.array(z.strictObject({ box: PortablePath, owner: PortablePath })).min(1),
    instructions: z.string().min(1)
  }),
  disclosure: z.strictObject({
    shippedOwnerFiles: z.number().int().nonnegative(),
    inventoryFiles: z.number().int().nonnegative(),
    share: z.number().nonnegative().max(1)
  })
});
export type BoxManifest = z.infer<typeof BoxManifestSchema>;
export type BoxFile = z.infer<typeof BoxFileSchema>;
