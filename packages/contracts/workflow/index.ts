export type ActorRole = 'requester' | 'owner' | 'operator' | 'contributor' | 'system';
export type WorkflowKind = 'intent' | 'preparation' | 'reservation' | 'submission' | 'ledger';
export interface TransitionRequest { kind: WorkflowKind; from: string; to: string; actor: ActorRole; expectedVersion: number; currentVersion: number }
export interface TrustedTransitionEvidence {
  requiredDecisionsResolved?: boolean; exactHashConfirmed?: boolean; readinessPassed?: boolean;
  reservationValid?: boolean; evaluationPassed?: boolean; latestAttempt?: boolean; privateBaseCurrent?: boolean; settlementReferencePresent?: boolean;
}
export class WorkflowError extends Error {
  constructor(readonly code: 'stale_version' | 'invalid_transition' | 'forbidden_role' | 'missing_evidence') { super(code); }
}
const transitions: Record<WorkflowKind, Record<string, readonly string[]>> = {
  intent: { draft: ['needs_decision', 'ready_for_approval'], needs_decision: ['ready_for_approval'], ready_for_approval: ['approved'] },
  preparation: { proposed: ['checked', 'withdrawn'], checked: ['release_review', 'withdrawn'], release_review: ['approved', 'withdrawn'], approved: ['packaged', 'withdrawn'], packaged: ['ready', 'withdrawn'], ready: ['published', 'withdrawn'], published: ['withdrawn'] },
  reservation: { active: ['in_review', 'expired', 'cancelled'], in_review: ['active', 'accepted', 'expired', 'cancelled'] },
  submission: { received: ['public_evaluating', 'infrastructure_failure'], public_evaluating: ['private_evaluating', 'changes_required', 'package_defect', 'infrastructure_failure'], private_evaluating: ['owner_review', 'changes_required', 'package_defect', 'infrastructure_failure'], owner_review: ['accepted', 'changes_required', 'package_defect', 'infrastructure_failure'] },
  ledger: { due: ['settlement_recorded'] }
};
export function assertTransition(request: TransitionRequest, evidence: TrustedTransitionEvidence = {}): void {
  const { kind, from, to, actor, expectedVersion, currentVersion } = request;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion !== currentVersion) throw new WorkflowError('stale_version');
  if (!transitions[kind]?.[from]?.includes(to)) throw new WorkflowError('invalid_transition');
  let roles: readonly ActorRole[];
  if (kind === 'intent') roles = to === 'approved' ? ['owner'] : ['requester', 'owner'];
  else if (kind === 'preparation') roles = ['approved', 'published', 'withdrawn'].includes(to) ? ['owner'] : ['owner', 'operator'];
  else if (kind === 'submission') roles = from === 'owner_review' && to !== 'infrastructure_failure' ? ['owner'] : ['operator', 'system'];
  else if (kind === 'ledger') roles = ['owner'];
  else roles = to === 'in_review' ? ['contributor', 'system'] : to === 'cancelled' ? ['owner', 'contributor', 'system'] : ['owner', 'system'];
  if (!roles.includes(actor)) throw new WorkflowError('forbidden_role');
  const requireEvidence = (...keys: (keyof TrustedTransitionEvidence)[]) => { if (keys.some(key => evidence[key] !== true)) throw new WorkflowError('missing_evidence'); };
  if (kind === 'intent' && ['ready_for_approval', 'approved'].includes(to)) requireEvidence('requiredDecisionsResolved');
  if (to === 'approved') requireEvidence('exactHashConfirmed');
  if (kind === 'preparation' && ['ready', 'published'].includes(to)) requireEvidence('exactHashConfirmed', 'readinessPassed');
  if (kind === 'reservation' && ['in_review', 'active', 'accepted'].includes(to)) requireEvidence('reservationValid');
  if (kind === 'submission' && to === 'private_evaluating') requireEvidence('evaluationPassed');
  if (kind === 'submission' && ['owner_review', 'accepted'].includes(to)) requireEvidence('evaluationPassed', 'latestAttempt', 'privateBaseCurrent');
  if (kind === 'ledger') requireEvidence('settlementReferencePresent');
}
