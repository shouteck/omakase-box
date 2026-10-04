import type { SessionActor } from './store.js';

export type AuthScope = 'private' | 'external';
export type AuthAction = 'snapshot.read' | 'snapshot.import' | 'request.read' | 'request.write' | 'intent.read' | 'intent.write' | 'intent.approve' | 'release.approve' | 'publication.approve' | 'assignment.approve' | 'acceptance.approve' | 'runtime.configure' | 'evaluation.operate' | 'invitation.create' | 'reservation.read' | 'reservation.write' | 'submission.read' | 'submission.write';
const privatePermissions: Record<string, readonly AuthAction[]> = {
  requester: ['snapshot.read', 'request.read', 'request.write', 'intent.read', 'intent.write'],
  owner: ['snapshot.read', 'snapshot.import', 'request.read', 'request.write', 'intent.read', 'intent.write', 'intent.approve', 'release.approve', 'publication.approve', 'assignment.approve', 'acceptance.approve', 'invitation.create'],
  operator: ['snapshot.read', 'snapshot.import', 'runtime.configure', 'evaluation.operate']
};
const externalPermissions: Record<string, readonly AuthAction[]> = { contributor: ['reservation.read', 'reservation.write', 'submission.read', 'submission.write'] };
export function validServiceRole(scope: unknown, role: unknown): role is SessionActor['role'] {
  return typeof role === 'string' && (scope === 'private' ? ['requester', 'owner', 'operator'].includes(role) : scope === 'external' && role === 'contributor');
}
export function permits(scope: unknown, role: unknown, action: unknown): boolean {
  if (!validServiceRole(scope, role) || typeof action !== 'string') return false;
  const permissions = scope === 'private' ? privatePermissions : externalPermissions;
  return permissions[role]?.includes(action as AuthAction) === true;
}
