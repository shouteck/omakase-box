import { sql } from 'drizzle-orm';
import { bigint, boolean, char, check, customType, foreignKey, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import type { InternalIntent, InternalEvaluationResult } from '../../../packages/contracts/private/index.js';
import type { ApprovedReleaseManifest, PublicFeedback } from '../../../packages/contracts/public/index.js';
import type { RequestInput, SnapshotManifest } from '../requests/types.js';

export const privateRole = pgEnum('private_role', ['requester', 'owner', 'operator']);
export const intentState = pgEnum('intent_state', ['draft', 'needs_decision', 'ready_for_approval', 'approved']);
export const evaluationState = pgEnum('private_evaluation_state', ['received', 'public_evaluating', 'private_evaluating', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_failure']);
export const ledgerState = pgEnum('payment_obligation_state', ['due', 'settlement_recorded']);
export const accounts = pgTable('private_accounts', {
  id: uuid('id').primaryKey(), username: varchar('username', { length: 64 }).notNull().unique(), passwordHash: text('password_hash').notNull(), role: privateRole('role').notNull(), disabled: boolean('disabled').notNull().default(false)
});
export const sessions = pgTable('private_sessions', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(), accountId: uuid('account_id').notNull().references(() => accounts.id), csrfHash: char('csrf_hash', { length: 64 }).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});
export const invitations = pgTable('private_invitations', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(), role: privateRole('role').notNull(), issuerId: uuid('issuer_id').notNull().references(() => accounts.id), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), revoked: boolean('revoked').notNull().default(false), redeemedAt: timestamp('redeemed_at', { withTimezone: true })
});
export const intents = pgTable('private_intent_revisions', {
  id: uuid('id').notNull(), version: integer('version').notNull(), state: intentState('state').notNull(), payload: jsonb('payload').$type<InternalIntent>().notNull(), contentHash: char('content_hash', { length: 64 }).notNull(), snapshotHash: char('snapshot_hash', { length: 64 }).notNull(), requesterId: uuid('requester_id').notNull().references(() => accounts.id), approvedBy: uuid('approved_by').references(() => accounts.id), approvedHash: char('approved_hash', { length: 64 }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [primaryKey({ columns: [table.id, table.version] }), check('private_intent_version_positive', sql`${table.version} > 0`), check('private_intent_hash_syntax', sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`), check('private_intent_approval_bound', sql`${table.state} <> 'approved' OR (${table.approvedBy} IS NOT NULL AND ${table.approvedHash} IS NOT NULL AND ${table.approvedHash} = ${table.contentHash})`)]);
export const intentHeads = pgTable('private_intent_heads', { id: uuid('id').primaryKey(), currentVersion: integer('current_version').notNull() }, table => [check('private_intent_head_positive', sql`${table.currentVersion} > 0`), foreignKey({ columns: [table.id, table.currentVersion], foreignColumns: [intents.id, intents.version] })]);
export const releases = pgTable('private_release_approvals', {
  id: uuid('id').primaryKey(), taskId: uuid('task_id').notNull(), taskVersion: integer('task_version').notNull(), manifestHash: char('manifest_hash', { length: 64 }).notNull().unique(), manifest: jsonb('manifest').$type<ApprovedReleaseManifest>().notNull(), privateRevision: char('private_revision', { length: 64 }).notNull(), ownerId: uuid('owner_id').notNull().references(() => accounts.id), approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow()
}, table => [unique('private_release_task_version_unique').on(table.taskId, table.taskVersion), check('private_release_version_positive', sql`${table.taskVersion} > 0`)]);
export const evaluations = pgTable('private_evaluations', {
  id: uuid('id').primaryKey(), permitId: uuid('permit_id').notNull().unique(), taskId: uuid('task_id').notNull(), taskVersion: integer('task_version').notNull(), submissionId: uuid('submission_id').notNull(), submissionHash: char('submission_hash', { length: 64 }).notNull(), packageHash: char('package_hash', { length: 64 }).notNull(), privateBaseRevision: char('private_base_revision', { length: 64 }).notNull(), state: evaluationState('state').notNull().default('received'), version: integer('version').notNull().default(1), result: jsonb('result').$type<InternalEvaluationResult>(), superseded: boolean('superseded').notNull().default(false)
}, table => [unique('private_evaluation_exact_binding').on(table.id, table.submissionHash, table.packageHash, table.privateBaseRevision), check('private_evaluation_version_positive', sql`${table.version} > 0 AND ${table.taskVersion} > 0`)]);
export const acceptances = pgTable('private_acceptances', {
  id: uuid('id').primaryKey(), eventId: uuid('event_id').notNull().unique(), evaluationId: uuid('evaluation_id').notNull().references(() => evaluations.id).unique(), ownerId: uuid('owner_id').notNull().references(() => accounts.id), submissionHash: char('submission_hash', { length: 64 }).notNull(), packageHash: char('package_hash', { length: 64 }).notNull(), privateBaseRevision: char('private_base_revision', { length: 64 }).notNull(), candidateDiffHash: char('candidate_diff_hash', { length: 64 }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [foreignKey({ columns: [table.evaluationId, table.submissionHash, table.packageHash, table.privateBaseRevision], foreignColumns: [evaluations.id, evaluations.submissionHash, evaluations.packageHash, evaluations.privateBaseRevision] })]);
export const paymentObligations = pgTable('private_payment_obligations', {
  eventId: uuid('event_id').primaryKey(), acceptanceId: uuid('acceptance_id').references(() => acceptances.id).unique(), payeeId: uuid('payee_id').notNull(), reason: text('reason').notNull(), currency: char('currency', { length: 3 }).notNull(), amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(), state: ledgerState('state').notNull().default('due'), settlementReference: text('settlement_reference'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [check('private_money_bounded', sql`${table.amountMinor} >= 0 AND ${table.amountMinor} <= 9007199254740991`), check('private_settlement_reference_required', sql`${table.state} <> 'settlement_recorded' OR ${table.settlementReference} IS NOT NULL`)]);
export const feedbackOutbox = pgTable('private_feedback_outbox', {
  eventId: uuid('event_id').primaryKey(), submissionId: uuid('submission_id'), payload: jsonb('payload').$type<PublicFeedback>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), deliveredAt: timestamp('delivered_at', { withTimezone: true })
});
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
export const intakeObjects = pgTable('private_intake_objects', {
  sha256: char('sha256', { length: 64 }).primaryKey(), byteCount: integer('byte_count').notNull(), payload: bytea('payload').notNull()
}, table => [unique('private_intake_object_binding').on(table.sha256, table.byteCount), check('private_intake_object_size', sql`${table.byteCount} BETWEEN 0 AND 1048576 AND octet_length(${table.payload})=${table.byteCount}`)]);
export const snapshots = pgTable('private_snapshots', {
  id: uuid('id').primaryKey(), snapshotHash: char('snapshot_hash', { length: 64 }).notNull().unique(), manifest: jsonb('manifest').$type<SnapshotManifest>().notNull(), fileCount: integer('file_count').notNull(), registeredBy: uuid('registered_by').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [check('private_snapshot_files_bounded', sql`${table.fileCount} BETWEEN 1 AND 256 AND jsonb_array_length(${table.manifest}->'files')=${table.fileCount}`)]);
export const snapshotProvenance = pgTable('private_snapshot_provenance', {
  id: uuid('id').primaryKey(), snapshotId: uuid('snapshot_id').notNull().references(() => snapshots.id), sourceId: varchar('source_id', { length: 64 }).notNull(), sourceRoot: text('source_root').notNull(), actorId: uuid('actor_id').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
export const requests = pgTable('private_requests', {
  id: uuid('id').primaryKey(), snapshotId: uuid('snapshot_id').notNull().references(() => snapshots.id), requesterId: uuid('requester_id').notNull().references(() => accounts.id), payload: jsonb('payload').$type<RequestInput>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [check('private_request_snapshot_binding', sql`${table.payload}->>'snapshotId'=${table.snapshotId}::text`)]);
export const requestEvidence = pgTable('private_request_evidence', {
  id: uuid('id').primaryKey(), requestId: uuid('request_id').notNull().references(() => requests.id), sha256: char('sha256', { length: 64 }).notNull(), byteCount: integer('byte_count').notNull(), mediaType: text('media_type').notNull(), label: varchar('label', { length: 160 }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => [foreignKey({ columns: [table.sha256, table.byteCount], foreignColumns: [intakeObjects.sha256, intakeObjects.byteCount] }), check('private_evidence_size_and_type', sql`${table.byteCount} BETWEEN 1 AND 1048576 AND ${table.mediaType} IN ('text/plain','image/png','image/jpeg') AND (${table.mediaType}<>'text/plain' OR ${table.byteCount}<=65536)`)]);
