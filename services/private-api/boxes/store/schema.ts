import { sql } from 'drizzle-orm';
import { char, check, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import type { Attempt, BehaviorArtifact, BoxVersion, EvaluationReceipt } from '../../../../packages/box-contracts/index.js';
import { accounts } from '../../db/schema.js';

export const boxVersionStates = ['draft', 'open', 'closed', 'cancelled'] as const;
export const boxAttemptStates = ['open', 'submitted', 'cancelled', 'closed'] as const;

export const boxBehaviorArtifacts = pgTable('box_behavior_artifacts', {
  artifactId: uuid('artifact_id').primaryKey(),
  payload: jsonb('payload').$type<BehaviorArtifact>().notNull(),
  contentHash: char('content_hash', { length: 64 }).notNull().unique(),
  intentId: uuid('intent_id'),
  createdBy: uuid('created_by').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  check('box_artifact_hash_syntax', sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
  check('box_artifact_profile', sql`${table.payload}->>'profile' = 'open_trusted'`),
  check('box_artifact_id_bound', sql`${table.payload}->>'artifactId' = ${table.artifactId}::text`)
]);

export const boxVersions = pgTable('box_versions', {
  boxId: uuid('box_id').notNull(),
  version: integer('version').notNull(),
  state: text('state', { enum: boxVersionStates }).notNull(),
  payload: jsonb('payload').$type<BoxVersion>().notNull(),
  contentHash: char('content_hash', { length: 64 }).notNull(),
  authorId: uuid('author_id').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  primaryKey({ columns: [table.boxId, table.version] }),
  check('box_version_positive', sql`${table.version} > 0`),
  check('box_version_hash_syntax', sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
  check('box_version_profile', sql`${table.payload}->>'profile' = 'open_trusted'`)
]);

export const boxHeads = pgTable('box_heads', {
  boxId: uuid('box_id').primaryKey(),
  currentVersion: integer('current_version').notNull()
}, table => [
  check('box_head_positive', sql`${table.currentVersion} > 0`),
  foreignKey({ columns: [table.boxId, table.currentVersion], foreignColumns: [boxVersions.boxId, boxVersions.version] })
]);

export const boxBehaviorApprovals = pgTable('box_behavior_approvals', {
  approvalId: uuid('approval_id').primaryKey(),
  boxId: uuid('box_id').notNull(),
  version: integer('version').notNull(),
  artifactHash: char('artifact_hash', { length: 64 }).notNull(),
  approvedBy: uuid('approved_by').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  unique('box_behavior_approval_unique').on(table.boxId, table.version),
  check('box_behavior_approval_hash', sql`${table.artifactHash} ~ '^[a-f0-9]{64}$'`)
]);

export const boxAssignments = pgTable('box_assignments', {
  assignmentId: uuid('assignment_id').primaryKey(),
  boxId: uuid('box_id').notNull(),
  boxVersion: integer('box_version').notNull(),
  boxVersionHash: char('box_version_hash', { length: 64 }).notNull(),
  executorKind: text('executor_kind', { enum: ['human', 'agent', 'hybrid'] }).notNull(),
  executorId: varchar('executor_id', { length: 128 }).notNull(),
  capability: text('capability', { enum: ['attempt.execute', 'attempt.evaluate'] }).notNull(),
  assignedBy: uuid('assigned_by').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  unique('box_assignment_unique').on(table.boxId, table.boxVersion, table.executorId, table.capability),
  check('box_assignment_hash', sql`${table.boxVersionHash} ~ '^[a-f0-9]{64}$'`)
]);

export const boxScopedTokens = pgTable('box_scoped_tokens', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(),
  boxId: uuid('box_id').notNull(),
  attemptId: uuid('attempt_id'),
  capability: text('capability', { enum: ['attempt.execute', 'attempt.evaluate'] }).notNull(),
  actorLabel: varchar('actor_label', { length: 128 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const boxAttempts = pgTable('box_attempts', {
  attemptId: uuid('attempt_id').primaryKey(),
  boxId: uuid('box_id').notNull(),
  boxVersion: integer('box_version').notNull(),
  boxVersionHash: char('box_version_hash', { length: 64 }).notNull(),
  executorKind: text('executor_kind', { enum: ['human', 'agent', 'hybrid'] }).notNull(),
  executorId: varchar('executor_id', { length: 128 }).notNull(),
  baseCommit: char('base_commit', { length: 40 }).notNull(),
  worktreeRef: varchar('worktree_ref', { length: 256 }),
  patchHash: char('patch_hash', { length: 64 }),
  environmentDigest: varchar('environment_digest', { length: 71 }).notNull(),
  evaluatorDigest: char('evaluator_digest', { length: 64 }).notNull(),
  state: text('state', { enum: boxAttemptStates }).notNull(),
  version: integer('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  check('box_attempt_version_positive', sql`${table.version} > 0`),
  check('box_attempt_base_commit', sql`${table.baseCommit} ~ '^[a-f0-9]{40}$'`),
  check('box_attempt_environment', sql`${table.environmentDigest} ~ '^sha256:[a-f0-9]{64}$'`),
  check('box_attempt_evaluator', sql`${table.evaluatorDigest} ~ '^[a-f0-9]{64}$'`),
  check('box_attempt_patch', sql`${table.patchHash} IS NULL OR ${table.patchHash} ~ '^[a-f0-9]{64}$'`)
]);

export const boxEvaluationReceipts = pgTable('box_evaluation_receipts', {
  receiptId: uuid('receipt_id').primaryKey(),
  attemptId: uuid('attempt_id').notNull().references(() => boxAttempts.attemptId),
  boxVersionHash: char('box_version_hash', { length: 64 }).notNull(),
  environmentDigest: varchar('environment_digest', { length: 71 }).notNull(),
  evaluatorDigest: char('evaluator_digest', { length: 64 }).notNull(),
  outcome: text('outcome', { enum: ['passed', 'failed', 'unavailable', 'cancelled', 'timed_out', 'infrastructure_failure'] }).notNull(),
  payload: jsonb('payload').$type<EvaluationReceipt>().notNull(),
  recordedBy: varchar('recorded_by', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const boxReviewDecisions = pgTable('box_review_decisions', {
  reviewId: uuid('review_id').primaryKey(),
  attemptId: uuid('attempt_id').notNull().references(() => boxAttempts.attemptId),
  boxId: uuid('box_id').notNull(),
  boxVersionHash: char('box_version_hash', { length: 64 }).notNull(),
  candidateHash: char('candidate_hash', { length: 64 }).notNull(),
  verdict: text('verdict', { enum: ['approved', 'changes_required', 'box_defect', 'infrastructure_failure'] }).notNull(),
  reviewerId: uuid('reviewer_id').notNull().references(() => accounts.id),
  rationale: text('rationale').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [unique('box_review_unique').on(table.attemptId, table.reviewerId)]);

export const boxMergeApprovals = pgTable('box_merge_approvals', {
  approvalId: uuid('approval_id').primaryKey(),
  boxId: uuid('box_id').notNull(),
  attemptId: uuid('attempt_id').notNull().references(() => boxAttempts.attemptId),
  reviewId: uuid('review_id').notNull().references(() => boxReviewDecisions.reviewId),
  targetRef: varchar('target_ref', { length: 64 }).notNull(),
  baseCommit: char('base_commit', { length: 40 }).notNull(),
  candidateHash: char('candidate_hash', { length: 64 }).notNull(),
  approvedBy: uuid('approved_by').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [unique('box_merge_approval_unique').on(table.attemptId, table.approvedBy)]);

export const boxMergeRecords = pgTable('box_merge_records', {
  mergeId: uuid('merge_id').primaryKey(),
  approvalId: uuid('approval_id').notNull().references(() => boxMergeApprovals.approvalId).unique(),
  boxId: uuid('box_id').notNull(),
  attemptId: uuid('attempt_id').notNull().references(() => boxAttempts.attemptId),
  sourceCandidateHash: char('source_candidate_hash', { length: 64 }).notNull(),
  targetRef: varchar('target_ref', { length: 64 }).notNull(),
  resultCommit: char('result_commit', { length: 40 }),
  state: text('state', { enum: ['applied', 'rejected'] }).notNull(),
  appliedBy: uuid('applied_by').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const boxRepositoryRegistrations = pgTable('box_repository_registrations', {
  repoId: varchar('repo_id', { length: 64 }).primaryKey(),
  snapshotId: uuid('snapshot_id').notNull(),
  sourceId: varchar('source_id', { length: 64 }).notNull(),
  sourceRoot: varchar('source_root', { length: 4096 }).notNull(),
  baseCommit: char('base_commit', { length: 40 }).notNull(),
  contextManifest: jsonb('context_manifest').notNull(),
  contextManifestHash: char('context_manifest_hash', { length: 64 }).notNull(),
  environmentRef: jsonb('environment_ref').notNull(),
  evaluatorRef: jsonb('evaluator_ref').notNull(),
  mergeTarget: jsonb('merge_target').notNull(),
  registeredBy: uuid('registered_by').notNull().references(() => accounts.id),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow()
}, table => [
  unique('box_repository_unique').on(table.snapshotId, table.baseCommit, table.contextManifestHash),
  check('box_repository_id_syntax', sql`${table.repoId} ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'`),
  check('box_repository_base_commit', sql`${table.baseCommit} ~ '^[a-f0-9]{40}$'`),
  check('box_repository_manifest_hash', sql`${table.contextManifestHash} ~ '^[a-f0-9]{64}$'`)
]);

export const boxOperationKeys = pgTable('box_operation_keys', {
  actorId: varchar('actor_id', { length: 128 }).notNull(),
  operation: varchar('operation', { length: 32 }).notNull(),
  key: varchar('key', { length: 128 }).notNull(),
  requestHash: char('request_hash', { length: 64 }).notNull(),
  resultHash: char('result_hash', { length: 64 }).notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [primaryKey({ columns: [table.actorId, table.operation, table.key] })]);
