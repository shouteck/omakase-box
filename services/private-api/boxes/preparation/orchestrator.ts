import { randomUUID } from 'node:crypto';
import type { SessionActor } from '../../../../packages/contracts/auth/store.js';
import { OpaqueIdSchema } from '../../../../packages/contracts/common.js';
import { byteHash, contentHash } from '../../../../packages/contracts/hash.js';
import { BehaviorArtifactSchema } from '../../../../packages/box-contracts/index.js';
import type { BehaviorArtifact, BoxVersion } from '../../../../packages/box-contracts/index.js';
import { WorkflowError } from '../../../../packages/contracts/workflow/index.js';
import type { PrivateIntakeStore } from '../../requests/store.js';
import type { IntentOrchestration } from '../../intents/orchestrator.js';
import type { BoxStore } from '../store/store.js';
import type { SnapshotSource } from '../../requests/types.js';
import {
  BehaviorApprovalInputSchema, BoxAgreementProjectionSchema, BoxInvalid, ENVIRONMENT_DESCRIPTOR, ENVIRONMENT_REFERENCE, EVALUATOR_DESCRIPTOR, EVALUATOR_REFERENCE,
  EnvironmentRefSchema, EvaluatorRefSchema, MERGE_TARGET_BRANCH, MERGE_TARGET_REFERENCE, MergeTargetSchema, PRIVATE_SHOP_CASES, PRIVATE_SHOP_FILE_ROLES,
  PRIVATE_SHOP_INITIAL_COUPLING, PRIVATE_SHOP_MANIFEST_LABEL, PRIVATE_SHOP_PLANNER_EXCLUDED, PRIVATE_SHOP_PROTECTED_PATHS, PrepareInputSchema, ReadinessInputSchema,
  RegisterRepositoryInputSchema, RevisionInputSchema, UNSUPPORTED_COUPLING_CASE, UnsupportedCase
} from './types.js';
import type { BoxAgreementProjection, BoxPreparationOrchestration, EnvironmentRef, EvaluatorRef, MergeTarget, RegisteredRepository, SupportedCase } from './types.js';

const environmentRef = (): EnvironmentRef => EnvironmentRefSchema.parse({ reference: ENVIRONMENT_REFERENCE, digest: 'sha256:' + byteHash(Buffer.from(JSON.stringify(ENVIRONMENT_DESCRIPTOR), 'utf8')) });
const evaluatorRef = (): EvaluatorRef => EvaluatorRefSchema.parse({ reference: EVALUATOR_REFERENCE, version: 1, digest: byteHash(Buffer.from(JSON.stringify(EVALUATOR_DESCRIPTOR), 'utf8')) });

interface RepositoryRow { repo_id: string; snapshot_id: string; source_id: string; source_root: string; base_commit: string; context_manifest: Record<string, unknown>; context_manifest_hash: string; environment_ref: unknown; evaluator_ref: unknown; merge_target: unknown; registered_by: string; registered_at: unknown }
interface PreparedRead { boxId: string; version: number; state: string; contentHash: string; version_payload: BoxVersion; approval: { approval_id: string; artifact_hash: string; approved_by: string; created_at: unknown } | null; supersededApproval: boolean; artifact: unknown; repository: RepositoryRow | null }

const timestamp = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);

export class BoxPreparationOrchestrator implements BoxPreparationOrchestration {
  constructor(private readonly intake: PrivateIntakeStore, private readonly intents: IntentOrchestration, private readonly boxes: BoxStore, private readonly sources: readonly SnapshotSource[]) {}

  private supportedCase(supportedCaseId: string): SupportedCase {
    const descriptor = PRIVATE_SHOP_CASES[supportedCaseId];
    if (supportedCaseId === UNSUPPORTED_COUPLING_CASE || !descriptor) throw new UnsupportedCase();
    return descriptor;
  }

  private manifestPlan(): Record<string, unknown> {
    const cases: Record<string, unknown> = {};
    for (const descriptor of Object.values(PRIVATE_SHOP_CASES)) cases[descriptor.supportedCaseId] = { editableSurface: [...descriptor.editableSurface], runnable: [...descriptor.runnable], explanatory: [...descriptor.explanatory], packageMap: { ...descriptor.packageMap }, dependencyVersions: { ...descriptor.dependencyVersions }, runnableChecks: [...descriptor.runnableChecks] };
    return { label: PRIVATE_SHOP_MANIFEST_LABEL, fileRoles: { ...PRIVATE_SHOP_FILE_ROLES }, protectedPaths: [...PRIVATE_SHOP_PROTECTED_PATHS], plannerExcludedPaths: [...PRIVATE_SHOP_PLANNER_EXCLUDED], initialCoupling: PRIVATE_SHOP_INITIAL_COUPLING.map(item => ({ ...item })), cases, environmentDescriptor: { ...ENVIRONMENT_DESCRIPTOR }, evaluatorDescriptor: { ...EVALUATOR_DESCRIPTOR } };
  }

  async registerRepository(actor: SessionActor, body: unknown) {
    const input = RegisterRepositoryInputSchema.parse(body);
    const source = this.sources.find(item => item.id === input.sourceId);
    if (!source) throw new BoxInvalid();
    const environment = environmentRef();
    const evaluator = evaluatorRef();
    const mergeTarget = MergeTargetSchema.parse({ reference: MERGE_TARGET_REFERENCE, branch: MERGE_TARGET_BRANCH, expectedCommit: input.baseCommit });
    const result = await this.boxes.registerRepository(actor, { source, baseCommit: input.baseCommit, manifest: this.manifestPlan(), environmentRef: environment, evaluatorRef: evaluator, mergeTarget }, input.operationKey);
    return { repoId: result.repoId, snapshotId: result.snapshotId, snapshotHash: result.snapshotHash, fileCount: result.fileCount, baseCommit: result.baseCommit, contextManifestHash: result.contextManifestHash };
  }

  private async approvedIntent(actor: SessionActor, requestId: string) {
    const intent = await this.intents.currentForRequest(actor, requestId);
    if (intent.state !== 'approved' || intent.approval === null || intent.supersededApproval || intent.blockage.requiredUnresolved !== 0) throw new WorkflowError('missing_evidence');
    return intent;
  }

  private async approvedIntentBinding(actor: SessionActor, provenance: { intentId: string; intentVersion: number; contentHash: string }) {
    const intent = await this.intents.review(actor, provenance.intentId);
    if (intent.state !== 'approved' || intent.approval === null || intent.supersededApproval || intent.blockage.requiredUnresolved !== 0) throw new WorkflowError('missing_evidence');
    if (intent.version !== provenance.intentVersion || intent.contentHash !== provenance.contentHash) throw new WorkflowError('missing_evidence');
    return intent;
  }

  private assertRequestGrounding(descriptor: SupportedCase, request: { goal: string; currentBehaviour: string; desiredBehaviour: string; constraints: string[]; exclusions: string[] }) {
    const haystack = [request.goal, request.currentBehaviour, request.desiredBehaviour, ...request.constraints, ...request.exclusions].join('\n');
    for (const marker of descriptor.requiredMarkers) if (!haystack.includes(marker)) throw new UnsupportedCase();
  }

  private deriveArtifact(descriptor: SupportedCase, request: { id: string; goal: string; desiredBehaviour: string; exclusions: string[] }, intent: { id: string; version: number; contentHash: string }): BehaviorArtifact {
    return BehaviorArtifactSchema.parse({
      schemaVersion: 1,
      artifactId: randomUUID(),
      profile: 'open_trusted',
      intent: { intentId: intent.id, intentVersion: intent.version, contentHash: intent.contentHash },
      goal: request.desiredBehaviour.trim().length > 0 ? request.desiredBehaviour : request.goal,
      acceptanceExamples: [...descriptor.requirements],
      assumptions: [...descriptor.assumptions],
      unknowns: [...descriptor.unknowns],
      scope: { included: [`Private request ${request.id} supplied the owner request text for this Box preparation.`, ...descriptor.scopeIncluded], excluded: [...descriptor.scopeExcluded, ...request.exclusions] }
    });
  }

  private deriveVersion(descriptor: SupportedCase, artifact: BehaviorArtifact, artifactHash: string, repository: RegisteredRepository, intent: { id: string; version: number; contentHash: string }, boxId: string, version: number): BoxVersion {
    const requirements = descriptor.requirements.map(requirement => ({ ...requirement, inputs: [...requirement.inputs], outputs: [...requirement.outputs], states: [...requirement.states], invalidCases: [...requirement.invalidCases], exclusions: [...requirement.exclusions], examples: requirement.examples.map(item => ({ ...item })) }));
    return {
      schemaVersion: 1,
      boxId,
      version,
      profile: 'open_trusted',
      repoId: repository.repoId,
      baseCommit: repository.baseCommit,
      intent: { intentId: intent.id, intentVersion: intent.version, contentHash: intent.contentHash },
      behaviorArtifact: { artifactId: artifact.artifactId, contentHash: artifactHash },
      contextManifest: { reference: repository.repoId, contentHash: repository.contextManifestHash },
      editableSurface: [...descriptor.editableSurface],
      environmentRef: repository.environmentRef,
      evaluatorRef: repository.evaluatorRef,
      disciplines: [...descriptor.disciplines],
      workUnits: [{ id: 'unit-1', adapterKind: descriptor.adapterKind, adapterVersion: 1, requirementIds: requirements.map(requirement => requirement.id), editablePaths: [...descriptor.editableSurface], interfaceIds: [], trustedCheckIds: ['check-' + descriptor.supportedCaseId.split('.').pop()], requiredCapabilities: [...descriptor.requiredCapabilities] as BoxVersion['workUnits'][number]['requiredCapabilities'], startAfterUnitIds: [] }],
      interfaces: [],
      requirements,
      endToEndObligations: [],
      attemptPolicy: { maxAttempts: 2, allowedExecutorKinds: ['human', 'agent', 'hybrid'] },
      executorPolicy: { explicitChoiceRequired: true, allowSimulatorLabelled: false },
      mergeTarget: repository.mergeTarget,
      artifactHashes: { agreement: artifactHash, 'context-manifest': repository.contextManifestHash, evaluator: repository.evaluatorRef.digest }
    };
  }

  private async repository(actor: SessionActor, repoId: string): Promise<RegisteredRepository> {
    const row = await this.boxes.registeredRepository(actor, repoId);
    return {
      repoId: row.repoId, snapshotId: row.snapshotId, snapshotHash: row.snapshotHash, sourceId: row.sourceId, sourceRoot: row.sourceRoot, baseCommit: row.baseCommit,
      contextManifest: row.contextManifest, contextManifestHash: row.contextManifestHash,
      environmentRef: EnvironmentRefSchema.parse(row.environmentRef), evaluatorRef: EvaluatorRefSchema.parse(row.evaluatorRef), mergeTarget: MergeTargetSchema.parse(row.mergeTarget),
      registeredBy: String(row.registeredBy), registeredAt: timestamp(row.registeredAt)
    };
  }

  private projection(read: PreparedRead, descriptor: SupportedCase | null, repository: RegisteredRepository): BoxAgreementProjection {
    const payload = read.version_payload;
    const artifact = BehaviorArtifactSchema.parse(read.artifact);
    const blockingReasons: string[] = [];
    if (read.approval === null) blockingReasons.push('owner behavior approval for this exact version is missing');
    if (artifact.unknowns.length > 0) blockingReasons.push('consequential unknowns remain unresolved');
    if (descriptor === null) blockingReasons.push('supported-case binding is not recorded');
    return BoxAgreementProjectionSchema.parse({
      boxId: read.boxId,
      version: read.version,
      state: read.state,
      contentHash: read.contentHash,
      repoId: payload.repoId,
      snapshotId: repository.snapshotId,
      snapshotHash: repository.snapshotHash,
      sourceId: repository.sourceId,
      baseCommit: payload.baseCommit,
      supportedCaseId: descriptor?.supportedCaseId ?? 'unsupported',
      intent: payload.intent,
      goal: artifact.goal,
      facts: (descriptor?.truths ?? []).map(statement => ({ statement, assurance: 'unverified' as const })),
      assumptions: artifact.assumptions,
      unknowns: artifact.unknowns,
      acceptanceExamples: artifact.acceptanceExamples,
      scope: artifact.scope,
      editableSurface: payload.editableSurface,
      runnable: descriptor?.runnable ?? [],
      explanatory: descriptor?.explanatory ?? [],
      packageMap: descriptor?.packageMap ?? {},
      dependencyVersions: descriptor?.dependencyVersions ?? {},
      runnableChecks: descriptor?.runnableChecks ?? [],
      truths: descriptor?.truths ?? [],
      environmentRef: payload.environmentRef,
      evaluatorRef: payload.evaluatorRef,
      mergeTarget: payload.mergeTarget,
      artifactHashes: payload.artifactHashes,
      approval: read.approval ? { approvalId: read.approval.approval_id, artifactHash: read.approval.artifact_hash, approvedBy: read.approval.approved_by, approvedAt: timestamp(read.approval.created_at) } : null,
      supersededApproval: read.supersededApproval,
      blockingReasons,
      manifestLabel: typeof repository.contextManifest.label === 'string' ? repository.contextManifest.label : 'unregistered'
    });
  }

  private descriptorFor(payload: BoxVersion): SupportedCase | null {
    const key = payload.workUnits[0]?.trustedCheckIds[0]?.replace(/^check-/, '');
    for (const descriptor of Object.values(PRIVATE_SHOP_CASES)) if (descriptor.supportedCaseId.endsWith('.' + key)) return descriptor;
    return null;
  }

  async agreement(actor: SessionActor, boxId: unknown): Promise<BoxAgreementProjection> {
    if (typeof boxId !== 'string' || !OpaqueIdSchema.safeParse(boxId).success) throw new BoxInvalid();
    const read = await this.boxes.readPrepared(actor, boxId) as PreparedRead;
    if (read.repository === null) throw new WorkflowError('missing_evidence');
    const repository = await this.repository(actor, read.repository.repo_id);
    return this.projection(read, this.descriptorFor(read.version_payload), repository);
  }

  async prepare(actor: SessionActor, body: unknown) {
    const input = PrepareInputSchema.parse(body);
    const descriptor = this.supportedCase(input.supportedCaseId);
    const request = await this.intake.request(actor, input.requestId);
    this.assertRequestGrounding(descriptor, request);
    const intent = await this.approvedIntent(actor, input.requestId);
    const repository = await this.repository(actor, input.repositoryId);
    if (repository.snapshotId !== request.snapshotId) throw new WorkflowError('missing_evidence');
    for (const path of descriptor.editableSurface) if (PRIVATE_SHOP_PROTECTED_PATHS.includes(path as never)) throw new WorkflowError('missing_evidence');
    const artifact = this.deriveArtifact(descriptor, request, intent);
    const version = this.deriveVersion(descriptor, artifact, contentHash(artifact), repository, intent, randomUUID(), 1);
    const created = await this.boxes.createPrepared(actor, { artifact, version }, input.operationKey);
    const agreement = await this.agreement(actor, created.boxId);
    return { boxId: created.boxId, version: created.version, state: 'draft', contentHash: created.contentHash, agreement };
  }

  async approve(actor: SessionActor, boxId: unknown, body: unknown) {
    if (typeof boxId !== 'string' || !OpaqueIdSchema.safeParse(boxId).success) throw new BoxInvalid();
    const input = BehaviorApprovalInputSchema.parse(body);
    const read = await this.boxes.readPrepared(actor, boxId) as PreparedRead;
    if (read.version !== input.expectedVersion) throw new WorkflowError('stale_version');
    const artifact = BehaviorArtifactSchema.parse(read.artifact);
    if (artifact.unknowns.length > 0) throw new WorkflowError('missing_evidence');
    await this.approvedIntentBinding(actor, artifact.intent);
    const result = await this.boxes.approveBehavior(actor, boxId, input.expectedVersion, input.expectedHash, input.approvalId, input.operationKey);
    return { boxId: result.boxId, version: result.version, state: 'draft', approvedHash: result.artifactHash };
  }

  async readiness(actor: SessionActor, boxId: unknown, body: unknown) {
    if (typeof boxId !== 'string' || !OpaqueIdSchema.safeParse(boxId).success) throw new BoxInvalid();
    const input = ReadinessInputSchema.parse(body);
    const read = await this.boxes.readPrepared(actor, boxId) as PreparedRead;
    const artifact = BehaviorArtifactSchema.parse(read.artifact);
    if (artifact.unknowns.length > 0 || read.approval === null) throw new WorkflowError('missing_evidence');
    await this.approvedIntentBinding(actor, artifact.intent);
    if (read.state === 'open' && read.version === input.expectedVersion) return { boxId, version: read.version, state: 'open' };
    const result = await this.boxes.transition(actor, boxId, input.expectedVersion, 'open');
    return { boxId: result.boxId, version: result.version, state: result.state };
  }

  async revise(actor: SessionActor, boxId: unknown, body: unknown) {
    if (typeof boxId !== 'string' || !OpaqueIdSchema.safeParse(boxId).success) throw new BoxInvalid();
    const input = RevisionInputSchema.parse(body);
    const artifact = BehaviorArtifactSchema.parse(input.artifact);
    const read = await this.boxes.readPrepared(actor, boxId) as PreparedRead;
    const current = read.version_payload;
    if (current.repoId === undefined || artifact.intent.intentId !== current.intent.intentId || artifact.intent.intentVersion !== current.intent.intentVersion || artifact.intent.contentHash !== current.intent.contentHash) throw new WorkflowError('missing_evidence');
    const descriptor = this.descriptorFor(current);
    if (descriptor === null) throw new WorkflowError('missing_evidence');
    const requiredIds = current.requirements.map(requirement => requirement.id).sort();
    const providedIds = artifact.acceptanceExamples.map(requirement => requirement.id).sort();
    if (JSON.stringify(requiredIds) !== JSON.stringify(providedIds)) throw new WorkflowError('missing_evidence');
    const artifactHash = contentHash(artifact);
    const next: BoxVersion = { ...current, version: input.expectedVersion + 1, intent: artifact.intent, behaviorArtifact: { artifactId: artifact.artifactId, contentHash: artifactHash }, artifactHashes: { ...current.artifactHashes, agreement: artifactHash } };
    const result = await this.boxes.revisePrepared(actor, boxId, input.expectedVersion, { artifact, version: next }, input.operationKey);
    return { boxId: result.boxId, version: result.version, state: 'draft', contentHash: result.contentHash, approvalInvalidated: result.approvalInvalidated };
  }
}

export function boxPreparationOrchestration(intake: PrivateIntakeStore, intents: IntentOrchestration, boxes: BoxStore, sources: readonly SnapshotSource[]): BoxPreparationOrchestration {
  return new BoxPreparationOrchestrator(intake, intents, boxes, sources);
}
