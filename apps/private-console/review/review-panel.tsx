import { useCallback, useEffect, useState } from 'react';
import { api, type PrivateSession } from '../intake/private-client.js';

export interface PendingEvaluationView {
  evaluationId: string; taskId: string; taskVersion: number; version: number; outcome: string | null;
}

interface DecisionResponse { created: boolean; eventId: string; state: string }

/** Data-only owner review panel (M7.2): lists evaluations awaiting owner
 *  decision and submits accept / changes-required / package-defect-
 *  compensation decisions with the exact expected version. The server
 *  performs the atomic acceptance transaction; this panel cannot create
 *  evidence, payable records or feedback by itself. */
export function ReviewPanel({ session }: { session: PrivateSession | null }) {
  const [evaluations, setEvaluations] = useState<PendingEvaluationView[]>([]);
  const [status, setStatus] = useState('Owner review queue loads on sign-in.');
  const [busy, setBusy] = useState(false);
  const enabled = session?.role === 'owner' && session.csrf !== null;

  const load = useCallback(async () => {
    if (!enabled || !session?.csrf) return;
    try {
      const response = await api<{ evaluations?: PendingEvaluationView[] }>('GET', '/v1/acceptance/pending', undefined, session.csrf);
      setEvaluations(response.evaluations ?? []);
      setStatus('Queue loaded (tested). Acceptance writes payable records atomically server-side.');
    } catch { setStatus('Review queue unavailable (unverified).'); }
  }, [enabled, session?.csrf]);

  useEffect(() => { void load(); }, [load]);

  async function decide(evaluationId: string, version: number, action: 'accept' | 'reject' | 'compensate') {
    if (!enabled || !session?.csrf) return;
    setBusy(true);
    try {
      const result = await api<DecisionResponse>('POST', `/v1/acceptance/evaluations/${evaluationId}/${action}`, { expectedVersion: version }, session.csrf);
      setStatus(`${action === 'accept' ? 'Acceptance' : action === 'reject' ? 'Changes required' : 'Compensation'} ${result.created ? 'recorded' : 'already recorded'} (tested): ${result.state}.`);
      await load();
    } catch { setStatus('Decision rejected or unavailable (unverified).'); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Owner review">
      <h2>Owner review</h2>
      <p>{status}</p>
      <button type="button" disabled={!enabled || busy} onClick={() => void load()}>Refresh queue</button>
      {evaluations.length === 0
        ? <p>No evaluations awaiting owner review.</p>
        : (
          <ul>
            {evaluations.map(evaluation => (
              <li key={evaluation.evaluationId}>
                <p><strong>Evaluation</strong> {evaluation.evaluationId}</p>
                <p>Task {evaluation.taskId} v{evaluation.taskVersion} · evaluation version {evaluation.version} · outcome {evaluation.outcome ?? 'unverified'}</p>
                <button type="button" disabled={!enabled || busy} onClick={() => void decide(evaluation.evaluationId, evaluation.version, 'accept')}>Accept</button>{' '}
                <button type="button" disabled={!enabled || busy} onClick={() => void decide(evaluation.evaluationId, evaluation.version, 'reject')}>Changes required</button>{' '}
                <button type="button" disabled={!enabled || busy} onClick={() => void decide(evaluation.evaluationId, evaluation.version, 'compensate')}>Package-defect compensation</button>
              </li>
            ))}
          </ul>
        )}
      <p><em>Real-runner evidence remains unavailable; only completed verified evaluations reach this queue.</em></p>
    </section>
  );
}
