import { describe, expect, it } from 'vitest';
import { assertTransition, WorkflowError } from '../../../packages/contracts/workflow/index.js';

const version = { expectedVersion: 1, currentVersion: 1 };
describe('workflow guards derived from published state and authority rules', () => {
  it('rejects stale versions before mutation', () => {
    expect(() => assertTransition({ kind: 'intent', from: 'draft', to: 'ready_for_approval', actor: 'requester', expectedVersion: 1, currentVersion: 2 }, { requiredDecisionsResolved: true })).toThrow(WorkflowError);
  });
  it('prevents requester/operator/contributor outcome approval', () => {
    for (const actor of ['requester', 'operator', 'contributor'] as const) expect(() => assertTransition({ kind: 'intent', from: 'ready_for_approval', to: 'approved', actor, ...version }, { requiredDecisionsResolved: true, exactHashConfirmed: true })).toThrow();
  });
  it('blocks owner approval of unresolved or changed content', () => {
    for (const evidence of [{}, { requiredDecisionsResolved: true }, { exactHashConfirmed: true }]) expect(() => assertTransition({ kind: 'intent', from: 'ready_for_approval', to: 'approved', actor: 'owner', ...version }, evidence)).toThrow();
  });
  it('accepts an exact resolved synthetic owner intent approval', () => {
    expect(() => assertTransition({ kind: 'intent', from: 'ready_for_approval', to: 'approved', actor: 'owner', ...version }, { requiredDecisionsResolved: true, exactHashConfirmed: true })).not.toThrow();
  });
  it('cannot publish before whole-release approval and readiness', () => {
    expect(() => assertTransition({ kind: 'preparation', from: 'packaged', to: 'published', actor: 'owner', ...version }, { exactHashConfirmed: true, readinessPassed: true })).toThrow();
    expect(() => assertTransition({ kind: 'preparation', from: 'ready', to: 'published', actor: 'owner', ...version }, {})).toThrow();
  });
  it('does not allow another upload while a reservation is in review or expired', () => {
    expect(() => assertTransition({ kind: 'reservation', from: 'in_review', to: 'in_review', actor: 'contributor', ...version }, { reservationValid: true })).toThrow();
    expect(() => assertTransition({ kind: 'reservation', from: 'active', to: 'in_review', actor: 'contributor', ...version }, { reservationValid: false })).toThrow();
  });
  it('allows changes_required to reactivate without manufacturing a new expiry', () => {
    expect(() => assertTransition({ kind: 'reservation', from: 'in_review', to: 'active', actor: 'system', ...version }, { reservationValid: true })).not.toThrow();
  });
  it('requires complete latest-attempt evidence and current private base for acceptance', () => {
    const request = { kind: 'submission', from: 'owner_review', to: 'accepted', actor: 'owner', ...version } as const;
    expect(() => assertTransition(request, {})).toThrow();
    expect(() => assertTransition(request, { evaluationPassed: true, latestAttempt: false, privateBaseCurrent: true })).toThrow();
    expect(() => assertTransition(request, { evaluationPassed: true, latestAttempt: true, privateBaseCurrent: true })).not.toThrow();
  });
  it('never turns timeout/infrastructure failure into acceptance', () => {
    expect(() => assertTransition({ kind: 'submission', from: 'infrastructure_failure', to: 'accepted', actor: 'owner', ...version }, { evaluationPassed: true, latestAttempt: true, privateBaseCurrent: true })).toThrow();
  });
  it('records settlement only by owner with a reference, never paid by provider', () => {
    expect(() => assertTransition({ kind: 'ledger', from: 'due', to: 'settlement_recorded', actor: 'operator', ...version }, { settlementReferencePresent: true })).toThrow();
    expect(() => assertTransition({ kind: 'ledger', from: 'due', to: 'paid', actor: 'owner', ...version }, {})).toThrow();
  });
});
