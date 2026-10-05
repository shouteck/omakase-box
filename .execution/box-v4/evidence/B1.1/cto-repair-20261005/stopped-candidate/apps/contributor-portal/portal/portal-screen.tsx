import { useEffect, useState } from 'react';
import type { PublicListing } from '../../../packages/contracts/public/index.js';

interface Session { id: string; csrf: string | null }
interface Reservation {
  id: string; taskId: string; taskVersion: number; state: string; version: number;
  executor: { kind: string; label: string }; expiresAt: string;
}
interface Instructions {
  purpose: string; requirements: { id: string; description: string }[]; editBoundary: string[];
  environment: { executionProfile: string }; reward: { currency: string; amountMinor: number };
  compensation: { packageDefectCompensation: { currency: string; amountMinor: number }; cancellationPolicy: string; budgetExhaustionPolicy: string };
}
interface Defect { id: string; category: string; description: string }
const CSRF_KEY = 'private-task-contributor-csrf';
const DEFAULT_API = 'http://contributor.localhost:4001';
const categories = ['missing_context', 'missing_dependency', 'environment_failure', 'documentation_failure', 'other'];
const money = (value: { currency: string; amountMinor: number }) => `${value.currency} ${(value.amountMinor / 100).toFixed(2)}`;

function csrfStored(): string | null {
  try { const value = sessionStorage.getItem(CSRF_KEY); return value && /^[a-f0-9]{64}$/.test(value) ? value : null; } catch { return null; }
}

export function PortalScreen({ apiBase = DEFAULT_API }: { apiBase?: string }) {
  const validBase = /^http:\/\/contributor\.localhost:[1-9][0-9]{0,4}$/.test(apiBase) && Number(new URL(apiBase).port) <= 65535;
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [tasks, setTasks] = useState<PublicListing[]>([]), [selected, setSelected] = useState<PublicListing | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null), [instructions, setInstructions] = useState<Instructions | null>(null);
  const [description, setDescription] = useState(''), [category, setCategory] = useState('missing_context'), [reports, setReports] = useState<Defect[]>([]);
  const [status, setStatus] = useState('Checking contributor service…'), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    if (!validBase) throw new Error('unavailable');
    const response = await fetch(apiBase + path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(method === 'POST' && session?.csrf ? { 'X-CSRF-Token': session.csrf } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error('unavailable');
    return await response.json() as T;
  }

  async function loadTasks() {
    const result = await request<{ tasks: PublicListing[] }>('GET', '/v1/tasks');
    setTasks(result.tasks); setLoaded(true);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!validBase) { setStatus('Contributor API configuration is invalid (unverified).'); return; }
      try {
        const response = await fetch(apiBase + '/v1/auth/session', { credentials: 'include' });
        if (response.ok) {
          const current = await response.json() as { id?: unknown };
          if (active && typeof current.id === 'string') setSession({ id: current.id, csrf: csrfStored() });
        }
        const board = await fetch(apiBase + '/v1/tasks', { credentials: 'include' });
        if (board.ok) {
          const result = await board.json() as { tasks: PublicListing[] };
          if (active) { setTasks(result.tasks); setLoaded(true); setStatus('Released board loaded (tested).'); }
        } else if (active) setStatus('Sign in to view released tasks. Publication readiness remains gated.');
      } catch { if (active) setStatus('Contributor service unavailable (unverified).'); }
    })();
    return () => { active = false; };
  }, [apiBase, validBase]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); } catch { setStatus('Request unavailable or not permitted (unverified). No change is claimed.'); }
    finally { setBusy(false); }
  }

  async function signIn() {
    const result = await request<{ csrfToken: string }>('POST', '/v1/auth/login', { username, password });
    if (!/^[a-f0-9]{64}$/.test(result.csrfToken)) throw new Error('unavailable');
    const current = await request<{ id: string }>('GET', '/v1/auth/session');
    try { sessionStorage.setItem(CSRF_KEY, result.csrfToken); } catch {}
    setSession({ id: current.id, csrf: result.csrfToken }); setPassword('');
    await loadTasks(); setStatus('Signed in.');
  }

  async function reserve() {
    if (!selected || !session?.csrf) return;
    const view = await request<Reservation>('POST', `/v1/tasks/${selected.taskId}/reservations`, { taskVersion: selected.version });
    setReservation(view); setInstructions(null); setReports([]);
    const result = await request<{ instructions: Instructions }>('GET', `/v1/reservations/${view.id}/instructions`);
    setInstructions(result.instructions); setStatus('Reservation recorded (tested). Original expiry is fixed.');
  }

  async function download() {
    if (!reservation || !validBase) return;
    const response = await fetch(`${apiBase}/v1/reservations/${reservation.id}/package`, { credentials: 'include' });
    const digest = response.headers.get('X-Package-SHA256');
    if (!response.ok || !digest || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('unavailable');
    const blob = await response.blob();
    if (blob.size > 134217728) throw new Error('unavailable');
    const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), value => value.toString(16).padStart(2, '0')).join('');
    if (actual !== digest) throw new Error('unavailable');
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `task-${reservation.taskId}-v${reservation.taskVersion}.zip`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Approved package SHA-256: ${digest} (tested byte digest; not runtime verification).`);
  }

  async function fileDefect() {
    if (!reservation) return;
    const report = await request<Defect>('POST', `/v1/reservations/${reservation.id}/package-defects`, { taskId: reservation.taskId, taskVersion: reservation.taskVersion, category, description, idempotencyKey: crypto.randomUUID() });
    setReports(previous => [...previous, report]); setDescription(''); setStatus('Defect report recorded (tested). Compensation is not automatically accepted or paid.');
  }

  const live = reservation && ['active', 'in_review'].includes(reservation.state) && Date.parse(reservation.expiresAt) > Date.now();
  return <main>
    <h1>Contributor portal</h1>
    <p>Local reservation component. Real isolated evaluation and final delivery remain unverified. No patch executes here.</p>
    <p role="status">{status}</p>
    {session ? <p>Signed in as contributor ({session.id.slice(0, 8)}…) <button disabled={busy || !session.csrf} onClick={() => { void perform(async () => { await request('POST', '/v1/auth/logout', {}); try { sessionStorage.removeItem(CSRF_KEY); } catch {} setSession(null); setReservation(null); setInstructions(null); setSelected(null); setReports([]); setTasks([]); setLoaded(false); setStatus('Signed out.'); }); }}>Sign out</button></p>
      : <form aria-label="Contributor sign-in" onSubmit={event => { event.preventDefault(); void perform(signIn); }}>
          <label>Username <input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>Password <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <button disabled={busy || !username || !password || !validBase}>Sign in</button>
        </form>}
    <section aria-label="Released tasks"><h2>Released tasks</h2>
      {loaded && tasks.length === 0 ? <p>No tasks have been released to the local board yet.</p> : null}
      {tasks.map(task => <article key={`${task.taskId}:${task.version}`}><h3>{task.title}</h3><p>{task.purpose}</p><p>{task.disciplines.join(', ')} — payment obligation: {money(task.reward)}</p><p>{task.terms.reservationDurationSeconds / 60} minute reservation</p><button disabled={busy} onClick={() => { setSelected(task); }}>View task</button></article>)}
    </section>
    {selected ? <section aria-label="Released task detail"><h2>{selected.title}</h2><p>{selected.purpose}</p><p>{selected.terms.reservationDurationSeconds / 60} minute reservation — original expiry is preserved through permitted revisions.</p><p>{selected.terms.cancellationPolicy}</p><p>Exact requirements and editable files are revealed only to the reservation holder.</p>{!session ? <p>Sign in to reserve.</p> : null}<button disabled={busy || !session?.csrf || Boolean(live)} onClick={() => { void perform(reserve); }}>Reserve this task</button></section> : null}
    {!session ? <p>Sign in to see your reservations.</p> : null}
    {reservation ? <section aria-label="Reservation status"><h2>Reservation status</h2><p>State: {reservation.state}</p><p>{reservation.executor.label}</p><p>Executor choice: {reservation.executor.kind}</p><p>Reservation expires {reservation.expiresAt}</p><button disabled={busy || !live} onClick={() => { void perform(download); }}>Download approved package</button></section> : null}
    {instructions && reservation ? <section aria-label="Package instructions"><h2>Package instructions</h2><p>{instructions.purpose}</p><ul>{instructions.requirements.map(requirement => <li key={requirement.id}>{requirement.description}</li>)}</ul><p>Allowed edit paths: {instructions.editBoundary.join(', ')}</p><p>Original expiry is preserved: {reservation.expiresAt}</p><p>Package defect compensation: {money(instructions.compensation.packageDefectCompensation)}</p><p>{instructions.compensation.cancellationPolicy}</p><p>{instructions.compensation.budgetExhaustionPolicy}</p><p>Required profile: {instructions.environment.executionProfile} (unverified).</p></section> : null}
    {reservation ? <section aria-label="Package defect report"><h2>Package defect report</h2><p>A structured report is not a chat with the private AI. Owner handling and compensation remain separate.</p><form onSubmit={event => { event.preventDefault(); void perform(fileDefect); }}><label htmlFor="portal-defect-category">Package problem category</label><select id="portal-defect-category" value={category} onChange={event => setCategory(event.target.value)}>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select><label>Describe the package problem <textarea minLength={12} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} /></label><button disabled={busy || !live || !session?.csrf || description.length < 12}>File defect report</button></form>{reports.length ? <p>Defect report recorded</p> : null}<ul>{reports.map(report => <li key={report.id}>{report.category}: {report.description}</li>)}</ul></section> : null}
    <p>Patch submission, evaluation, acceptance and settlement are not enabled by this component. It has no private repository or model access.</p>
  </main>;
}
