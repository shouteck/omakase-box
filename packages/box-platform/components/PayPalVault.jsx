'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui.jsx';
import Dialog from './Dialog.jsx';

export default function PayPalVault({ onChange }) {
  const [state, setState] = useState(null);
  const [limit, setLimit] = useState('');
  const [message, setMessage] = useState(null);
  const [token, setToken] = useState(null);
  const [removing, setRemoving] = useState(false);
  const read = async () => {
    try {
      const response = await fetch('/api/me/paypal/vault');
      if (!response.ok) return;
      const body = await response.json();
      setState(body);
      if (body.pay) onChange?.(body.pay);
      if (body.saved) setLimit(String(body.saved.limit_per_bounty));
    } catch { setMessage('The board could not be reached. Next: try again.'); }
  };
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setToken(q.get('approval_token') ?? q.get('setup_token') ?? q.get('token'));
    read();
  }, []);
  const send = async (suffix, body = {}) => {
    try {
      const response = await fetch(`/api/me/paypal/vault${suffix}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const answer = await response.json();
      if (!response.ok) { setMessage(answer.error); return false; }
      if (answer.url) { window.location.href = answer.url; return; }
      if (answer.saved) { setToken(null); window.location.href = '/setup/finish/'; return; }
      setMessage(answer.removed ? 'Saved PayPal removed. No new automatic PayPal charges can start.' : answer.updated ? 'PayPal limit saved.' : 'PayPal saved. An approval comment or repository switch is still required.');
      await read();
      return true;
    } catch { setMessage('The board could not be reached. Next: try again.'); }
  };
  if (!state?.set_up) return null;
  return <section className="mt-6 border border-line rounded-2xl p-5" id="paypal-vault">
    <h3 className="font-medium">Pay on merge with saved PayPal</h3>
    <p className="mt-2 text-sm text-soft">{state.saved ? `${state.saved.label} · maximum $${state.saved.limit_per_bounty} per bounty.` : 'Save PayPal once on its own page, then set a maximum reward here. Agents can authorize an import with its exact “on merge” approval comment.'} Stripe is preferred when both payment rails work. Checkout and by-hand payment remain available.</p>
    {token ? <form className="mt-3 flex gap-3 items-end" onSubmit={event => { event.preventDefault(); send('/saved', { setup_token: token, limit: Number(limit) }); }}>
      <label>Maximum USD per bounty<input type="number" min="1" max="100000" required value={limit} onChange={event => setLimit(event.target.value)} className="block border border-line rounded-xl px-3 py-2" /></label>
      <Button type="submit">Save PayPal and limit</Button>
    </form> : <div className="mt-3 flex gap-3"><Button onClick={() => send('')}>{state.saved ? 'Replace saved PayPal' : 'Save PayPal'}</Button>{state.saved ? <Button danger onClick={() => setRemoving(true)}>Remove saved PayPal</Button> : null}</div>}
    {state.saved && !token ? <form className="mt-4 flex flex-wrap gap-3 items-end" onSubmit={event => { event.preventDefault(); send('/limit', { limit: Number(limit) }); }}>
      <label>PayPal maximum USD per bounty<input type="number" min="1" max="100000" required value={limit} onChange={event => setLimit(event.target.value)} className="block border border-line rounded-xl px-3 py-2" /></label>
      <Button type="submit">Save PayPal limit</Button>
    </form> : null}
    <Dialog open={removing} onClose={() => setRemoving(false)} title="Remove saved PayPal?" danger submit="Remove PayPal" onSubmit={async event => { event.preventDefault(); if (await send('/remove')) setRemoving(false); }}>
      <p>No new automatic PayPal charges can start. A saved Stripe card can still pay eligible bounties; otherwise repository switches turn off. Already-authorized payments may finish, and payments already made do not change.</p>
    </Dialog>
    {message ? <p role="status" className="mt-3">{message}</p> : null}
  </section>;
}
