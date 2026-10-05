import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import { AuthDenied } from '../../../../packages/contracts/auth/store.js';
import { HashSchema, IdSchema, OpaqueIdSchema, RequirementSchema, TextSchema, VersionSchema } from '../../../../packages/contracts/common.js';
import type { Requirement } from '../../../../packages/contracts/common.js';
import { PortablePathSchema } from '../../../../packages/contracts/paths.js';
import { GitCommitSchema, ImageDigestSchema, IntentProvenanceSchema } from '../../../../packages/box-contracts/index.js';
import { WorkflowError } from '../../../../packages/contracts/workflow/index.js';

export const OperationKeySchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const SourceIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
export const EnvironmentRefSchema = z.strictObject({ reference: IdSchema, digest: ImageDigestSchema });
export const EvaluatorRefSchema = z.strictObject({ reference: IdSchema, version: VersionSchema, digest: HashSchema });
export const MergeTargetSchema = z.strictObject({ reference: IdSchema, branch: IdSchema, expectedCommit: GitCommitSchema });
export type EnvironmentRef = z.infer<typeof EnvironmentRefSchema>;
export type EvaluatorRef = z.infer<typeof EvaluatorRefSchema>;
export type MergeTarget = z.infer<typeof MergeTargetSchema>;

export const RegisterRepositoryInputSchema = z.strictObject({ sourceId: SourceIdSchema, baseCommit: GitCommitSchema, operationKey: OperationKeySchema.optional() });
export const PrepareInputSchema = z.strictObject({ requestId: OpaqueIdSchema, repositoryId: IdSchema, supportedCaseId: z.string().min(1).max(128), operationKey: OperationKeySchema.optional() });
export const BehaviorApprovalInputSchema = z.strictObject({ expectedVersion: VersionSchema, expectedHash: HashSchema, approvalId: OpaqueIdSchema, operationKey: OperationKeySchema.optional() });
export const ReadinessInputSchema = z.strictObject({ expectedVersion: VersionSchema });
export const RevisionInputSchema = z.strictObject({ expectedVersion: VersionSchema, artifact: z.unknown(), operationKey: OperationKeySchema.optional() });

export class BoxInvalid extends Error { constructor() { super('invalid_input'); } }
export class UnsupportedCase extends Error { constructor() { super('unsupported_case'); } }

export const REQUEST_A_CASE = 'delegation.private-shop.request-a.response-policy';
export const REQUEST_B_CASE = 'delegation.private-shop.request-b.public-ranking';
export const UNSUPPORTED_COUPLING_CASE = 'delegation.private-shop.unsupported-private-ui-coupling';

export interface SupportedCase {
  readonly supportedCaseId: string;
  readonly adapterKind: 'application_policy' | 'backend_pure_module';
  readonly requiredCapabilities: readonly string[];
  readonly disciplines: readonly string[];
  readonly editableSurface: readonly string[];
  readonly runnable: readonly string[];
  readonly explanatory: readonly string[];
  readonly packageMap: Readonly<Record<string, string>>;
  readonly dependencyVersions: Readonly<Record<string, string>>;
  readonly runnableChecks: readonly string[];
  readonly truths: readonly string[];
  readonly requirements: readonly Requirement[];
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly scopeIncluded: readonly string[];
  readonly scopeExcluded: readonly string[];
  readonly requiredMarkers: readonly string[];
}

const REQUEST_A_REQUIREMENTS: readonly Requirement[] = [{
  id: 'response-policy-hardening',
  description: "config/response-security.json must declare frameAncestors 'none', noSniff true, referrerPolicy 'no-referrer', and hsts {enabled:true,maxAgeSeconds:31536000,includeSubDomains:false}.",
  inputs: ['config/response-security.json'],
  outputs: ['hardened response policy data'],
  states: ['/health remains exempt from all four policy headers'],
  invalidCases: ['application code changes', 'new dependencies added', '/health receiving policy headers'],
  exclusions: ['this agreement does not perform the requested configuration change itself'],
  examples: [
    { given: 'the hardened config values', when: 'applyResponsePolicy is called with https:true, localhost:false on a non-/health route', then: "it emits Content-Security-Policy frame-ancestors 'none', Referrer-Policy no-referrer, X-Content-Type-Options nosniff and Strict-Transport-Security max-age=31536000" },
    { given: 'the same hardened config', when: 'the live localhost server responds on /selection with localhost:true', then: 'the non-HSTS hardening headers are present and Strict-Transport-Security is absent' },
    { given: 'any request to /health', when: 'the response policy is applied', then: 'none of the four policy headers is emitted' }
  ]
}];

const REQUEST_B_REQUIREMENTS: readonly Requirement[] = [{
  id: 'public-deterministic-ranking',
  description: 'A new src/ranking/rankItems.ts exports PublicItem, InvalidInput and rankItems; rankItems leaves its input untouched, orders equal scores by ASCII id ascending, and rejects malformed input instead of ranking it.',
  inputs: ['readonly PublicItem[]'],
  outputs: ['PublicItem[] sorted by score with ASCII id tie-break'],
  states: ['input array retains its original order after the call'],
  invalidCases: ['non-ASCII ids', 'non-finite scores', 'duplicate ids', 'more than 1000 items', 'malformed members'],
  exclusions: ['no privateScore or any import of protected src/private/scoring.ts in runnable or contribution source', 'no edit to rankPrivateItems.ts or its callers', 'no new production dependency'],
  examples: [
    { given: "[{id:'z1',score:2},{id:'a2',score:2},{id:'m',score:5}]", when: 'rankItems is called', then: "it returns [{id:'m',score:5},{id:'a2',score:2},{id:'z1',score:2}] and the input array retains its original order" },
    { given: "[{id:'b',score:1},{id:'a',score:1}]", when: 'rankItems is called', then: "it returns ids ['a','b']" },
    { given: 'an item with score NaN', when: 'rankItems is called', then: 'it throws InvalidInput' }
  ]
}];

export const PRIVATE_SHOP_CASES: Readonly<Record<string, SupportedCase>> = {
  [REQUEST_A_CASE]: {
    supportedCaseId: REQUEST_A_CASE,
    adapterKind: 'application_policy',
    requiredCapabilities: ['data_only_policy'],
    disciplines: ['backend', 'security'],
    editableSurface: ['config/response-security.json'],
    runnable: ['src/policy/loader.ts', 'src/policy/strict-json.ts', 'src/config/response-security.json'],
    explanatory: ['src/server.ts', 'src/selection/api.ts'],
    packageMap: { 'src/policy/loader.ts': 'src/policy/loader.ts', 'src/policy/strict-json.ts': 'src/policy/strict-json.ts', 'src/config/response-security.json': 'config/response-security.json' },
    dependencyVersions: { zod: '4.6.5' },
    runnableChecks: ['pnpm exec tsc --noEmit', 'pnpm exec vitest run evaluator/request-a.test.ts'],
    truths: [
      "Helper-level truth: applyResponsePolicy emits Strict-Transport-Security: max-age=31536000 only when its context is https:true and localhost:false on a non-/health route.",
      'Live-current-localhost truth: src/server.ts calls the policy helper with localhost:true, so a local /selection response shows the non-HSTS hardening headers and no Strict-Transport-Security header; /health stays exempt from all four policy headers.',
      'This agreement only agrees the bounded work; it does not perform the requested configuration or ranking change itself.'
    ],
    requirements: REQUEST_A_REQUIREMENTS,
    assumptions: ['Owner applies the returned patch to the real repository and verifies both helper-level and live-localhost truth.', 'src/policy/strict-json.ts travels as read-only shared helper source.'],
    unknowns: [],
    scopeIncluded: ['editable config/response-security.json', 'runnable policy loader and strict JSON helper', 'safe explanatory src/server.ts and src/selection/api.ts'],
    scopeExcluded: ['protected src/private/eligibility.ts and src/private/scoring.ts raw source is never exported', 'src/selection/SelectionPanel.tsx, src/main.tsx, index.html, vite.config.ts, dist/, node_modules/ and reference-solutions/ are out of scope', 'no package export, recipient execution or owner merge in this phase'],
    requiredMarkers: ['response-security.json', 'hsts', 'frameAncestors']
  },
  [REQUEST_B_CASE]: {
    supportedCaseId: REQUEST_B_CASE,
    adapterKind: 'backend_pure_module',
    requiredCapabilities: ['restricted_process'],
    disciplines: ['backend'],
    editableSurface: ['src/ranking/rankItems.ts'],
    runnable: ['src/ranking/rankItems.ts'],
    explanatory: ['src/ranking/rankPrivateItems.ts', 'src/selection/api.ts'],
    packageMap: { 'src/ranking/rankItems.ts': 'src/ranking/rankItems.ts' },
    dependencyVersions: {},
    runnableChecks: ['pnpm exec tsc --noEmit', 'pnpm exec vitest run evaluator/request-b.test.ts'],
    truths: [
      'rankItems is a new owner-approved file; rankPrivateItems.ts and its callers stay unchanged and caller migration is an owner-side decision outside this Box.',
      'Runnable and contribution source must contain no privateScore and no import of protected src/private/scoring.ts; the coupling may appear only in explanatory prose.',
      'This agreement only agrees the bounded work; it does not perform the requested change itself.'
    ],
    requirements: REQUEST_B_REQUIREMENTS,
    assumptions: ['PublicItem/InvalidInput/rankItems follow the explicit public contract declared by the owner request.', 'Request B needs no private-module source and no production dependency.'],
    unknowns: [],
    scopeIncluded: ['new editable src/ranking/rankItems.ts', 'safe explanatory src/ranking/rankPrivateItems.ts and src/selection/api.ts'],
    scopeExcluded: ['protected src/private/eligibility.ts and src/private/scoring.ts raw source is never exported', 'rankPrivateItems.ts edits and caller migration are excluded', 'no package export, recipient execution or owner merge in this phase'],
    requiredMarkers: ['rankItems', 'ASCII']
  }
};

export const PRIVATE_SHOP_FILE_ROLES: Readonly<Record<string, string>> = {
  'src/private/eligibility.ts': 'protected',
  'src/private/scoring.ts': 'protected',
  'src/selection/SelectionPanel.tsx': 'excluded',
  'src/selection/api.ts': 'explanatory',
  'src/ranking/rankPrivateItems.ts': 'explanatory',
  'src/policy/strict-json.ts': 'runnable',
  'src/policy/loader.ts': 'runnable',
  'src/server.ts': 'explanatory',
  'src/main.tsx': 'excluded',
  'config/response-security.json': 'runnable'
};

export const PRIVATE_SHOP_MANIFEST_LABEL = 'private-shop-before-v1';
export const PRIVATE_SHOP_PLANNER_EXCLUDED = ['reference-solutions', 'node_modules', 'dist'] as const;
export const PRIVATE_SHOP_INITIAL_COUPLING = [
  { consumer: 'src/selection/SelectionPanel.tsx', protectedDependency: 'src/private/eligibility.ts' },
  { consumer: 'src/selection/api.ts', protectedDependency: 'src/private/eligibility.ts' },
  { consumer: 'src/ranking/rankPrivateItems.ts', protectedDependency: 'src/private/scoring.ts' }
] as const;
export const PRIVATE_SHOP_PROTECTED_PATHS = ['src/private/eligibility.ts', 'src/private/scoring.ts'] as const;

export const ENVIRONMENT_DESCRIPTOR = { schemaVersion: 1, kind: 'private-shop-preparation-env', toolchain: { node: '>=24.11.0 <25', pnpm: '10.34.5', typescript: '6.0.3', vitest: '5.0.1' }, checkEntrypoints: { 'request-a': ['pnpm exec tsc --noEmit', 'pnpm exec vitest run evaluator/request-a.test.ts'], 'request-b': ['pnpm exec tsc --noEmit', 'pnpm exec vitest run evaluator/request-b.test.ts'] } } as const;
export const EVALUATOR_DESCRIPTOR = { schemaVersion: 1, kind: 'private-shop-preparation-evaluator', version: 1, entrypoints: { 'request-a': 'evaluator/request-a.test.ts', 'request-b': 'evaluator/request-b.test.ts' } } as const;
export const ENVIRONMENT_REFERENCE = 'private-shop-preparation-env';
export const EVALUATOR_REFERENCE = 'private-shop-preparation-evaluator';
export const MERGE_TARGET_REFERENCE = 'owner-private-shop';
export const MERGE_TARGET_BRANCH = 'main';

export interface RegisteredRepository {
  repoId: string; snapshotId: string; snapshotHash: string; sourceId: string; sourceRoot: string; baseCommit: string;
  contextManifest: Record<string, unknown>; contextManifestHash: string;
  environmentRef: EnvironmentRef; evaluatorRef: EvaluatorRef; mergeTarget: MergeTarget;
  registeredBy: string; registeredAt: string;
}

export const BoxAgreementProjectionSchema = z.strictObject({
  boxId: OpaqueIdSchema,
  version: VersionSchema,
  state: z.enum(['draft', 'open', 'closed', 'cancelled']),
  contentHash: HashSchema,
  repoId: IdSchema,
  snapshotId: OpaqueIdSchema,
  snapshotHash: HashSchema,
  sourceId: SourceIdSchema,
  baseCommit: GitCommitSchema,
  supportedCaseId: z.string().min(1).max(128),
  intent: IntentProvenanceSchema,
  goal: TextSchema,
  facts: z.array(z.strictObject({ statement: TextSchema, assurance: z.enum(['tested', 'unverified']) })).max(256),
  assumptions: z.array(TextSchema).max(256),
  unknowns: z.array(TextSchema).max(128),
  acceptanceExamples: z.array(RequirementSchema).max(256),
  scope: z.strictObject({ included: z.array(TextSchema).max(128), excluded: z.array(TextSchema).max(128) }),
  editableSurface: z.array(PortablePathSchema).min(1).max(512),
  runnable: z.array(PortablePathSchema).max(512),
  explanatory: z.array(PortablePathSchema).max(512),
  packageMap: z.record(z.string().min(1).max(240), PortablePathSchema),
  dependencyVersions: z.record(z.string().min(1).max(64), z.string().min(1).max(64)),
  runnableChecks: z.array(TextSchema).max(16),
  truths: z.array(TextSchema).max(16),
  environmentRef: EnvironmentRefSchema,
  evaluatorRef: EvaluatorRefSchema,
  mergeTarget: MergeTargetSchema,
  artifactHashes: z.record(IdSchema, HashSchema),
  approval: z.strictObject({ approvalId: OpaqueIdSchema, artifactHash: HashSchema, approvedBy: z.string().min(1).max(128), approvedAt: z.string().min(1).max(64) }).nullable(),
  supersededApproval: z.boolean(),
  blockingReasons: z.array(TextSchema).max(16),
  manifestLabel: TextSchema
});
export type BoxAgreementProjection = z.infer<typeof BoxAgreementProjectionSchema>;

export interface BoxPreparationOrchestration {
  registerRepository(actor: import('../../../../packages/contracts/auth/store.js').SessionActor, body: unknown): Promise<unknown>;
  prepare(actor: import('../../../../packages/contracts/auth/store.js').SessionActor, body: unknown): Promise<unknown>;
  agreement(actor: import('../../../../packages/contracts/auth/store.js').SessionActor, boxId: unknown): Promise<BoxAgreementProjection>;
  approve(actor: import('../../../../packages/contracts/auth/store.js').SessionActor, boxId: unknown, body: unknown): Promise<unknown>;
  readiness(actor: import('../../../../packages/contracts/auth/store.js').SessionActor, boxId: unknown, body: unknown): Promise<unknown>;
  revise(actor: import('../../../../packages/contracts/auth/store.js').SessionActor, boxId: unknown, body: unknown): Promise<unknown>;
}

export function safeBoxError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError || error instanceof BoxInvalid) return reply.code(400).send({ error: 'invalid_input' });
  if (error instanceof UnsupportedCase) return reply.code(422).send({ error: 'unsupported_case' });
  if (error instanceof AuthDenied) return reply.code(404).send({ error: 'not_found' });
  if (error instanceof WorkflowError) {
    if (error.code === 'forbidden_role') return reply.code(403).send({ error: 'forbidden_role' });
    if (error.code === 'missing_evidence') return reply.code(422).send({ error: 'missing_evidence' });
    if (error.code === 'stale_version' || error.code === 'invalid_transition') return reply.code(409).send({ error: error.code });
    return reply.code(409).send({ error: 'idempotency_conflict' });
  }
  return reply.code(503).send({ error: 'resource_unavailable' });
}
