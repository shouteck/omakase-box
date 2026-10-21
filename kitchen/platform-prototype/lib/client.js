'use client';
// The prototype's only state: who is signed in (a sample account) and the
// clicks made here (record paid, confirm received). Both live in this
// browser's localStorage; nothing is sent anywhere.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { SAMPLE_NOW } from './facts.mjs';

const KEYS = { session: 'obb-prototype-session', overlay: 'obb-prototype-overlay' };
const listeners = new Set();
const emit = () => listeners.forEach(l => l());
const subscribe = l => { listeners.add(l); window.addEventListener('storage', l); return () => { listeners.delete(l); window.removeEventListener('storage', l); }; };
const read = k => { try { return window.localStorage.getItem(k); } catch { return null; } };

export function useSession() {
  return useSyncExternalStore(subscribe, () => read(KEYS.session), () => null);
}
export function signIn(login) { window.localStorage.setItem(KEYS.session, login); emit(); }
export function signOut() { window.localStorage.removeItem(KEYS.session); emit(); }

let cacheRaw = null; let cacheVal = {};
export function useOverlay() {
  const raw = useSyncExternalStore(subscribe, () => read(KEYS.overlay), () => null);
  if (raw !== cacheRaw) { cacheRaw = raw; try { cacheVal = raw ? JSON.parse(raw) : {}; } catch { cacheVal = {}; } }
  return cacheVal;
}
function writeOverlay(fn) {
  let cur = {}; try { cur = JSON.parse(read(KEYS.overlay) || '{}'); } catch { cur = {}; }
  window.localStorage.setItem(KEYS.overlay, JSON.stringify(fn(cur))); emit();
}
// The prototype's "now" is the sample's fixed date, so every age stays stable.
export function recordPaid(id, amount, to) { writeOverlay(o => ({ ...o, [id]: { ...o[id], paid: { at: SAMPLE_NOW, amount, source: 'board', ...(to ? { to } : {}) } } })); }
export function confirmReceipt(id, by, kind) { writeOverlay(o => ({ ...o, [id]: { ...o[id], receipt: { at: SAMPLE_NOW, by, kind } } })); }
export function undoClicks(id) { writeOverlay(o => { const n = { ...o }; delete n[id]; return n; }); }
export function resetPrototype() { window.localStorage.removeItem(KEYS.overlay); window.localStorage.removeItem(KEYS.session); emit(); }

// Owner-only payment methods are never in the static files. When the rule
// allows this viewer (facts.mjs mayseeOwnerOnly), the page asks the
// prototype's server (scripts/serve.mjs), standing in for the board's server.
export function useOwnerOnly(solver, viewer, bountyId, allowed) {
  const [answer, setAnswer] = useState({ state: 'none' });
  useEffect(() => {
    if (!allowed) { setAnswer({ state: 'none' }); return undefined; }
    let live = true;
    setAnswer({ state: 'loading' });
    const q = new URLSearchParams({ solver, viewer, bounty: bountyId ?? '' });
    fetch(`/prototype-server/methods?${q}`).then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (live) setAnswer(ok ? { state: 'shown', methods: j.methods } : { state: 'error', error: j.error }); })
      .catch(() => { if (live) setAnswer({ state: 'error', error: 'The prototype server did not answer. Next: start the prototype with its serve command and reload.' }); });
    return () => { live = false; };
  }, [solver, viewer, bountyId, allowed]);
  return answer;
}
