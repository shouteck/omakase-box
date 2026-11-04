'use client';
// The payment window (PF31): one place an owner pays a solver, opened from the bounty page or Your page, at the bounty's
// own address with #pay. The amount and whom first (Apple's payment sheet), then the ways this person can be paid, one
// click before by hand. Only by hand has "I've paid": a provider's payment is recorded by the provider's word. Closing
// records nothing. It reads and calls the same routes the bounty page always used; it decides nothing itself.
import { useEffect, useRef, useState } from 'react';
import { LABELS } from './Methods.jsx';

/** One way to be paid by hand, as approved: its name, then the address short and whole (no scheme), opening outside. */
function WayRow({ method }) {
  const name = method.chain ? `${LABELS[method.kind]} (${method.chain})` : LABELS[method.kind];
  return (
    <li data-way className="flex flex-wrap justify-between gap-x-3 gap-y-1">
      <span>{name}</span>
      {method.link
        ? <a href={method.value} rel="nofollow noopener noreferrer" target="_blank" className="break-words" style={{ textDecoration: 'none' }}>{method.value.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')} ↗</a>
        : <span className="break-all">{method.value}</span>}
    </li>
  );
}
import { fmtDate } from './ui.jsx';

const Big = ({ amount, line }) => (
  <div className="text-center pt-1.5">
    <p className="text-[2.5rem] leading-[2.875rem] font-medium tracking-[-0.03em] tabular-nums">${amount}</p>
    <p className="text-soft">{line}</p>
  </div>
);
const Way = ({ label, children }) => (
  <div className="border border-line rounded-2xl p-4 flex flex-col gap-3">
    <p className="text-sm font-medium text-soft uppercase tracking-[0.06em]">{label}</p>
    {children}
  </div>
);
const Wide = ({ quiet = false, onClick, children, disabled = false }) => (
  <button type="button" onClick={onClick} disabled={disabled} data-window-action
    className={`w-full rounded-full px-5 py-2.5 font-medium disabled:opacity-60 ${quiet ? 'bg-card text-ink border border-line' : 'bg-button text-button-ink'}`}>{children}</button>
);
const Done = ({ title, children }) => (
  <div className="text-center flex flex-col items-center gap-1.5 py-2.5" role="status">
    <span aria-hidden="true" className="size-11 rounded-full flex items-center justify-center text-xl" style={{ background: 'var(--color-ok-bg)', color: 'var(--color-ok)' }}>✓</span>
    <p className="text-[1.5rem] leading-[1.875rem] font-medium">{title}</p>
    <p className="text-soft">{children}</p>
  </div>
);

/** What the window shows, from the payment answer and the person chosen: one state, never a pile of flags. */
export function windowState(view, chosen) {
  if (view === null) return { kind: 'reading' };
  if (view.role !== 'owner' || view.payment.owed === null) return { kind: 'nothing' };
  if (view.recorded !== null) return { kind: 'done' };
  const payee = view.payee ?? chosen;
  if (payee === null || payee === undefined) return { kind: 'choose' };
  const person = view.payees.find(entry => entry.login === payee);
  return { kind: 'pay', person: person ?? { login: payee, methods: [], next: null } };
}

export default function PayWindow({ id, open, onClose, onChange }) {
  const ref = useRef(null);
  const [view, setView] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setError(null);
    fetch(`/api/b/${encodeURIComponent(id)}/payment`).then(response => response.ok ? response.json() : null).then(setView).catch(() => setError('The board could not be reached. Nothing changed. Next: try again.'));
  }, [open, id]);

  const recordPaid = async to => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/b/${encodeURIComponent(id)}/paid`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to }) });
      const answer = await response.json();
      if (response.ok) { setView(answer); onChange?.(answer); } else setError(answer.error);
    } catch {
      setError('The board could not be reached. Nothing was recorded. Next: try again.');
    } finally { setBusy(false); }
  };
  const toProvider = async path => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/b/${encodeURIComponent(id)}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const body = await response.json();
      if (!response.ok) setError(body.error);
      else if (body.url) window.location.href = body.url;
      else window.location.reload();
    } catch {
      setError('The board could not be reached. Nothing was charged. Next: try again.');
    } finally { setBusy(false); }
  };

  const state = windowState(view, chosen);
  const owed = view?.payment.owed;
  const recorded = view?.payment.recorded_paid;
  const title = state.kind === 'choose' ? 'Whom are you paying?' : state.kind === 'pay' ? `Pay ${state.person.login}` : state.kind === 'done' && recorded ? `Pay ${recorded.chosen_by_owner_from ? view.payee : owed?.to ?? view.payee}` : 'Pay';
  const close = () => { setChosen(null); setPicked(null); onClose(); };

  let body = null;
  if (state.kind === 'reading') body = <p className="text-soft" aria-live="polite">Reading the board.</p>;
  else if (state.kind === 'nothing') body = <p>{view.payment.note ?? 'Nothing is owed on this bounty.'}</p>;
  else if (state.kind === 'done') {
    const provider = recorded.source === 'stripe' || recorded.source === 'paypal';
    body = provider
      ? <><Done title={`Paid $${recorded.amount ?? owed.amount} to ${view.payee}`}>{recorded.by} confirmed it. This bounty and your record show it now; {view.payee} sees it on their page.</Done><Wide quiet onClick={close}>Done</Wide></>
      : <><Done title={`Recorded: you paid ${view.payee} $${recorded.amount ?? owed.amount}`}>Your word, shown on this bounty since {fmtDate(recorded.at)}. {view.payee} can confirm it was received. Recorded by mistake? Withdraw it under Payment details.</Done><Wide quiet onClick={close}>Done</Wide></>;
  } else if (state.kind === 'choose') {
    body = (
      <>
        <Big amount={owed.amount} line="GitHub marks more than one solution merged. One is paid; you choose, the board does not." />
        <div role="radiogroup" aria-label="Whom you are paying" className="flex flex-col gap-2">
          {view.payees.map(payee => (
            <label key={payee.login} className={`flex items-start gap-2.5 border rounded-xl px-3.5 py-3 cursor-pointer ${picked === payee.login ? 'border-ink' : 'border-line'}`}>
              <input type="radio" name="payee" value={payee.login} checked={picked === payee.login} onChange={() => setPicked(payee.login)} className="mt-1.5" />
              <span><span className="block">{payee.login}</span><span className="block text-sm text-soft">Pull request #{payee.number}, merged</span></span>
            </label>
          ))}
        </div>
        <Wide disabled={picked === null} onClick={() => setChosen(picked)}>Continue</Wide>
        <p className="text-sm text-soft">Next you see every way this person can be paid.</p>
      </>
    );
  } else {
    const { person } = state;
    const oneClick = view.payee !== null && (view.can_pay || view.can_pay_paypal);
    const pullNumber = person.number ?? view.payees.find(entry => entry.login === person.login)?.number;
    body = (
      <>
        <Big amount={owed.amount} line={`to ${person.login}${pullNumber ? ` · pull request #${pullNumber}, merged ${fmtDate(owed.since)}` : ''}`} />
        {oneClick ? (
          <Way label="One click">
            {view.can_pay ? <Wide disabled={busy} onClick={() => toProvider('pay')}>Pay ${owed.amount} with Stripe</Wide> : null}
            {view.can_pay_paypal ? <Wide quiet={view.can_pay} disabled={busy} onClick={() => toProvider('pay-paypal')}>Pay ${owed.amount} with PayPal</Wide> : null}
            <p className="text-sm text-soft">On {view.can_pay && view.can_pay_paypal ? 'Stripe\'s or PayPal\'s' : view.can_pay ? 'Stripe\'s' : 'PayPal\'s'} own page, straight to {person.login}&apos;s account. The board holds nothing and records it when the provider confirms. The provider&apos;s fee comes out of the reward.</p>
          </Way>
        ) : null}
        {person.methods.length > 0 ? (
          <Way label={`By hand, ${person.methods.length === 1 ? 'a way' : 'ways'} ${person.login} listed`}>
            <ul className="flex flex-col gap-3">{person.methods.map((method, i) => <WayRow key={i} method={method} />)}</ul>
            <p className="text-sm text-soft">You pay outside the board, then tell it you did.</p>
          </Way>
        ) : null}
        {!oneClick && person.methods.length === 0 ? (
          <Way label="No way to pay yet">
            <p>{person.login} has not connected an account or listed a way to be paid.</p>
            {person.next ? <p className="text-sm text-soft">{person.next}</p> : null}
          </Way>
        ) : null}
        {person.methods.length > 0 ? (
          <>
            <Wide quiet={oneClick} disabled={busy} onClick={() => recordPaid(person.login)}>I&apos;ve paid ${owed.amount}{oneClick ? ' by hand' : ''}</Wide>
            <p className="text-sm text-soft -mt-2">Records your word that you paid {person.login}, and closes. ✕ closes without recording.</p>
          </>
        ) : null}
        {view.payee === null && chosen !== null ? <button type="button" className="text-sm text-left" style={{ color: 'var(--color-accent)' }} onClick={() => setChosen(null)}>← Choose someone else</button> : null}
      </>
    );
  }

  return (
    <dialog ref={ref} onClose={close} aria-label={title} data-pay-window className="m-0 sm:m-auto w-full max-w-none sm:max-w-[30rem] max-sm:h-full max-sm:max-h-none bg-card text-ink sm:rounded-2xl border border-line p-0 backdrop:bg-black/35">
      <div className="flex flex-col max-sm:h-full">
        <header className="flex justify-between items-center px-5 py-3.5 border-b border-line"><h2 className="font-medium">{title}</h2><button type="button" aria-label="Close" className="text-soft text-lg" onClick={close}>✕</button></header>
        <div className="px-5 py-5 flex flex-col gap-4 flex-1 overflow-auto">
          {body}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </div>
    </dialog>
  );
}
