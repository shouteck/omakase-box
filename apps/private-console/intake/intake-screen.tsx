import { useEffect, useState } from 'react';
import { attachImageEvidence, attachTextEvidence, createIntentDraft, createRequest, failureText, listSnapshots, loadRequest, type IntentCreationView, type PrivateSession, type RequestSummary, type SnapshotSummary } from './private-client.js';

const lines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(item => item.length > 0);

export function IntakeScreen(props: { session: PrivateSession | null; onOpenIntent: (intentId: string) => void }) {
  const { session, onOpenIntent } = props;
  const writable = session !== null && session.csrf !== null && session.role !== 'operator';
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [snapshotId, setSnapshotId] = useState('');
  const [goal, setGoal] = useState('');
  const [currentBehaviour, setCurrentBehaviour] = useState('');
  const [desiredBehaviour, setDesiredBehaviour] = useState('');
  const [constraints, setConstraints] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [request, setRequest] = useState<RequestSummary | null>(null);
  const [mode, setMode] = useState<'demo' | 'ollama'>('demo');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [created, setCreated] = useState<IntentCreationView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try { setSnapshots(await listSnapshots()); } catch { if (!controller.signal.aborted) setSnapshots([]); }
    })();
    return () => controller.abort();
  }, [session?.id]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setFailure(null);
    try { await action(); } catch (error) { setFailure(failureText(error)); } finally { setBusy(false); }
  }
  const submitRequest = () => {
    if (!(session !== null && session.csrf !== null)) return;
    const csrf = session.csrf;
    return void run(async () => {
      const createdRequest = await createRequest({ snapshotId, goal, currentBehaviour, desiredBehaviour, constraints: lines(constraints), exclusions: lines(exclusions) }, csrf);
      setRequest(createdRequest);
    });
  };
  const refreshRequest = (requestId: string) => void run(async () => setRequest(await loadRequest(requestId)));
  const attachText = () => {
    if (request === null || !(session !== null && session.csrf !== null)) return;
    const requestId = request.id, csrf = session.csrf;
    return void run(async () => { await attachTextEvidence(requestId, evidenceText, evidenceLabel, csrf); setEvidenceText(''); setEvidenceLabel(''); setRequest(await loadRequest(requestId)); });
  };
  const attachImage = () => {
    if (request === null || imageFile === null || !(session !== null && session.csrf !== null)) return;
    const requestId = request.id, csrf = session.csrf, file = imageFile;
    return void run(async () => { await attachImageEvidence(requestId, file, evidenceLabel, csrf); setImageFile(null); setEvidenceLabel(''); setRequest(await loadRequest(requestId)); });
  };
  const generate = () => {
    if (request === null || !(session !== null && session.csrf !== null)) return;
    const requestId = request.id, csrf = session.csrf;
    return void run(async () => {
      const intent = await createIntentDraft(requestId, mode, csrf);
      setCreated(intent);
      onOpenIntent(intent.id);
    });
  };

  return <main>
    <h2>Outcome intake</h2>
    <p>Describe the outcome in ordinary language — a full-stack feature, a codebase policy change or anything else; all work is reviewed together as one task. No technical specification is required.</p>
    {!writable && <p role="note">{session === null ? 'Sign in as a requester or owner to create outcomes.' : session.role === 'operator' ? 'Operators configure the runtime; they cannot create requests or intents.' : 'Sign in again to make changes; this view is read-only.'}</p>}
    <section aria-label="Outcome details">
      <h3>1. Pinned snapshot and outcome</h3>
      <label htmlFor="intake-snapshot">Pinned snapshot</label>
      <select id="intake-snapshot" value={snapshotId} onChange={event => setSnapshotId(event.target.value)} disabled={!writable || busy}>
        <option value="">Select a pinned snapshot…</option>
        {snapshots.map(snapshot => <option key={snapshot.id} value={snapshot.id}>{snapshot.fileCount} captured files ({snapshot.snapshotHash.slice(0, 12)}…)</option>)}
      </select>
      <label htmlFor="intake-goal">Desired outcome (goal)</label>
      <textarea id="intake-goal" rows={3} value={goal} onChange={event => setGoal(event.target.value)} disabled={!writable || busy} />
      <label htmlFor="intake-current">Current behaviour (optional)</label>
      <textarea id="intake-current" rows={2} value={currentBehaviour} onChange={event => setCurrentBehaviour(event.target.value)} disabled={!writable || busy} />
      <label htmlFor="intake-desired">Desired behaviour (optional)</label>
      <textarea id="intake-desired" rows={2} value={desiredBehaviour} onChange={event => setDesiredBehaviour(event.target.value)} disabled={!writable || busy} />
      <label htmlFor="intake-constraints">Constraints (one per line, optional)</label>
      <textarea id="intake-constraints" rows={2} value={constraints} onChange={event => setConstraints(event.target.value)} disabled={!writable || busy} />
      <label htmlFor="intake-exclusions">Exclusions (one per line, optional)</label>
      <textarea id="intake-exclusions" rows={2} value={exclusions} onChange={event => setExclusions(event.target.value)} disabled={!writable || busy} />
      <button type="button" onClick={submitRequest} disabled={!writable || busy || snapshotId === '' || goal.trim() === ''}>Create private request</button>
    </section>
    {request !== null && <section aria-label="Private evidence">
      <h3>2. Private evidence (optional)</h3>
      <p>Request <code>{request.id}</code> captures {request.evidence.length} evidence item(s). Screenshots stay private evidence; this console never claims image understanding.</p>
      <ul>{request.evidence.map(item => <li key={item.id}>{item.mediaType} — {item.label === '' ? 'unlabelled' : item.label} ({item.bytes} bytes)</li>)}</ul>
      <label htmlFor="intake-evidence-label">Evidence label</label>
      <input id="intake-evidence-label" value={evidenceLabel} onChange={event => setEvidenceLabel(event.target.value)} disabled={!writable || busy} />
      <label htmlFor="intake-evidence-text">Evidence text</label>
      <textarea id="intake-evidence-text" rows={3} value={evidenceText} onChange={event => setEvidenceText(event.target.value)} disabled={!writable || busy} />
      <button type="button" onClick={attachText} disabled={!writable || busy || evidenceText.trim() === ''}>Attach text evidence</button>
      <label htmlFor="intake-evidence-image">Evidence image file (PNG or JPEG)</label>
      <input id="intake-evidence-image" type="file" accept="image/png,image/jpeg" onChange={event => setImageFile(event.target.files?.[0] ?? null)} disabled={!writable || busy} />
      <button type="button" onClick={attachImage} disabled={!writable || busy || imageFile === null}>Attach image evidence</button>
    </section>}
    {request !== null && <section aria-label="Planning mode">
      <h3>3. Planning mode (explicit choice)</h3>
      <p>The mode only prepares an internal proposal; it never chooses an executor and never approves anything.</p>
      <label><input type="radio" name="planning-mode" checked={mode === 'demo'} onChange={() => setMode('demo')} disabled={!writable || busy} /> Deterministic demo planning (no model, no credentials; visibly fixture-based)</label>
      <label><input type="radio" name="planning-mode" checked={mode === 'ollama'} onChange={() => setMode('ollama')} disabled={!writable || busy} /> Operator-configured private model (reports a safe failure when no model is configured)</label>
      <button type="button" onClick={generate} disabled={!writable || busy}>Generate intent draft</button>
    </section>}
    {created !== null && <p role="status">Intent draft {created.id} created ({created.provider.mode} mode).</p>}
    {failure !== null && <p role="alert">Request failed safely: {failure}</p>}
  </main>;
}
