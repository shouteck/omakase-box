const API = 'http://private.localhost:4000';
const CSRF_KEY = 'private-task-console-csrf';

export type PrivateRole = 'requester' | 'owner' | 'operator';
export interface PrivateSession { id: string; role: PrivateRole; csrf: string | null }
export interface EvidenceReferenceView { evidenceId: string; snapshotHash: string; location: string }
export interface RequirementView { id: string; description: string; inputs: string[]; outputs: string[]; states: string[]; invalidCases: string[]; exclusions: string[]; examples: { given: string; when: string; then: string }[] }
export interface DecisionView { id: string; question: string; required: boolean; answer: string | null }
export interface IntentReview {
  id: string; version: number; state: string; reviewedPayloadState: string; contentHash: string;
  approval: { approvedBy: string; approvedHash: string; approvedAt: string } | null;
  supersededApproval: boolean; blockage: { requiredUnresolved: number }; goal: string;
  facts: { statement: string; assurance: string; evidence: EvidenceReferenceView[] }[];
  evidence: EvidenceReferenceView[]; decisions: DecisionView[];
  assumptions: { statement: string; assurance: string }[]; unknowns: string[];
  acceptanceExamples: RequirementView[]; scope: { included: string[]; excluded: string[] };
  provenance: { requestId: string | null; snapshotHash: string };
}
export interface SnapshotSummary { id: string; snapshotHash: string; fileCount: number }
export interface RequestSummary { id: string; snapshotId: string; goal: string; currentBehaviour: string; desiredBehaviour: string; constraints: string[]; exclusions: string[]; evidence: { id: string; mediaType: string; label: string; bytes: number }[] }
export interface IntentCreationView { id: string; version: number; state: string; contentHash: string; provider: { mode: string; inputHash: string; proposalHash: string; repairAttempts: number; modelVerification: string } }
export class ApiError extends Error { constructor(readonly status: number, readonly code: string, readonly reason: string | null = null) { super(code); } }

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown, csrf?: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { throw new ApiError(0, 'private_service_unreachable'); }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
  if (!response.ok) {
    const record = (parsed ?? {}) as { error?: unknown; reason?: unknown };
    throw new ApiError(response.status, typeof record.error === 'string' ? record.error : 'request_failed', typeof record.reason === 'string' ? record.reason : null);
  }
  return parsed as T;
}

export function storedCsrf(): string | null {
  try { const value = sessionStorage.getItem(CSRF_KEY); return value !== null && /^[a-f0-9]{64}$/.test(value) ? value : null; } catch { return null; }
}
export function rememberCsrf(value: string | null) {
  try { if (value === null) sessionStorage.removeItem(CSRF_KEY); else sessionStorage.setItem(CSRF_KEY, value); } catch { /* storage unavailable */ }
}

export async function currentSession(): Promise<{ id: string; role: PrivateRole } | null> {
  try {
    const session = await api<{ id?: unknown; role?: unknown }>('GET', '/v1/auth/session');
    if (typeof session?.id === 'string' && typeof session.role === 'string' && ['requester', 'owner', 'operator'].includes(session.role)) return { id: session.id, role: session.role as PrivateRole };
    return null;
  } catch { return null; }
}
export async function signIn(username: string, password: string): Promise<{ session: { id: string; role: PrivateRole } | null; csrf: string | null; error: string | null }> {
  let csrfToken: unknown = null;
  try {
    const result = await api<{ csrfToken?: unknown }>('POST', '/v1/auth/login', { username, password });
    csrfToken = result?.csrfToken;
  } catch (error) { return { session: null, csrf: null, error: error instanceof ApiError ? error.code : 'request_failed' }; }
  if (typeof csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(csrfToken)) return { session: null, csrf: null, error: 'missing_csrf_token' };
  rememberCsrf(csrfToken);
  const session = await currentSession();
  if (session === null) return { session: null, csrf: null, error: 'session_unavailable' };
  return { session, csrf: csrfToken, error: null };
}
export async function signOut(csrf: string | null) {
  if (csrf === null) return;
  try { await api('POST', '/v1/auth/logout', {}, csrf); } catch { /* session already gone */ }
}

export async function listSnapshots(): Promise<SnapshotSummary[]> {
  const result = await api<{ snapshots?: SnapshotSummary[] }>('GET', '/v1/snapshots');
  return Array.isArray(result?.snapshots) ? result.snapshots : [];
}
function normalizedRequest(value: { id: string; snapshotId: string; goal: string; currentBehaviour?: string; desiredBehaviour?: string; constraints?: string[]; exclusions?: string[]; evidence?: RequestSummary['evidence'] }): RequestSummary {
  return { id: value.id, snapshotId: value.snapshotId, goal: value.goal, currentBehaviour: value.currentBehaviour ?? '', desiredBehaviour: value.desiredBehaviour ?? '', constraints: Array.isArray(value.constraints) ? value.constraints : [], exclusions: Array.isArray(value.exclusions) ? value.exclusions : [], evidence: Array.isArray(value.evidence) ? value.evidence : [] };
}
export async function createRequest(input: { snapshotId: string; goal: string; currentBehaviour: string; desiredBehaviour: string; constraints: string[]; exclusions: string[] }, csrf: string | null): Promise<RequestSummary> {
  return normalizedRequest(await api<{ id: string; snapshotId: string; goal: string }>('POST', '/v1/requests', input, csrf));
}
export async function loadRequest(requestId: string): Promise<RequestSummary> {
  return normalizedRequest(await api<{ id: string; snapshotId: string; goal: string }>('GET', `/v1/requests/${requestId}`));
}
export async function attachTextEvidence(requestId: string, text: string, label: string, csrf: string): Promise<{ id: string; mediaType: string; label: string; bytes: number }> {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return api('POST', `/v1/requests/${requestId}/evidence`, { mediaType: 'text/plain', base64: btoa(binary), label }, csrf);
}
export async function attachImageEvidence(requestId: string, file: File, label: string, csrf: string): Promise<{ id: string; mediaType: string; label: string; bytes: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ApiError(0, 'file_unreadable'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(',')[1] ?? '';
  const mediaType = file.type === 'image/png' || file.type === 'image/jpeg' ? file.type : 'image/png';
  return api('POST', `/v1/requests/${requestId}/evidence`, { mediaType, base64, label }, csrf);
}
export async function createIntentDraft(requestId: string, mode: 'demo' | 'ollama', csrf: string): Promise<IntentCreationView> {
  return api<IntentCreationView>('POST', `/v1/requests/${requestId}/intents`, { mode }, csrf);
}
export async function intentReview(intentId: string): Promise<IntentReview> {
  return api<IntentReview>('GET', `/v1/intents/${intentId}/review`);
}
export async function currentIntentForRequest(requestId: string): Promise<IntentReview> {
  return api<IntentReview>('GET', `/v1/requests/${requestId}/intent`);
}
export async function resolveDecision(intentId: string, decisionId: string, answer: string, expectedVersion: number, csrf: string): Promise<{ version: number; state: string; contentHash: string }> {
  return api('POST', `/v1/intents/${intentId}/decisions`, { decisionId, answer, expectedVersion }, csrf);
}
export async function reviseIntent(intentId: string, input: { expectedVersion: number; mode: 'demo' | 'ollama'; goal?: string; desiredBehaviour?: string; currentBehaviour?: string; constraints?: string[]; exclusions?: string[] }, csrf: string): Promise<{ version: number; state: string; contentHash: string; approvalInvalidated?: boolean }> {
  return api('POST', `/v1/intents/${intentId}/revisions`, input, csrf);
}
export async function readyIntent(intentId: string, expectedVersion: number, expectedHash: string, csrf: string): Promise<{ version: number; state: string; contentHash: string }> {
  return api('POST', `/v1/intents/${intentId}/readiness`, { expectedVersion, expectedHash }, csrf);
}
export async function approveIntent(intentId: string, expectedVersion: number, expectedHash: string, csrf: string): Promise<{ version: number; state: string; contentHash: string; approvedHash: string }> {
  return api('POST', `/v1/intents/${intentId}/approval`, { expectedVersion, expectedHash }, csrf);
}
export function failureText(error: unknown): string {
  if (error instanceof ApiError) return error.reason === null ? `${error.code} (${error.status})` : `${error.code} — ${error.reason} (${error.status})`;
  return 'unexpected client error';
}
