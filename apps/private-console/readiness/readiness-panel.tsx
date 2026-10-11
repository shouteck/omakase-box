import { useState } from 'react';
import { api, type PrivateSession } from '../intake/private-client.js';

export interface ReadinessRecordView {
  recordId: string; taskId: string; taskVersion: number; packageDigest: string;
  kind: string; status: 'passed' | 'failed' | 'unverified'; reasonCode: string | null;
  classifiedOutcome: string | null; assurance: string; recordedBy: string; recordedAt: string;
}
export interface GateDecisionView {
  decisionId: string; decision: 'publishable' | 'blocked';
  reasons: readonly { code: string; kind: string | null }[]; evaluatedRecordIds: readonly string[];
}

const KIND_LABELS: Record<string, string> = {
  fresh_build: 'Fresh build', traceability: 'Traceability', ambiguity_review: 'Ambiguity review',
  external_solve: 'External-context solve', human_review: 'Human readiness review',
  preservation_check: 'Preservation check', integration_check: 'Integration check', reference_patch: 'Reference patch',
};

/** Data-only readiness panel (M4.3): renders immutable records and the gate
 *  verdict for an exact task version + package digest. Records are created
 *  only through the private API; this panel cannot fabricate evidence. */
export function ReadinessPanel({ session }: { session: PrivateSession | null }) {
  const [taskId, setTaskId] = useState('');
  const [version, setVersion] = useState(1);
  const [packageDigest, setPackageDigest] = useState('');
  const [records, setRecords] = useState<ReadinessRecordView[]>([]);
  const [decision, setDecision] = useState<GateDecisionView | null>(null);
  const [status, setStatus] = useState('Readiness evidence loads on demand for an exact task version.');
  const [busy, setBusy] = useState(false);
  const enabled = session?.role === 'owner' && session.csrf !== null;
  async function load(event: React.FormEvent) {
    event.preventDefault();
    if (!enabled || !session?.csrf || !taskId || !version) return;
    setBusy(true);
    try {
      const response = await api<{ records?: ReadinessRecordView[] }>('GET', `/v1/readiness/tasks/${taskId}/versions/${version}`, undefined, session.csrf);
      setRecords(response.records ?? []);
      setStatus('Records loaded (tested). Gate decisions remain server-side and immutable.');
    } catch { setStatus('Readiness records unavailable (unverified).'); }
    finally { setBusy(false); }
  }
  async function decide(event: React.FormEvent) {
    event.preventDefault();
    if (!enabled || !session?.csrf || !taskId || !/^[a-f0-9]{64}$/.test(packageDigest)) return;
    setBusy(true);
    try {
      const response = await api<{ decision: GateDecisionView }>('POST', `/v1/readiness/tasks/${taskId}/versions/${version}/publication`, { packageDigest }, session.csrf);
      setDecision(response.decision);
      setStatus(response.decision.decision === 'blocked' ? 'Publication blocked — reasons recorded immutably.' : 'Publication decision recorded (tested). External publication remains unverified.');
    } catch { setStatus('Publication decision unavailable (unverified).'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Publication readiness"><h2>Publication readiness</h2>
    <p>Immutable evidence records per exact task version and package digest. A failed external solve is a classified failure — never automatic ambiguity.</p>
    <p role="status">{status}</p>
    <form onSubmit={event => { void load(event); }}>
      <label>Task ID <input required value={taskId} onChange={event => setTaskId(event.target.value)} /></label>
      <label>Task version <input type="number" min={1} required value={version} onChange={event => setVersion(Number(event.target.value))} /></label>
      <button disabled={!enabled || busy || !taskId}>Load records</button>
    </form>
    <form onSubmit={event => { void decide(event); }}>
      <label>Approved package SHA-256 <input required minLength={64} maxLength={64} pattern="[a-f0-9]{64}" value={packageDigest} onChange={event => setPackageDigest(event.target.value)} /></label>
      <button disabled={!enabled || busy || !taskId || packageDigest.length !== 64}>Evaluate publish gate</button>
    </form>
    {decision ? <section aria-label="Gate decision"><h3>Gate decision: {decision.decision}</h3>
      {decision.decision === 'blocked' ? <ul>{decision.reasons.map((reason, index) => <li key={index}>{reason.code}{reason.kind ? ` (${KIND_LABELS[reason.kind] ?? reason.kind})` : ''}</li>)}</ul> : null}
    </section> : null}
    <table aria-label="Readiness records"><thead><tr><th>Kind</th><th>Status</th><th>Reason</th><th>Assurance</th><th>Recorded</th></tr></thead>
      <tbody>{records.map(record => <tr key={record.recordId}><td>{KIND_LABELS[record.kind] ?? record.kind}</td><td>{record.status}</td><td>{record.reasonCode ?? '—'}{record.classifiedOutcome ? ` (${record.classifiedOutcome})` : ''}</td><td>{record.assurance}</td><td>{record.recordedAt}</td></tr>)}</tbody>
    </table>
    <p>Publication, assignment and acceptance stay blocked until every mandatory record passes on the dedicated runner. Unverified evidence is never completed evidence.</p>
  </section>;
}
