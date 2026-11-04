'use client';
// A bounty's reward and payment, at the top of the page's summary card (PF31). One block: the reward and where the
// payment stands, in one line with whose word it is. When this visitor has something to do, the block is the action
// itself: the owner's Pay tile (it opens the payment window), the solver's "Confirm I received". Every longer fact the
// page stated before stays, under "Payment details and terms". It comes from the server's answer for this visitor.
import { useEffect, useState } from 'react';
import PayWindow from './PayWindow.jsx';
import { MethodList } from './Methods.jsx';
import { Quiet, Soft, fmtDate } from './ui.jsx';

const days = (since, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(since)) / 86400000));

/** The full sentences, each with whose word it is: the page's record, folded under Payment details. */
function Facts({ view, poster }) {
  const { payment: p } = view;
  if (p.owed === null) return <p>{p.note}</p>;
  const { owed, recorded_paid: recorded, solver_says: says } = p;
  const age = days(owed.since);
  const whom = owed.to ?? owed.to_one_of.join(' or ');
  return (
    <>
      <p>${owed.amount} for the merged solution, paid directly by the owner.{p.state === 'owner-decides' ? ' The terms pay one merged solution, so the owner decides whom to pay.' : ''}</p>
      {p.state === 'owner-decides'
        ? <p>Owed by {poster}: ${owed.amount}, to one of {whom}, since {fmtDate(owed.since)}. Source: GitHub records {owed.fact}. It counts as owed in {poster}&apos;s record until they record whom they paid.</p>
        : recorded === null
          ? <p>Owed to {owed.to}: ${owed.amount}, since {fmtDate(owed.since)} ({age === 1 ? '1 day' : `${age} days`}). Source: GitHub records {owed.fact}.</p>
          : <p>Earned by {owed.to}: ${owed.amount}, for the merge on {fmtDate(owed.since)}. Source: GitHub records {owed.fact}.</p>}
      {recorded === null
        ? <p>Not recorded paid by {poster}. Not confirmed received by {owed.to ?? 'a solver'}.</p>
        : recorded.source === 'stripe' || recorded.source === 'paypal'
          ? <p>Paid through {recorded.by} on {fmtDate(recorded.at)}{recorded.amount === null ? '' : ` ($${recorded.amount})`}. {recorded.whose_word} word.</p>
          : <p>Recorded paid by {recorded.by} on {fmtDate(recorded.at)}{recorded.amount === null ? '' : ` ($${recorded.amount})`}. The owner&apos;s word, {recorded.source === 'board' ? 'from their click on the board' : 'from the project\'s record on GitHub'}. Recording moves no money.</p>}
      {p.charge?.words ? <p>{p.charge.words}</p> : null}
      {recorded?.chosen_by_owner_from ? <p>{recorded.by} named {owed.to} when recording the payment. The owner&apos;s word.</p> : null}
      {says?.word === 'received' ? <p>{says.by} says it was received, as of {fmtDate(says.at)}. The solver&apos;s word.</p> : null}
      {says?.word === 'not-received' ? <p>{says.by} said it had not been received, as of {fmtDate(says.at)}. The solver&apos;s word; the board does not decide between them.</p> : null}
      {recorded !== null && says === null ? <p>Not confirmed received by {owed.to}.</p> : null}
      {p.excluded_from_counts ? <p>Not counted in either record: {p.excluded_from_counts.because} ({p.excluded_from_counts.solver}).</p> : null}
    </>
  );
}

/** Where the payment stands, as one line and whose word it is: the card's top. */
export function standing(view, amount, state) {
  const p = view?.payment;
  if (amount === 0) return { line: 'No reward', sub: 'Nothing is owed.' };
  if (!p || p.owed === null) return state === 'closed-none' ? { line: 'Closed without a merge', sub: 'Nothing is owed.' } : { line: 'Nothing owed yet', sub: 'Owed when a solution is merged.' };
  const { owed, recorded_paid: recorded, solver_says: says } = p;
  const confirmed = says?.word === 'received' ? `${says.by} confirmed it was received.` : `Not yet confirmed received by ${owed.to ?? 'the solver'}.`;
  const you = view.viewer !== null && recorded !== null && recorded.by === view.viewer;
  if (recorded === null) return p.state === 'owner-decides'
    ? { line: `Owed to one of ${owed.to_one_of.join(' or ')}`, sub: `Since ${fmtDate(owed.since)}. The owner chooses whom to pay.` }
    : { line: `Owed to ${owed.to} since ${fmtDate(owed.since)}`, sub: `GitHub records ${owed.fact}. Not yet recorded paid.` };
  if (recorded.source === 'stripe') return { line: view.on_merge ? `Paid on merge through Stripe, ${fmtDate(recorded.at)}` : `Paid through Stripe, ${fmtDate(recorded.at)}`, sub: `Stripe's word. ${confirmed}` };
  if (recorded.source === 'paypal') return { line: `Paid through PayPal, ${fmtDate(recorded.at)}`, sub: `PayPal's word. ${confirmed}` };
  if (view.role === 'payee') return { line: `${recorded.by} recorded paying you, ${fmtDate(recorded.at)}`, sub: `The owner's word. ${says?.word === 'received' ? 'You confirmed it was received.' : 'Not yet confirmed by you.'}` };
  return { line: `Recorded paid by ${you ? 'you' : recorded.by}, ${fmtDate(recorded.at)}`, sub: `${you ? 'Your' : 'The owner\'s'} word. ${confirmed}` };
}

export default function PaymentCard({ id, poster, amount, state, issue, children, terms }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(false);
  const load = () => fetch(`/api/b/${encodeURIComponent(id)}/payment`).then(async response => { if (response.ok) setView(await response.json()); });
  useEffect(() => {
    load().catch(() => setError('The board could not be reached. Next: reload this page.'));
    if (window.location.hash === '#pay') setPaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const toStripe = async path => {
    setError(null);
    try {
      const response = await fetch(`/api/b/${encodeURIComponent(id)}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const body = await response.json();
      if (!response.ok) setError(body.error);
      else if (body.url) window.location.href = body.url;
      else window.location.reload();
    } catch {
      setError('The board could not be reached. Nothing was charged. Next: try again.');
    }
  };
  const openWindow = () => { setPaying(true); if (window.location.hash !== '#pay') window.history.replaceState(null, '', '#pay'); };
  const closeWindow = () => { setPaying(false); if (window.location.hash === '#pay') window.history.replaceState(null, '', window.location.pathname + window.location.search); load(); };

  const owed = view?.payment.owed ?? null;
  const owes = view !== null && view.role === 'owner' && owed !== null && view.payment.recorded_paid === null && amount > 0;
  const { line, sub } = standing(view, amount, state);
  const confirm = view?.can_answer && view.receipt?.says !== 'received';

  return (
    <>
      <div data-payment className="mb-5">
        {owes ? (
          <button type="button" data-pay onClick={openWindow} className="w-full flex items-center justify-between gap-3 text-left rounded-[20px] px-5 py-4 bg-button text-button-ink">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm opacity-75">{owed.to ? `Owed to ${owed.to}` : `Reward · ${owed.to_one_of.length} merged`}</span>
              <span className="text-xl font-medium tracking-tight tabular-nums">${amount}</span>
              <span className="text-sm opacity-75">{owed.to ? `Since ${fmtDate(owed.since)} · not yet recorded paid` : 'You choose whom to pay'}</span>
            </span>
            <span className="font-medium whitespace-nowrap">Pay →</span>
          </button>
        ) : (
          <>
            <p className="text-sm text-soft">Reward</p>
            <p className={amount > 0 ? 'text-xl font-medium tracking-tight tabular-nums' : 'text-lg font-medium'}>{amount > 0 ? `$${amount}` : 'No reward'}</p>
            {amount > 0 ? <><p className="mt-2.5 font-medium" data-standing>{line}</p><p className="text-sm text-soft">{sub}</p></> : null}
          </>
        )}
        {view?.can_authenticate ? <button type="button" onClick={() => toStripe('authenticate')} className="mt-3 w-full rounded-full px-5 py-2.5 font-medium bg-button text-button-ink">Finish this payment on Stripe&apos;s page</button> : null}
        {confirm ? <button type="button" data-confirm onClick={() => post('receipt', { says: 'received' })} className="mt-3 w-full rounded-full px-5 py-2.5 font-medium bg-button text-button-ink">Confirm I received ${view.recorded?.amount ?? owed?.amount}</button> : null}
        <a href={issue} rel="nofollow noopener" data-issue className="mt-3 flex justify-center items-center gap-1.5 rounded-full px-5 py-2.5 font-medium border border-line bg-card" style={{ color: 'var(--color-ink)', textDecoration: 'none' }}>View the issue on GitHub ↗</a>
        {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : null}
      </div>
      {children}
      <details className="border-t border-line py-3 text-sm" data-payment-details>
        <summary className="text-soft">Payment details and terms</summary>
        <div className="mt-2 flex flex-col gap-2.5">
          {terms}
          {view !== null ? <Facts view={view} poster={poster} /> : null}
          {view?.pay_note ? <p>{view.pay_note}</p> : null}
          {owes && (view.can_pay || view.can_pay_paypal) ? <p>One click pays on {view.can_pay && view.can_pay_paypal ? 'Stripe\'s or PayPal\'s page' : view.can_pay ? 'Stripe\'s page' : 'PayPal\'s page'}, straight to {view.payee}&apos;s own account. The board holds nothing. The provider&apos;s fee comes out of the reward.</p> : null}
          {view !== null && view.payees.length > 0 && view.role === 'owner' ? <p>{view.recorded ? 'For reference, the methods they listed.' : 'Pay the author directly, by a method they listed.'}</p> : null}
          {view?.payees.map(payee => (
            <div key={payee.login}>
              <p className="mb-1 font-semibold"><a href={`/solver/${payee.login}/`}>{payee.login}</a></p>
              <MethodList methods={payee.methods} empty={payee.next} />
            </div>
          ))}
          {view?.owner_only_hidden ? <Soft>A payment is recorded, so any method {view.payee} shows only to an owner who owes them is no longer shown.</Soft> : null}
          {view?.can_record ? <Soft>Recording a payment is the same as running <code>box bounty config set paid {id}</code>. Recording moves no money.</Soft> : null}
          {view?.can_withdraw ? <div className="flex flex-wrap gap-x-6 gap-y-2"><a href={`/owner/${poster}/`}>See what solvers see about you</a><Quiet onClick={() => post('paid', { withdraw: true })}>Withdraw this record</Quiet></div> : null}
          {view?.can_answer && view.receipt ? <Quiet onClick={() => post('receipt', { says: null })}>Withdraw my answer</Quiet> : null}
        </div>
      </details>
      {view !== null && view.role === 'owner' ? <PayWindow id={id} open={paying} onClose={closeWindow} onChange={setView} /> : null}
    </>
  );
}
