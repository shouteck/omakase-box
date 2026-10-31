'use client';
// A bounty's payment facts, each with whose word it is, and what this visitor may do
// about them. It comes from the server's answer for this visitor; the page shell holds none of it.
import { useEffect, useState } from 'react';
import { MethodList } from './Methods.jsx';
import { Quiet, Soft, fmtDate } from './ui.jsx';

/** The page's one primary action, when this visitor has one. */
const Act = ({ children, onClick }) => <button type="button" data-primary onClick={onClick} className="bg-accent text-paper px-5 py-2.5 font-semibold rounded-sm">{children}</button>;

const days = (since, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(since)) / 86400000));

function Facts({ view }) {
  const { payment: p } = view;
  if (p.owed === null) return <p>{p.note}</p>;
  const { owed, recorded_paid: recorded, solver_says: says } = p;
  const age = days(owed.since);
  const whom = owed.to ?? owed.to_one_of.join(' or ');
  return (
    <>
      {p.state === 'owner-decides'
        ? <p>Owed by {view.poster}: ${owed.amount}, to one of {whom}, since {fmtDate(owed.since)}. Source: GitHub records {owed.fact}. It counts as owed in {view.poster}&apos;s record until they record whom they paid.</p>
        : recorded === null
          ? <p>Owed to {owed.to}: ${owed.amount}, since {fmtDate(owed.since)} ({age === 1 ? '1 day' : `${age} days`}). Source: GitHub records {owed.fact}.</p>
          : <p>Earned by {owed.to}: ${owed.amount}, for the merge on {fmtDate(owed.since)}. Source: GitHub records {owed.fact}.</p>}
      {recorded === null
        ? <p>Not recorded paid by {view.poster}. Not confirmed received by {owed.to ?? 'a solver'}.</p>
        : <p>Recorded paid by {recorded.by} on {fmtDate(recorded.at)}{recorded.amount === null ? '' : ` ($${recorded.amount})`}. The owner&apos;s word, {recorded.source === 'board' ? 'from their click on the board' : 'from the project\'s record on GitHub'}. Recording moves no money.</p>}
      {recorded?.chosen_by_owner_from ? <p>{recorded.by} named {owed.to} when recording the payment. The owner&apos;s word.</p> : null}
      {says?.word === 'received' ? <p role="status">{says.by} says it was received, as of {fmtDate(says.at)}. The solver&apos;s word.</p> : null}
      {says?.word === 'not-received' ? <p role="status">{says.by} says it has not been received, as of {fmtDate(says.at)}. The solver&apos;s word. The owner and the solver disagree. Both words are shown as theirs; the board does not decide between them.</p> : null}
      {recorded !== null && says === null ? <p>Not confirmed received by {owed.to}.</p> : null}
      {p.excluded_from_counts ? <Soft>Not counted in either record: {p.excluded_from_counts.because} ({p.excluded_from_counts.solver}).</Soft> : null}
    </>
  );
}

export default function PaymentPanel({ id, poster }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    (async () => {
      const response = await fetch(`/api/b/${encodeURIComponent(id)}/payment`);
      if (response.ok) setView(await response.json());
    })().catch(() => setError('The board could not be reached. Next: reload this page.'));
  }, [id]);

  const post = async (path, body) => {
    setError(null);
    try {
      const response = await fetch(`/api/b/${encodeURIComponent(id)}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const answer = await response.json();
      if (response.ok) setView(answer); else setError(answer.error);
    } catch {
      setError('The board could not be reached. Nothing changed. Next: try again.');
    }
  };
  const answer = says => post('receipt', { says });

  if (view === null) return error ? <p role="alert" className="max-w-prose">{error}</p> : null;
  const owed = view.payment.owed;
  const says = view.receipt?.says;
  return (
    <div className="flex flex-col gap-4 max-w-prose">
      <Facts view={{ ...view, poster }} />
      {view.payees.length > 0 && view.role === 'owner' ? <p>{view.recorded ? 'For reference, the methods they listed.' : 'Pay the author directly, by a method they listed.'}</p> : null}
      {view.payees.map(payee => (
        <div key={payee.login}>
          <p className="mb-2 font-semibold"><a href={`/solver/${payee.login}/`}>{payee.login}</a></p>
          <MethodList methods={payee.methods} empty={payee.next} />
        </div>
      ))}
      {view.owner_only_hidden ? <Soft>A payment is recorded, so any method {view.payee} shows only to an owner who owes them is no longer shown.</Soft> : null}
      {view.can_record ? (
        <div className="flex flex-col gap-2">
          {view.payee === null ? <p>Whom did you pay?</p> : null}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {view.payees.map(payee => {
              const Action = view.payees.length === 1 ? Act : Quiet;
              return <Action key={payee.login} onClick={() => post('paid', { to: payee.login })}>Record ${owed.amount} paid to {payee.login}</Action>;
            })}
          </div>
          <Soft>Same as running <code>box bounty config set paid {id}</code>. Recording moves no money.</Soft>
        </div>
      ) : null}
      {view.can_withdraw ? <div className="flex flex-wrap gap-x-6 gap-y-2"><a href={`/owner/${poster}/`}>See what solvers see about you</a><Quiet onClick={() => post('paid', { withdraw: true })}>Withdraw this record</Quiet></div> : null}
      {view.can_answer ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {says === 'received' ? null : <Act onClick={() => answer('received')}>Confirm I received {view.recorded?.amount == null ? 'it' : `$${view.recorded.amount}`}</Act>}
          {says === 'not-received' ? null : <Quiet onClick={() => answer('not-received')}>It has not arrived</Quiet>}
          {view.receipt ? <Quiet onClick={() => answer(null)}>Withdraw my answer</Quiet> : null}
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
