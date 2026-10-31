'use client';
// The part of a bounty page that depends on who is looking. It comes from the
// server's answer for this visitor; the page shell holds none of it.
import { useEffect, useState } from 'react';
import { MethodList } from './Methods.jsx';
import { Quiet, Soft, fmtDate } from './ui.jsx';

const WORDS = { received: 'received', 'not-received': 'has not arrived' };

export default function PaymentPanel({ id }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    (async () => {
      const response = await fetch(`/api/b/${encodeURIComponent(id)}/payment`);
      if (response.ok) setView(await response.json());
    })().catch(() => setError('The board could not be reached. Next: reload this page.'));
  }, [id]);

  const answer = async says => {
    setError(null);
    try {
      const response = await fetch(`/api/b/${encodeURIComponent(id)}/receipt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ says }) });
      const body = await response.json();
      if (response.ok) setView(body); else setError(body.error);
    } catch {
      setError('The board could not be reached. Nothing changed. Next: try again.');
    }
  };

  if (view === null) return error ? <p role="alert" className="mt-4 max-w-prose">{error}</p> : null;
  return (
    <div className="mt-6 flex flex-col gap-6 max-w-prose">
      {view.payees.length > 0 && view.role === 'owner' ? <p>{view.recorded ? 'For reference, the methods they listed.' : 'Pay the author directly, by a method they listed.'}</p> : null}
      {view.payees.map(payee => (
        <div key={payee.login}>
          <p className="mb-2 font-semibold"><a href={`/solver/${payee.login}/`}>{payee.login}</a></p>
          <MethodList methods={payee.methods} empty={payee.next} />
        </div>
      ))}
      {view.owner_only_hidden ? <Soft>A payment is recorded, so any method {view.payee} shows only to an owner who owes them is no longer shown.</Soft> : null}
      {view.recorded ? <p>Recorded paid on {fmtDate(view.recorded.at)}{view.recorded.amount === null ? '' : ` ($${view.recorded.amount})`}. The owner&apos;s word. Recording moves no money.</p> : null}
      {view.receipt ? <p role="status">{view.payee} says the payment {WORDS[view.receipt.says]}, as of {fmtDate(view.receipt.at)}. The solver&apos;s word; the board does not decide between them.</p> : null}
      {view.can_answer ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {view.receipt?.says === 'received' ? null : <Quiet onClick={() => answer('received')}>I received it</Quiet>}
          {view.receipt?.says === 'not-received' ? null : <Quiet onClick={() => answer('not-received')}>It has not arrived</Quiet>}
          {view.receipt ? <Quiet onClick={() => answer(null)}>Withdraw my answer</Quiet> : null}
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
