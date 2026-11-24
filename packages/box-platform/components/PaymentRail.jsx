'use client';
import { useState } from 'react';
import { Button } from './ui.jsx';

export default function PaymentRail({ choice, onChange }) {
  const [rail, setRail] = useState(null);
  const [fallback, setFallback] = useState(null);
  const [message, setMessage] = useState(null);
  if (choice?.saved_rails.length !== 2) return null;
  const save = async event => {
    event.preventDefault();
    try {
      const response = await fetch('/api/me/payment-rail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rail: rail ?? choice.account_rail, fallback: fallback ?? choice.fallback }) });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error); return; }
      onChange(body.pay);
      setMessage('Default payment rail saved.');
      if (body.next) window.location.href = body.next;
    } catch { setMessage('The board could not be reached. Next: try again.'); }
  };
  return <form onSubmit={save} className="mt-5 border border-line rounded-2xl p-5" id="payment-rail">
    <fieldset><legend className="font-medium">Which one is the default for pay on merge?</legend>
      <p className="mt-2 text-sm text-soft">{choice.needs_choice ? 'Both methods are saved. Payments without a via override wait until you choose.' : 'This default applies to eligible automatic and agent-requested payments.'} A via stripe or via paypal comment overrides this choice and never falls back.</p>
      {choice.saved_rails.map(value => <label key={value} className="block mt-3"><input type="radio" name="payment-rail" value={value} required checked={(rail ?? choice.account_rail) === value} onChange={() => setRail(value)} /> {value === 'stripe' ? 'Stripe card' : 'PayPal'}</label>)}
      <label className="block mt-3"><input type="checkbox" checked={fallback ?? choice.fallback} onChange={event => setFallback(event.target.checked)} /> Use the other if the solver can’t receive on this one</label>
    </fieldset>
    <Button type="submit" className="mt-4">Save default payment rail</Button>
    {message ? <p role="status" className="mt-3">{message}</p> : null}
  </form>;
}
