import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IntakeScreen } from '../../intake/intake-screen.js';
import { IntentsScreen } from '../../intents/intents-screen.js';
import { ReleaseScreen } from '../../releases/release-screen.js';
import { AssignmentsScreen } from '../../assignments/assignments-screen.js';
import { ReadinessPanel } from '../../readiness/readiness-panel.js';
import { ReviewPanel } from '../../review/review-panel.js';
import { PreparationScreen } from '../../boxes/preparation/preparation-screen.js';
import { currentSession, rememberCsrf, signIn, signOut, storedCsrf, type PrivateSession } from '../../intake/private-client.js';

function Console() {
  const [status, setStatus] = useState('Checking private service…');
  const [session, setSession] = useState<PrivateSession | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<'intake' | 'intents' | 'preparation' | 'releases' | 'assignments' | 'readiness' | 'review'>('intake');
  const [intentId, setIntentId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('http://private.localhost:4000/health', { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json() as { service?: string };
        setStatus(data.service === 'private-api' ? 'Private service reachable (tested).' : 'Unexpected service (unverified).');
      } catch { if (!controller.signal.aborted) setStatus('Private service unavailable (unverified).'); }
    })();
    void (async () => {
      const existing = await currentSession();
      if (existing !== null) setSession({ ...existing, csrf: storedCsrf() });
    })();
    return () => controller.abort();
  }, []);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    const result = await signIn(username, password);
    if (result.session !== null && result.csrf !== null) { rememberCsrf(result.csrf); setSession({ ...result.session, csrf: result.csrf }); setStatus('Signed in.'); }
    else { rememberCsrf(null); setSession(null); setStatus(`Sign-in failed: ${result.error ?? 'unknown error'}`); }
  }
  async function handleSignOut() {
    await signOut(session?.csrf ?? null);
    rememberCsrf(null); setSession(null); setPassword('');
  }

  return <main>
    <h1>Private task console</h1>
    <p role="status">{status}</p>
    {session === null
      ? <form onSubmit={event => { void handleSignIn(event); }} aria-label="Private console sign-in">
          <label htmlFor="console-username">Username</label>
          <input id="console-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" />
          <label htmlFor="console-password">Password</label>
          <input id="console-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
          <button type="submit">Sign in</button>
        </form>
      : <p>Signed in as {session.role} ({session.id.slice(0, 8)}…){session.csrf === null ? <strong> — sign in again to make changes.</strong> : null} <button type="button" onClick={() => { void handleSignOut(); }}>Sign out</button></p>}
    <nav aria-label="Console areas">
      <button type="button" onClick={() => setTab('intake')}>Outcome intake</button>
      <button type="button" onClick={() => setTab('intents')}>Intent review</button>
      <button type="button" onClick={() => setTab('preparation')}>Box preparation</button>
      <button type="button" onClick={() => setTab('releases')}>Release review</button>
      <button type="button" onClick={() => setTab('assignments')}>Customer assignments</button>
      <button type="button" onClick={() => setTab('readiness')}>Publication readiness</button>
      <button type="button" onClick={() => setTab('review')}>Owner review</button>
    </nav>
    {tab === 'intake'
      ? <IntakeScreen session={session} onOpenIntent={id => { setIntentId(id); setTab('intents'); }} />
      : tab === 'intents' ? <IntentsScreen session={session} intentId={intentId} onIntentId={setIntentId} />
      : tab === 'preparation' ? <PreparationScreen session={session} />
      : tab === 'releases' ? <ReleaseScreen key={session?.id ?? 'signed-out'} session={session} />
      : tab === 'assignments' ? <AssignmentsScreen session={session} publicationReady={session?.role === 'owner'} />
      : tab === 'readiness' ? <ReadinessPanel session={session} />
      : <ReviewPanel session={session} />}
    <p>No contributor or model code executes in this console; previews are trusted escaped text and screenshots remain private evidence.</p>
  </main>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<Console />);
