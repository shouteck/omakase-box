'use client';
// The prototype's only state: who is signed in (a sample account) and the
// clicks made here (record paid, confirm received). Both live in this
// browser's localStorage; nothing is sent anywhere.
import { useSyncExternalStore } from 'react';
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
export function recordPaid(id, amount) { writeOverlay(o => ({ ...o, [id]: { ...o[id], paid: { at: SAMPLE_NOW, amount, source: 'board' } } })); }
export function confirmReceipt(id, by, kind) { writeOverlay(o => ({ ...o, [id]: { ...o[id], receipt: { at: SAMPLE_NOW, by, kind } } })); }
export function undoClicks(id) { writeOverlay(o => { const n = { ...o }; delete n[id]; return n; }); }
export function resetPrototype() { window.localStorage.removeItem(KEYS.overlay); window.localStorage.removeItem(KEYS.session); emit(); }
