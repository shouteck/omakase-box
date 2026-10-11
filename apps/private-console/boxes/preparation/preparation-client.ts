import { api } from '../../intake/private-client.js';

export interface BoxApprovalView { approvalId: string; artifactHash: string; approvedBy: string; approvedAt: string }
export interface BoxAgreementView {
  boxId: string; version: number; state: string; contentHash: string;
  repoId: string; snapshotId: string; snapshotHash: string; sourceId: string; baseCommit: string;
  supportedCaseId: string; intent: { intentId: string; intentVersion: number; contentHash: string };
  goal: string; facts: { statement: string; assurance: string }[]; assumptions: string[]; unknowns: string[];
  acceptanceExamples: { id: string; description: string; inputs: string[]; outputs: string[]; states: string[]; invalidCases: string[]; exclusions: string[]; examples: { given: string; when: string; then: string }[] }[];
  scope: { included: string[]; excluded: string[] };
  editableSurface: string[]; runnable: string[]; explanatory: string[];
  packageMap: Record<string, string>; dependencyVersions: Record<string, string>; runnableChecks: string[]; truths: string[];
  environmentRef: { reference: string; digest: string };
  evaluatorRef: { reference: string; version: number; digest: string };
  mergeTarget: { reference: string; branch: string; expectedCommit: string };
  artifactHashes: Record<string, string>;
  approval: BoxApprovalView | null;
  supersededApproval: boolean; blockingReasons: string[]; manifestLabel: string;
}
export interface PreparedBoxView { boxId: string; version: number; state: string; contentHash: string; agreement: BoxAgreementView }
export interface BoxArtifactEdit { schemaVersion: 1; artifactId: string; profile: 'open_trusted'; intent: { intentId: string; intentVersion: number; contentHash: string }; goal: string; acceptanceExamples: unknown[]; assumptions: string[]; unknowns: string[]; scope: { included: string[]; excluded: string[] } }

export async function prepareBox(input: { requestId: string; repositoryId: string; supportedCaseId: string; operationKey?: string }, csrf: string | null): Promise<PreparedBoxView> {
  return api<PreparedBoxView>('POST', '/v1/boxes/prepare', input, csrf);
}
export async function loadBoxAgreement(boxId: string): Promise<BoxAgreementView> {
  return api<BoxAgreementView>('GET', `/v1/boxes/${boxId}/agreement`);
}
export async function approveBoxBehavior(boxId: string, input: { expectedVersion: number; expectedHash: string; approvalId: string; operationKey?: string }, csrf: string | null): Promise<{ boxId: string; version: number; state: string; approvedHash: string }> {
  return api('POST', `/v1/boxes/${boxId}/behavior-approval`, input, csrf);
}
export async function openBoxReadiness(boxId: string, expectedVersion: number, csrf: string | null): Promise<{ boxId: string; version: number; state: string }> {
  return api('POST', `/v1/boxes/${boxId}/readiness`, { expectedVersion }, csrf);
}
export async function reviseBox(boxId: string, input: { expectedVersion: number; artifact: BoxArtifactEdit; operationKey?: string }, csrf: string | null): Promise<{ boxId: string; version: number; state: string; contentHash: string; approvalInvalidated: boolean }> {
  return api('POST', `/v1/boxes/${boxId}/revisions`, input, csrf);
}
