import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalScreen } from '../../../../apps/contributor-portal/portal/portal-screen.js';
import { AssignmentsScreen } from '../../../../apps/private-console/assignments/assignments-screen.js';
import { currentSession, storedCsrf, type PrivateSession } from '../../../../apps/private-console/intake/private-client.js';

declare global {
  interface Window {
    __contributorApiBase__?: string;
    __assignmentsApiBase__?: string;
  }
}

const parameters = new URLSearchParams(window.location.search);
const api = parameters.get('api');
if (api !== null && /^http:\/\/(?:contributor|private)\.localhost:\d+$/.test(api)) {
  window.__contributorApiBase__ = api;
  window.__assignmentsApiBase__ = api;
}
const screen = parameters.get('screen') === 'assignments' ? 'assignments' : 'portal';

function Harness() {
  const [session, setSession] = useState<PrivateSession | null>(null);
  useEffect(() => {
    if (screen !== 'assignments') return;
    void (async () => {
      const existing = await currentSession();
      if (existing !== null) setSession({ ...existing, csrf: storedCsrf() });
    })();
  }, []);
  return screen === 'assignments' ? <AssignmentsScreen session={session} /> : <PortalScreen apiBase={api ?? 'http://contributor.localhost:4001'} />;
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing harness root element');
createRoot(rootElement).render(<Harness />);
