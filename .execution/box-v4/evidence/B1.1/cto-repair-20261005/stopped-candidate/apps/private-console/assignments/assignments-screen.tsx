import { useState } from 'react';
import { api, type PrivateSession } from '../intake/private-client.js';

export function AssignmentsScreen({ session, publicationReady = false }: { session: PrivateSession | null; publicationReady?: boolean }) {
  const [taskId, setTaskId] = useState(''), [taskVersion, setTaskVersion] = useState(1), [packageDigest, setPackageDigest] = useState('');
  const [pending, setPending] = useState<{ identity: string; key: string } | null>(null);
  const [kind, setKind] = useState(''), [label, setLabel] = useState(''), [contributorId, setContributorId] = useState('');
  const [status, setStatus] = useState('No executor is selected automatically.'), [busy, setBusy] = useState(false);
  const enabled = publicationReady && session?.role === 'owner' && session.csrf !== null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!enabled || !session?.csrf || !['human', 'ai', 'team'].includes(kind)) return;
    setBusy(true);
    try {
      const choice = { taskId, taskVersion, packageDigest, executor: { kind, label, ...(kind === 'human' ? { contributorId } : {}) } };
      const identity = JSON.stringify(choice), key = pending?.identity === identity ? pending.key : crypto.randomUUID();
      setPending({ identity, key });
      await api('POST', '/v1/assignments', { ...choice, idempotencyKey: key }, session.csrf);
      setStatus('Customer executor choice queued (tested). External delivery remains unverified; no AI routing or execution was started.');
    } catch { setStatus('Assignment unavailable or not permitted (unverified). No choice is claimed.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Customer assignments"><h2>Customer assignments</h2><p>Choose human, AI or team execution explicitly. These are descriptive labels, not an automatic routing decision.</p><p role="status">{status}</p>{!publicationReady ? <p>Publication readiness remains blocked. Assignment writes are disabled until the exact task version is ready.</p> : null}<form onSubmit={event => { void submit(event); }}><label>Task ID <input required value={taskId} onChange={event => setTaskId(event.target.value)} /></label><label>Task version <input type="number" min={1} max={2147483647} required value={taskVersion} onChange={event => setTaskVersion(Number(event.target.value))} /></label><label>Approved package SHA-256 <input required minLength={64} maxLength={64} pattern="[a-f0-9]{64}" value={packageDigest} onChange={event => setPackageDigest(event.target.value)} /></label><label>Executor choice <select required value={kind} onChange={event => setKind(event.target.value)}><option value="">Choose an executor</option><option value="human">Human</option><option value="ai">AI</option><option value="team">Team</option></select></label><label>Executor label <input required minLength={3} maxLength={120} value={label} onChange={event => setLabel(event.target.value)} /></label>{kind === 'human' ? <label>Invited contributor ID <input required value={contributorId} onChange={event => setContributorId(event.target.value)} /></label> : null}<button disabled={!enabled || busy || !kind}>Record customer choice</button></form><p>No contributor invitation is sent and no payment is made by this screen.</p></section>;
}
