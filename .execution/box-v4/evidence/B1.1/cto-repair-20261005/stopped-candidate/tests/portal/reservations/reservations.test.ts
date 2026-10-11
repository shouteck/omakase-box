import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentHash } from '../../../packages/contracts/hash.js';
import { MemoryAssignmentStore } from '../../../services/external-api/reservations/assignments.js';
import { MemoryReservationStore } from '../../../services/external-api/reservations/reservation-store.js';
import { MemoryDefectReportStore } from '../../../services/external-api/reservations/defect-reports.js';
import { projectReservationDownload } from '../../../services/external-api/reservations/download.js';
import { RESERVATION_ROUTES, ASSIGNMENT_ROUTES, installContributorReservationRoutes } from '../../../services/external-api/reservations/routes.js';
import Fastify from '../../../services/external-api/node_modules/fastify/fastify.js';
import { baseNow, contributorCaller, customerChoice, executorChoice, ownerCaller, publishedContext, syntheticLabel, type Caller, type PublishedContext } from './fixture.js';

const OWNER_CALLER = { role: 'owner' };

const HOUR_MS = 3600_000;

async function reservationWorld(combined = false) {
  const published = await publishedContext(combined);
  const assignments = new MemoryAssignmentStore();
  const reservations = new MemoryReservationStore({ published: published.persistence, assignments });
  const defects = new MemoryDefectReportStore({ reservation: (caller, reservationId, nowMs) => reservations.reservation(caller, reservationId, nowMs) });
  return { ...published, assignments, reservations, defects };
}

async function assignedReservation(combined = false) {
  const world = await reservationWorld(combined);
  const contributor = contributorCaller();
  const assignment = await world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice('human', syntheticLabel, contributor.id), ...customerChoice }, baseNow);
  const token = (await world.assignments.issueInvitation(assignment.id, OWNER_CALLER, baseNow)).token;
  await world.assignments.recordRedemption(token, contributor.id, baseNow + 1_000);
  const reservation = await world.reservations.reserve(contributor, { taskId: world.taskId, taskVersion: world.taskVersion }, baseNow + 2_000);
  return { ...world, contributor, assignment, reservation, reservedAt: baseNow + 2_000 };
}

function codeOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') return (error as { code: string }).code;
  return null;
}

async function deniedAs(promise: Promise<unknown>, code: string): Promise<void> {
  let thrown: unknown = null;
  try { await promise; } catch (error) { thrown = error; }
  expect(thrown).not.toBeNull();
  expect(codeOf(thrown)).toBe(code);
  const text = JSON.stringify(thrown);
  expect(text).toBe(JSON.stringify({ code }));
  expect(text).not.toMatch(/"taskId"|"contributorId"|"expiresAt"|"termsHash"|"assignmentId"/);
}

describe('M6.2 executor choice (customer-selected human/ai/team, no AI-first routing)', () => {
  it('persists the explicit executor choice and descriptive label with the assignment', async () => {
    for (const kind of ['human', 'ai', 'team'] as const) {
      const world = await reservationWorld();
      const contributor = contributorCaller();
      const choice = kind === 'human' ? executorChoice('human', syntheticLabel, contributor.id) : executorChoice(kind, kind === 'ai' ? 'Synthetic demo AI worker (explicit customer pick)' : 'Synthetic two-person team (explicit customer pick)');
      const assignment = await world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: choice, ...customerChoice }, baseNow);
      expect(assignment.executor).toEqual({ kind, label: choice.label });
      const stored = await world.assignments.byTask(world.taskId, world.taskVersion);
      expect(stored?.executor.kind).toBe(kind);
      expect(stored?.executor.label).toBe(choice.label);
      expect(stored?.status).toBe('open');
    }
  });

  it('rejects anything that is not an explicit customer choice (no default, no fallback, no ranking)', async () => {
    const world = await reservationWorld();
    await deniedAs(world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice(undefined as never, syntheticLabel), ...customerChoice }, baseNow), 'invalid_input');
    await deniedAs(world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice('human', syntheticLabel), ...customerChoice }, baseNow), 'invalid_input');
    await deniedAs(world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice('ai', 'demo ai', 'f'.repeat(36).replace('f', '4')), ...customerChoice }, baseNow), 'invalid_input');
    await deniedAs(world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice('human', ''), ...customerChoice }, baseNow), 'invalid_input');
    const persisted = await world.assignments.byTask(world.taskId, world.taskVersion);
    expect(persisted).toBeNull();
  });

  it('the executor choice is immutable; re-choosing fails with a fixed conflict code', async () => {
    const world = await reservationWorld();
    const first = await world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice('team', 'Synthetic team label'), ...customerChoice }, baseNow);
    await deniedAs(world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice('ai', 'different choice'), ...customerChoice }, baseNow), 'assignment_conflict');
    expect((await world.assignments.byId(first.id))?.executor.kind).toBe('team');
  });

  it('reserving a board task without any recorded customer choice fails closed (nothing auto-routes)', async () => {
    const world = await reservationWorld();
    await deniedAs(world.reservations.reserve(contributorCaller(), { taskId: world.taskId, taskVersion: world.taskVersion }, baseNow), 'assignment_required');
    const aiWorld = await reservationWorld();
    await aiWorld.assignments.chooseExecutor({ taskId: aiWorld.taskId, taskVersion: aiWorld.taskVersion, executor: executorChoice('ai', 'Synthetic demo AI worker (explicit customer pick)'), ...customerChoice }, baseNow);
    await deniedAs(aiWorld.reservations.reserve(contributorCaller(), { taskId: aiWorld.taskId, taskVersion: aiWorld.taskVersion }, baseNow), 'executor_not_contributor');
  });

  it('a human reservation requires the one-time M1.3-style invitation redeemed by that contributor', async () => {
    const world = await reservationWorld();
    const contributor = contributorCaller();
    const assignment = await world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice('human', syntheticLabel, contributor.id), ...customerChoice }, baseNow);
    await deniedAs(world.reservations.reserve(contributor, { taskId: world.taskId, taskVersion: world.taskVersion }, baseNow), 'invitation_required');
    const token = (await world.assignments.issueInvitation(assignment.id, OWNER_CALLER, baseNow)).token;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    await deniedAs(world.reservations.reserve(contributor, { taskId: world.taskId, taskVersion: world.taskVersion }, baseNow), 'invitation_required');
    await world.assignments.recordRedemption(token, contributor.id, baseNow + 1_000);
    await deniedAs(world.assignments.recordRedemption(token, contributor.id, baseNow + 2_000), 'invitation_denied');
    const reservation = await world.reservations.reserve(contributor, { taskId: world.taskId, taskVersion: world.taskVersion }, baseNow + 2_000);
    expect(reservation.executor).toEqual({ kind: 'human', label: syntheticLabel });
    const other = contributorCaller();
    const secondWorld = await reservationWorld();
    await secondWorld.assignments.chooseExecutor({ taskId: secondWorld.taskId, taskVersion: secondWorld.taskVersion, executor: executorChoice('human', syntheticLabel, contributor.id), ...customerChoice }, baseNow);
    const secondAssignmentId = await secondWorld.assignments.byTask(secondWorld.taskId, secondWorld.taskVersion);
    const secondToken = (await secondWorld.assignments.issueInvitation(secondAssignmentId!.id, OWNER_CALLER, baseNow)).token;
    await deniedAs(secondWorld.assignments.recordRedemption(secondToken, other.id, baseNow + 1_000), 'invitation_denied');
    await secondWorld.assignments.recordRedemption(secondToken, contributor.id, baseNow + 1_000);
    await deniedAs(secondWorld.reservations.reserve(other, { taskId: secondWorld.taskId, taskVersion: secondWorld.taskVersion }, baseNow), 'invitation_denied');
  });
});

describe('M6.2 one-reservation transaction and concurrency', () => {
  it('exactly one of two concurrent reservations wins; the loser receives one fixed safe code', async () => {
    const world = await reservationWorld();
    const contributor = contributorCaller();
    const assignment = await world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: executorChoice('human', syntheticLabel, contributor.id), ...customerChoice }, baseNow);
    const token = (await world.assignments.issueInvitation(assignment.id, OWNER_CALLER, baseNow)).token;
    await world.assignments.recordRedemption(token, contributor.id, baseNow + 1_000);
    const results = await Promise.allSettled([
      world.reservations.reserve(contributor, { taskId: world.taskId, taskVersion: world.taskVersion }, baseNow + 2_000),
      world.reservations.reserve(contributor, { taskId: world.taskId, taskVersion: world.taskVersion }, baseNow + 2_000)
    ]);
    const winners = results.filter(result => result.status === 'fulfilled');
    const losers = results.filter(result => result.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(codeOf((losers[0] as PromiseRejectedResult).reason)).toBe('already_reserved');
    expect(winners[0] !== undefined && winners[0].status === 'fulfilled' ? winners[0].value.state : null).toBe('active');
    expect(winners[0] !== undefined && winners[0].status === 'fulfilled' ? winners[0].value.executor : null).toEqual({ kind: 'human', label: syntheticLabel });
    const all = await world.persistence.allPublished();
    expect(all).toHaveLength(1);
  });

  it('an expired reservation is not live; the assignment binding still blocks unknown contributors', async () => {
    const world = await assignedReservation();
    await world.reservations.expireDue(world.reservedAt + HOUR_MS + 1_000);
    const expired = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + HOUR_MS + 1_000);
    expect(expired.state).toBe('expired');
    const freshContributor = contributorCaller();
    await deniedAs(world.reservations.reserve(freshContributor, { taskId: world.taskId, taskVersion: world.taskVersion }, world.reservedAt + HOUR_MS + 2_000), 'invitation_denied');
    await deniedAs(world.reservations.cancel(world.contributor, { reservationId: world.reservation.id, expectedVersion: expired.version }, world.reservedAt + HOUR_MS + 3_000), 'reservation_expired');
  });

  it('reservation reads are scoped: a guessed or foreign reservation id returns only the fixed safe code', async () => {
    const world = await assignedReservation();
    await deniedAs(world.reservations.reservation(contributorCaller(), world.reservation.id, world.reservedAt), 'not_found');
    for (const guess of [randomUUID(), randomUUID(), randomUUID()]) {
      await deniedAs(world.reservations.reservation(world.contributor, guess, world.reservedAt), 'not_found');
    }
  });
});

describe('M6.2 reservation lifecycle: frozen expiry and terms', () => {
  it('keeps the original expiry and terms hash fixed across in_review, changes_required, resubmission and acceptance', async () => {
    const world = await assignedReservation();
    const original = { expiresAt: world.reservation.expiresAt, termsHash: world.reservation.terms.termsHash, terms: world.reservation.terms };
    expect(world.reservation.state).toBe('active');
    expect(Date.parse(original.expiresAt) - world.reservedAt).toBe(world.reservationDurationSeconds * 1000);

    const attemptA = `synthetic-attempt-${randomUUID()}`;
    const inReview = await world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: attemptA, expectedVersion: world.reservation.version }, world.reservedAt + 60_000);
    expect(inReview.state).toBe('in_review');
    let current = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + 60_000);
    expect(current.expiresAt).toBe(original.expiresAt);
    expect(current.terms).toEqual(original.terms);

    const reactivated = await world.reservations.changesRequired(ownerCaller(), { reservationId: world.reservation.id, expectedVersion: inReview.version }, world.reservedAt + 120_000);
    expect(reactivated.state).toBe('active');
    current = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + 120_000);
    expect(current.expiresAt).toBe(original.expiresAt);
    expect(contentHash(current.terms)).toBe(contentHash(original.terms));

    const attemptB = `synthetic-attempt-${randomUUID()}`;
    const again = await world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: attemptB, expectedVersion: reactivated.version }, world.reservedAt + 180_000);
    expect(again.state).toBe('in_review');
    current = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + 180_000);
    expect(current.expiresAt).toBe(original.expiresAt);
    expect(current.terms).toEqual(original.terms);

    const accepted = await world.reservations.accept(ownerCaller(), { reservationId: world.reservation.id, submissionId: attemptB, expectedVersion: again.version }, world.reservedAt + 240_000);
    expect(accepted.state).toBe('accepted');
    current = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + 240_000);
    expect(current.expiresAt).toBe(original.expiresAt);
    expect(current.terms).toEqual(original.terms);
  });

  it('expires exactly at the frozen instant, never earlier and never extended by activity', async () => {
    const world = await assignedReservation();
    expect(await world.reservations.expireDue(world.reservedAt + HOUR_MS - 1_000)).toBe(0);
    await world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: world.reservation.version }, world.reservedAt + HOUR_MS - 500);
    expect(await world.reservations.expireDue(world.reservedAt + HOUR_MS + 1)).toBe(1);
    const expired = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + HOUR_MS + 2);
    expect(expired.state).toBe('expired');
    expect(expired.expiresAt).toBe(world.reservation.expiresAt);
    await deniedAs(world.reservations.changesRequired(ownerCaller(), { reservationId: world.reservation.id, expectedVersion: expired.version }, world.reservedAt + HOUR_MS + 3), 'reservation_expired');
    await deniedAs(world.reservations.cancel(world.contributor, { reservationId: world.reservation.id, expectedVersion: expired.version }, world.reservedAt + HOUR_MS + 4), 'reservation_expired');
  });

  it('cancelling keeps frozen terms and records the frozen cancellation policy', async () => {
    const world = await assignedReservation();
    const cancelled = await world.reservations.cancel(world.contributor, { reservationId: world.reservation.id, expectedVersion: world.reservation.version }, world.reservedAt + 30_000);
    expect(cancelled.state).toBe('cancelled');
    const view = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + 30_000);
    expect(view.terms.cancellationPolicy).toBe(world.record.contract.terms.cancellationPolicy);
    expect(view.expiresAt).toBe(world.reservation.expiresAt);
    await deniedAs(world.reservations.cancel(world.contributor, { reservationId: world.reservation.id, expectedVersion: cancelled.version }, world.reservedAt + 31_000), 'invalid_transition');
  });
});

describe('M6.2 in_review protection and supersession', () => {
  it('rejects a second upload while in_review and rejects owner decisions on an active reservation', async () => {
    const world = await assignedReservation();
    await deniedAs(world.reservations.changesRequired(ownerCaller(), { reservationId: world.reservation.id, expectedVersion: world.reservation.version }, world.reservedAt + 5_000), 'invalid_transition');
    await deniedAs(world.reservations.accept(ownerCaller(), { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: world.reservation.version }, world.reservedAt + 6_000), 'invalid_transition');
    const first = await world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: world.reservation.version }, world.reservedAt + 10_000);
    expect(first.state).toBe('in_review');
    await deniedAs(world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: 'b'.repeat(16), expectedVersion: first.version }, world.reservedAt + 11_000), 'in_review_conflict');
    expect((await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + 12_000)).state).toBe('in_review');
  });

  it('after changes_required the old attempt cannot be accepted; only the latest attempt can', async () => {
    const world = await assignedReservation();
    const attemptA = 'old'.padEnd(16, '0');
    const inReviewA = await world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: attemptA, expectedVersion: world.reservation.version }, world.reservedAt + 10_000);
    const reactivated = await world.reservations.changesRequired(ownerCaller(), { reservationId: world.reservation.id, expectedVersion: inReviewA.version }, world.reservedAt + 20_000);
    expect(reactivated.state).toBe('active');
    const attemptB = 'new'.padEnd(16, '0');
    const inReviewB = await world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: attemptB, expectedVersion: reactivated.version }, world.reservedAt + 30_000);
    await deniedAs(world.reservations.accept(ownerCaller(), { reservationId: world.reservation.id, submissionId: attemptA, expectedVersion: inReviewB.version }, world.reservedAt + 40_000), 'stale_submission');
    const accepted = await world.reservations.accept(ownerCaller(), { reservationId: world.reservation.id, submissionId: attemptB, expectedVersion: inReviewB.version }, world.reservedAt + 41_000);
    expect(accepted.state).toBe('accepted');
  });

  it('only the owner can change-require or accept; only the owning contributor can submit or cancel', async () => {
    const world = await assignedReservation();
    await deniedAs(world.reservations.submitForReview(ownerCaller(), { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: world.reservation.version }, world.reservedAt), 'forbidden');
    const inReview = await world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: world.reservation.version }, world.reservedAt);
    await deniedAs(world.reservations.changesRequired(world.contributor, { reservationId: world.reservation.id, expectedVersion: inReview.version }, world.reservedAt + 1), 'forbidden');
    await deniedAs(world.reservations.accept(world.contributor, { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: inReview.version }, world.reservedAt + 2), 'forbidden');
    const stranger = contributorCaller();
    await deniedAs(world.reservations.submitForReview(stranger, { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: world.reservation.version }, world.reservedAt + 3), 'not_found');
    await deniedAs(world.reservations.cancel(stranger, { reservationId: world.reservation.id, expectedVersion: world.reservation.version }, world.reservedAt + 4), 'not_found');
    await deniedAs(world.reservations.changesRequired(ownerCaller(), { reservationId: randomUUID(), expectedVersion: 1 }, world.reservedAt + 5), 'not_found');
  });

  it('stale expected versions fail with the fixed stale_version code', async () => {
    const world = await assignedReservation();
    await deniedAs(world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: 99 }, world.reservedAt), 'stale_version');
  });
});

describe('M6.2 structured package-defect reports', () => {
  it('files a typed report bound to task/version/reservation and shows it to its own contributor', async () => {
    const world = await assignedReservation();
    const input = { taskId: world.taskId, taskVersion: world.taskVersion, reservationId: world.reservation.id, category: 'missing_context' as const, description: 'The package lacks the approved environment start command for the selection workspace.', idempotencyKey: randomUUID() };
    const report = await world.defects.file(world.contributor, input, world.reservedAt + 5_000);
    expect(report.category).toBe('missing_context');
    expect(report.taskId).toBe(world.taskId);
    expect(report.taskVersion).toBe(world.taskVersion);
    expect(report.reservationId).toBe(world.reservation.id);
    expect(report.description).toBe(input.description);
    const own = await world.defects.listOwn(world.contributor, world.reservation.id, world.reservedAt + 6_000);
    expect(own).toHaveLength(1);
    expect(own[0]!.id).toBe(report.id);
  });

  it('an identical idempotency key returns the existing report and never creates a second one', async () => {
    const world = await assignedReservation();
    const input = { taskId: world.taskId, taskVersion: world.taskVersion, reservationId: world.reservation.id, category: 'missing_context' as const, description: 'Same synthetic defect text.', idempotencyKey: randomUUID() };
    const first = await world.defects.file(world.contributor, input, world.reservedAt + 5_000);
    const second = await world.defects.file(world.contributor, input, world.reservedAt + 6_000);
    expect(second.id).toBe(first.id);
    expect(second.receivedAt).toBe(first.receivedAt);
    expect(await world.defects.listOwn(world.contributor, world.reservation.id, world.reservedAt + 7_000)).toHaveLength(1);
    const divergent = { ...input, category: 'other' as const, description: 'Different synthetic text.' };
    await deniedAs(world.defects.file(world.contributor, divergent, world.reservedAt + 8_000), 'invalid_input');
  });

  it('guessed reservations, foreign contributors and dead reservations are refused with fixed safe codes', async () => {
    const world = await assignedReservation();
    const valid = { category: 'missing_context' as const, description: 'Synthetic description.', idempotencyKey: randomUUID() };
    await deniedAs(world.defects.file(world.contributor, { ...valid, taskId: world.taskId, taskVersion: world.taskVersion, reservationId: randomUUID() }, world.reservedAt), 'not_found');
    await deniedAs(world.defects.file(contributorCaller(), { ...valid, taskId: world.taskId, taskVersion: world.taskVersion, reservationId: world.reservation.id }, world.reservedAt), 'not_found');
    await deniedAs(world.defects.listOwn(contributorCaller(), world.reservation.id, world.reservedAt), 'not_found');
    await deniedAs(world.defects.file(world.contributor, { ...valid, taskId: world.taskId, taskVersion: 99, reservationId: world.reservation.id }, world.reservedAt), 'invalid_input');
    await deniedAs(world.defects.file(world.contributor, { ...valid, category: 'not_a_category' as never, taskId: world.taskId, taskVersion: world.taskVersion, reservationId: world.reservation.id }, world.reservedAt), 'invalid_input');
    await deniedAs(world.defects.file(world.contributor, { ...valid, description: 'x'.repeat(5000), taskId: world.taskId, taskVersion: world.taskVersion, reservationId: world.reservation.id }, world.reservedAt), 'invalid_input');
    await world.reservations.expireDue(world.reservedAt + HOUR_MS + 1);
    await deniedAs(world.defects.file(world.contributor, { ...valid, taskId: world.taskId, taskVersion: world.taskVersion, reservationId: world.reservation.id }, world.reservedAt + HOUR_MS + 2), 'reservation_expired');
  });

  it('a package defect stays possible from an in_review reservation', async () => {
    const world = await assignedReservation();
    await world.reservations.submitForReview(world.contributor, { reservationId: world.reservation.id, submissionId: 'a'.repeat(16), expectedVersion: world.reservation.version }, world.reservedAt);
    const report = await world.defects.file(world.contributor, { taskId: world.taskId, taskVersion: world.taskVersion, reservationId: world.reservation.id, category: 'environment_failure' as const, description: 'The synthetic environment fails to start.', idempotencyKey: randomUUID() }, world.reservedAt + 1);
    expect(report.category).toBe('environment_failure');
  });
});

describe('M6.2 contributor download and instructions (released data only)', () => {
  it('reveals the exact approved package and released instructions for a live reservation', async () => {
    const world = await assignedReservation();
    const board = { package: (taskId: string, version: number) => world.board.package(taskId, version), publishedRecord: (taskId: string, version: number) => world.board.publishedRecord(taskId, version) };
    const download = await projectReservationDownload({ board }, world.reservation, world.reservedAt + 5_000);
    expect(download.reservationId).toBe(world.reservation.id);
    expect(download.package.sha256).toBe(world.record.packageSha256);
    expect(Buffer.from(download.package.bytes)).toEqual(Buffer.from(world.record.packageBytes));
    expect(download.instructions.editBoundary.sort()).toEqual(['src/PlanSelector.tsx']);
    expect(download.instructions.requirements[0]!.id).toBe('select_ui');
    expect(download.instructions.reward).toEqual(world.reward);
    expect(download.instructions.compensation.packageDefectCompensation).toEqual(world.record.contract.terms.packageDefectCompensation);
    expect(download.instructions.compensation.revisionPolicy).toBe('preserve_original_expiry');
    expect(download.instructions.environment.dependencies).toEqual([{ name: 'react', version: '19.3.0' }]);
    expect(download.instructions.feedbackPolicyId).toBe('bounded_v1');
    const text = JSON.stringify(download.instructions);
    expect(text).not.toMatch(/intentId|privateRevision|prompt|snapshotHash|approvalActor|semanticDisclosure/i);
  });

  it('refuses download for terminal or expired reservations with fixed codes', async () => {
    const boardOf = (world: Awaited<ReturnType<typeof assignedReservation>>) => ({ package: (taskId: string, version: number) => world.board.package(taskId, version), publishedRecord: (taskId: string, version: number) => world.board.publishedRecord(taskId, version) });
    const world = await assignedReservation();
    await world.reservations.cancel(world.contributor, { reservationId: world.reservation.id, expectedVersion: world.reservation.version }, world.reservedAt + 1_000);
    const view = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt + 2_000);
    await deniedAs(projectReservationDownload({ board: boardOf(world) }, view, world.reservedAt + 3_000), 'reservation_closed');
    const second = await assignedReservation();
    await second.reservations.expireDue(second.reservedAt + HOUR_MS + 1);
    const expiredView = await second.reservations.reservation(second.contributor, second.reservation.id, second.reservedAt + HOUR_MS + 2);
    await deniedAs(projectReservationDownload({ board: boardOf(second) }, expiredView, second.reservedAt + HOUR_MS + 3), 'reservation_expired');
  });
});

describe('M6.2 resumed boundary regressions', () => {
  it('does not accept a defect after expiry when the expiry sweeper has not run', async () => {
    const world = await assignedReservation();
    await deniedAs(world.defects.file(world.contributor, { taskId: world.taskId, taskVersion: world.taskVersion, reservationId: world.reservation.id, category: 'missing_context', description: 'Required public context is missing.', idempotencyKey: randomUUID() }, Date.parse(world.reservation.expiresAt)), 'reservation_expired');
  });

  it('returned reservation and assignment objects cannot mutate frozen choices or terms', async () => {
    const world = await assignedReservation();
    const originalTerms = structuredClone(world.reservation.terms);
    world.reservation.terms.maxPatchBytes = 1;
    world.reservation.terms.packageDefectCompensation.amountMinor = 999999;
    world.reservation.executor.kind = 'ai';
    Object.assign(world.assignment.executor, { label: 'mutated label' });
    const view = await world.reservations.reservation(world.contributor, world.reservation.id, world.reservedAt);
    expect(view.terms).toEqual(originalTerms);
    expect(view.executor).toEqual({ kind: 'human', label: syntheticLabel });
    expect(world.record.contract.terms.packageDefectCompensation).toEqual(originalTerms.packageDefectCompensation);
  });

  it('a redeemed invitation remains a binding after the redemption deadline', async () => {
    const world = await assignedReservation();
    expect(await world.assignments.runtimeContributorBinding(world.taskId, world.taskVersion, world.contributor.id, baseNow + HOUR_MS + 1)).toBe('redeemed');
  });

  it('malformed expiry cannot yield a package download', async () => {
    const world = await assignedReservation();
    await deniedAs(projectReservationDownload({ board: world.board }, { ...world.reservation, expiresAt: 'invalid' }, world.reservedAt), 'reservation_expired');
  });

  it('unexpected storage faults never reach a contributor response', async () => {
    const world = await reservationWorld();
    Object.assign(world.board, { entries: async () => { throw new Error('SYNTHETIC_PRIVATE_ERROR_CANARY'); } });
    const app = Fastify({ logger: false });
    installContributorReservationRoutes(app, world);
    try {
      const response = await app.inject({ method: 'GET', url: '/v1/tasks' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'resource_unavailable' });
      expect(response.body).not.toContain('SYNTHETIC_PRIVATE_ERROR_CANARY');
    } finally { await app.close(); }
  });

  it('closed cancellation errors do not expose workflow details', async () => {
    const world = await assignedReservation();
    const cancelled = await world.reservations.cancel(world.contributor, { reservationId: world.reservation.id, expectedVersion: 1 }, world.reservedAt);
    await deniedAs(world.reservations.cancel(world.contributor, { reservationId: cancelled.id, expectedVersion: cancelled.version }, world.reservedAt), 'invalid_transition');
  });

  it('a role returned by the actor source is never upgraded to contributor authority', async () => {
    const world = await assignedReservation();
    const app = Fastify({ logger: false });
    installContributorReservationRoutes(app, world, { requirePermission: () => ({ id: world.contributor.id, role: 'owner' }) });
    try {
      const response = await app.inject({ method: 'POST', url: `/v1/tasks/${world.taskId}/reservations`, payload: { taskVersion: world.taskVersion } });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'forbidden' });
    } finally { await app.close(); }
  });

  it('unreserved task detail returns only listing fields, not the contract or package digest', async () => {
    const world = await reservationWorld();
    const app = Fastify({ logger: false });
    installContributorReservationRoutes(app, world);
    try {
      const response = await app.inject({ method: 'GET', url: `/v1/tasks/${world.taskId}?version=${world.taskVersion}` });
      expect(response.statusCode).toBe(200);
      expect(response.json().task).toEqual(await world.board.entry(world.taskId, world.taskVersion));
      expect(response.body).not.toMatch(/editablePaths|publicChecks|packageSha256|endToEndRequirements/);
      const missing = await app.inject({ method: 'GET', url: `/v1/tasks/${randomUUID()}?version=1` });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: 'not_published' });
    } finally { await app.close(); }
  });
});

describe('M6.2 boundary: no chat, no private AI endpoint', () => {
  it('registers exactly the released-data route families and never a chat/AI route', async () => {
    expect(JSON.stringify(RESERVATION_ROUTES.map(route => `${route.method} ${route.path}`))).toBe(JSON.stringify([
      'GET /v1/tasks',
      'GET /v1/tasks/:taskId',
      'POST /v1/tasks/:taskId/reservations',
      'POST /v1/invitations/redeem',
      'GET /v1/reservations/:id',
      'GET /v1/reservations/:id/package',
      'GET /v1/reservations/:id/instructions',
      'GET /v1/reservations/:id/package-defects',
      'POST /v1/reservations/:id/package-defects'
    ]));
    expect(JSON.stringify(ASSIGNMENT_ROUTES.map(route => `${route.method} ${route.path}`))).toBe(JSON.stringify([
      'GET /v1/assignments',
      'POST /v1/assignments',
      'GET /v1/assignments/:id',
      'POST /v1/assignments/:id/invitation'
    ]));
    const app = Fastify({ logger: false });
    const world = await reservationWorld();
    const registered: string[] = [];
    const recorder = {
      get(path: string, handler: unknown) { registered.push(`GET ${path}`); return app.get(path, handler as never); },
      post(path: string, handler: unknown) { registered.push(`POST ${path}`); return app.post(path, handler as never); }
    };
    installContributorReservationRoutes(recorder as never, { board: world.board, reservations: world.reservations, assignments: world.assignments, defects: world.defects });
    expect(registered.sort()).toEqual(JSON.parse(JSON.stringify(RESERVATION_ROUTES.map(route => `${route.method} ${route.path}`))).sort());
    expect(registered.join(' ')).not.toMatch(/chat|\/ai\b|llm|prompt|message|model/i);
    await app.close();
  });
});
