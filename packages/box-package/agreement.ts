import { z } from 'zod';
import { GitCommitSchema } from '../box-contracts/index.js';
import { isPortablePath } from '../contracts/paths.js';

// The export agreement is the owner-approved surface for one Box: it declares the outcome,
// the base commit, the editable surface (with package-to-owner mapping), the module
// entrypoints the compiler closure walks from, read-context roots, declared dependencies,
// excluded prefixes, checks, and the submission contract. Parsing is the boundary: every
// path is validated here so selection and export can trust the typed model.

const PortablePath = z.string().refine(isPortablePath, 'Unsafe portable relative path.');
const Prefix = z.string().refine(value => value.endsWith('/') && isPortablePath(value.slice(0, -1)), 'Excluded prefixes must be portable paths ending in "/".');
const GeneratorId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const EditableEntrySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('copy'), owner: PortablePath, box: PortablePath }),
  z.strictObject({ kind: z.literal('generated-scaffold'), owner: PortablePath, box: PortablePath, generator: GeneratorId })
]);
export type EditableEntry = z.infer<typeof EditableEntrySchema>;

export const DEFAULT_INVENTORY_EXCLUDE = ['node_modules/', 'dist/', '.git/', 'reference-solutions/'];

// A declared check is agreement data, not registered code: a pinned tool name, its
// argv, the directory it runs in (relative to the context root), where it runs
// (owner: the owner repository/scratch clone; recipient: the exported box folder)
// and what a nonzero exit means (guard: preexisting behavior that must stay green;
// outcome: the requested change that the untouched base must fail). There is no
// shell — argv reaches the tool verbatim.
export const CheckToolSchema = z.enum(['node', 'pnpm', 'tsc', 'vitest']);
export type CheckTool = z.infer<typeof CheckToolSchema>;
export const CommandCheckSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  tool: CheckToolSchema,
  args: z.array(z.string().min(1).max(512)).max(32),
  cwd: z.string().refine(value => value === '.' || isPortablePath(value), 'cwd must be "." or a portable path.'),
  context: z.enum(['owner', 'recipient']),
  role: z.enum(['guard', 'outcome']),
  timeoutMs: z.number().int().positive().max(600_000).default(120_000)
});
export type CommandCheck = z.infer<typeof CommandCheckSchema>;

export const BoxAgreementSchema = z.strictObject({
  schemaVersion: z.literal(1),
  box: z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
    name: z.string().min(1).max(240),
    version: z.number().int().positive().max(1024)
  }),
  outcome: z.string().min(1).max(16000),
  baseCommit: GitCommitSchema.optional(),
  sourceRoot: z.string().refine(value => value === '.' || isPortablePath(value), 'sourceRoot must be "." or a portable path.'),
  entrypoints: z.array(PortablePath).max(64),
  editable: z.array(EditableEntrySchema).min(1).max(64),
  readContext: z.array(PortablePath).max(64).default([]),
  declaredDependencies: z.record(z.string().min(1).max(128), z.string().min(1).max(64)),
  excludedPrefixes: z.array(Prefix).min(1).max(64),
  inventoryExcludePrefixes: z.array(Prefix).max(64).default([...DEFAULT_INVENTORY_EXCLUDE]),
  toolchain: z.strictObject({
    node: z.string().min(1).max(64),
    pnpm: z.string().min(1).max(64),
    typescript: z.string().min(1).max(64),
    vitest: z.string().min(1).max(64),
    typesNode: z.string().min(1).max(64)
  }),
  checks: z.array(z.string().min(1).max(256)).min(1).max(16),
  evaluator: z.array(z.strictObject({ box: PortablePath, generator: GeneratorId })).max(16).default([]),
  commands: z.array(CommandCheckSchema).max(16).default([]),
  submission: z.strictObject({
    format: z.literal('editable-overlay'),
    instructions: z.string().min(1).max(4000)
  })
}).refine(
  value => value.evaluator.length > 0 || value.commands.length > 0,
  'agreement must declare at least one evaluator generator or command check'
);
export type BoxAgreement = z.infer<typeof BoxAgreementSchema>;

export class AgreementInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgreementInvalid';
  }
}

export function parseAgreement(raw: unknown): BoxAgreement {
  const parsed = BoxAgreementSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AgreementInvalid(`agreement invalid: ${issue ? `${issue.path.join('.') || '(root)'}: ${issue.message}` : 'unknown issue'}`);
  }
  return parsed.data;
}
