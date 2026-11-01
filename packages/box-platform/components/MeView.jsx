'use client';
// Your page. One form: pick a kind, paste, save. Nothing here is needed to answer
// a bounty; it is how an owner who owes you finds a way to pay you.
import { useEffect, useRef, useState } from 'react';
import { LABELS, MethodLine } from './Methods.jsx';
import PayOnMerge from './PayOnMerge.jsx';
import { fmtDate, Primary, Quiet, Section, Soft, Title } from './ui.jsx';

const EXAMPLES = { paypal: 'https://paypal.me/you', stripe: 'https://buy.stripe.com/…', 'github-sponsors': 'https://github.com/sponsors/you', 'wise-email': 'you@example.com', wallet: 'Your address' };
const DEFAULTS = { paypal: 'everyone', stripe: 'everyone', 'github-sponsors': 'everyone', 'wise-email': 'owner-only', wallet: 'owner-only' };
const CHOICES = { everyone: 'Everyone, on my profile', 'owner-only': 'Only an owner who owes me' };
const FIELD = 'block w-full max-w-prose border border-soft bg-surface px-3 py-2 rounded-xl';
const stored = ({ kind, value, chain, visibility }) => ({ kind, value, chain, visibility });

function Editor({ me, setMe }) {
  const [kind, setKind] = useState(me.paypal.set_up ? 'stripe' : 'paypal');
  const [visibility, setVisibility] = useState('everyone');
  const [value, setValue] = useState('');
  const [chain, setChain] = useState('');
  const [message, setMessage] = useState(null);
  const status = useRef(null);

  const send = async (methods, done) => {
    try {
      const response = await fetch('/api/me/methods', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ methods }) });
      const body = await response.json();
      if (response.ok) { setMe({ ...me, methods: body.methods }); setMessage(done); return true; }
      setMessage(body.error);
    } catch {
      setMessage('The board could not be reached. Nothing was saved. Next: try again.');
    }
    status.current?.focus();
    return false;
  };
  const add = async event => {
    event.preventDefault();
    const method = { kind, value: value.trim(), visibility, ...(kind === 'wallet' ? { chain: chain.trim() } : {}) };
    if (await send([...me.methods.map(stored), method], 'Saved.')) { setValue(''); setChain(''); }
  };

  return (
    <Section title="Ways you accept payment" id="methods">
      <p className="max-w-prose mb-4">You need one before you can be paid, not before you answer a bounty. List them once; every bounty uses them.</p>
      {me.methods.length > 0 ? (
        <ul className="flex flex-col gap-3 mb-8">
          {me.methods.map((method, i) => (
            <li key={i}>
              <MethodLine method={method} />
              <Soft>{method.value === me.sponsors_page ? 'From your GitHub' : 'You typed this'}. {method.link ? <><a href={method.value} target="_blank" rel="nofollow noopener noreferrer">Check the link</a>. </> : null}{CHOICES[method.visibility]}. <Quiet onClick={() => send(me.methods.filter((_, at) => at !== i).map(stored), 'Removed.')}>Remove</Quiet></Soft>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={add} className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2">Kind</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-prose">
            {/* Once connecting works, a pasted PayPal.me is no longer offered. Links already saved stay, listed above, until their owner removes them. */}
            {Object.entries(LABELS).filter(([name]) => name !== 'paypal' || !me.paypal.set_up).map(([name, label]) => (
              <label key={name} className={`flex items-center gap-2 border rounded-xl px-3 py-3 ${kind === name ? 'border-ink' : 'border-soft'}`}>
                <input type="radio" name="kind" value={name} checked={kind === name} onChange={() => { setKind(name); setVisibility(DEFAULTS[name]); setValue(name === 'github-sponsors' ? me.sponsors_page : ''); setMessage(null); }} /> {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1">
          <span>{kind === 'wallet' ? 'Address' : 'Paste it here'}</span>
          <input name="value" className={FIELD} value={value} onChange={event => setValue(event.target.value)} placeholder={EXAMPLES[kind]} required autoComplete="off" />
          {value !== '' && value === me.sponsors_page ? <Soft>From your GitHub. Check it exists before saving: <a href={value} target="_blank" rel="nofollow noopener noreferrer">open your Sponsors page</a>.</Soft> : null}
        </label>
        {kind === 'wallet' ? (
          <label className="flex flex-col gap-1">
            <span>Chain</span>
            <input name="chain" className={FIELD} value={chain} onChange={event => setChain(event.target.value)} placeholder="Ethereum" required autoComplete="off" />
          </label>
        ) : null}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1">Who sees it</legend>
          {Object.entries(CHOICES).map(([name, label]) => (
            <label key={name} className="flex gap-2 items-baseline"><input type="radio" name="visibility" value={name} checked={visibility === name} onChange={() => setVisibility(name)} /> {label}</label>
          ))}
        </fieldset>
        <Soft className="max-w-prose">&quot;Only an owner who owes me&quot; shows it to one person: the poster of a bounty, on that bounty&apos;s page, while your merged solution is unpaid, or while you say a recorded payment has not arrived. Never on your profile, a feed or the MCP server.</Soft>
        <div><button type="submit" data-primary className="bg-button px-5 py-2.5 font-medium rounded-full" style={{ color: 'var(--color-button-ink)' }}>Save</button></div>
        {message ? <p role="status" ref={status} tabIndex={-1} className="max-w-prose">{message}</p> : null}
      </form>
    </Section>
  );
}

const PAYPAL_BACK = {
  'try-again': 'PayPal\'s sign-in did not finish. Nothing was connected. Next: try again.',
  refused: 'PayPal did not give the board an account ID. Nothing was connected. Next: try again, or list another way to be paid below.',
  'not-set-up': 'PayPal is not set up on this board. Nothing was connected.'
};

/** Connecting PayPal: the login is on PayPal's own page, and the page says "connected", which is the fact. */
function ConnectPayPal({ paypal, setPayPal }) {
  const [message, setMessage] = useState(null);
  useEffect(() => {
    const back = new URLSearchParams(window.location.search).get('paypal');
    if (back) { setMessage(PAYPAL_BACK[back] ?? null); window.history.replaceState(null, '', '/me/#paypal'); }
  }, []);
  const disconnect = async () => {
    try {
      const response = await fetch('/api/me/paypal/disconnect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const body = await response.json();
      if (response.ok) { setPayPal(body.paypal); setMessage('Disconnected. An order an owner already opened to you can no longer be started again.'); } else setMessage(body.error);
    } catch {
      setMessage('The board could not be reached. Nothing changed. Next: try again.');
    }
  };
  return (
    <Section title="Get paid through PayPal" id="paypal">
      {!paypal.set_up
        ? <p className="max-w-prose text-soft">PayPal is not set up on this board yet. Solvers are paid by the other ways on this page.</p>
        : (
          <div className="flex flex-col gap-4 max-w-prose">
            <p>{paypal.connected ? 'Your PayPal account is connected. If your solution is the one merged, an owner can pay the reward to it with one click.' : 'Log in on PayPal\'s own page, and an owner can pay you there with one click.'}</p>
            <div>{paypal.connected ? <Quiet onClick={disconnect}>Disconnect PayPal</Quiet> : <Primary href="/auth/paypal">Connect PayPal</Primary>}</div>
            <Soft>The board keeps only your PayPal account ID; it does not ask PayPal for your email. PayPal&apos;s fee comes out of the reward, and depends on the countries involved: $2.74 of $45 in our test between two countries. A payer can dispute a payment after the merge, and PayPal can reverse it from your account. PayPal may not let accounts in every country receive payments; if yours cannot, list another way below.</Soft>
          </div>
        )}
      {message ? <p role="status" className="mt-4 max-w-prose">{message}</p> : null}
    </Section>
  );
}

/** One debt: how much, whom, since when, and the bounty's page. The title is the poster's words, as text. */
function Debt({ debt, line }) {
  return (
    <li className="border-t border-line py-4">
      <a href={`/b/${debt.id}/`} className="break-words">{debt.title}</a>
      <p className="mt-1">{line(debt)}, since {fmtDate(debt.since)}.</p>
    </li>
  );
}
const toWhom = debt => debt.to ?? `one of ${(debt.to_one_of ?? []).join(' or ')}; you decide whom`;

function Debts({ title, id, debts, line }) {
  return (
    <Section title={title} id={id}>
      {debts.length === 0
        ? <p className="text-soft">Nothing right now.</p>
        : <ul>{debts.map(debt => <Debt key={debt.id} debt={debt} line={line} />)}</ul>}
    </Section>
  );
}

export default function MeView() {
  const [me, setMe] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/me').then(response => response.json()).then(setMe).catch(() => setFailed(true));
  }, []);
  const signOut = async () => {
    await fetch('/auth/sign-out', { method: 'POST' });
    setMe({ signed_in: false });
  };
  if (failed) return <p className="max-w-prose">The board could not be reached. Next: reload this page.</p>;
  if (me === null) return <p className="text-sm text-soft" aria-live="polite">Reading the board.</p>;
  if (!me.signed_in) {
    return (
      <>
        <Title sub="Sign in with GitHub to list the ways you accept payment. You do not need this to answer a bounty.">Your page</Title>
        <Primary href="/auth/github">Sign in with GitHub</Primary>
        <p className="mt-6 text-sm text-soft"><a href="/privacy/">What the board stores</a></p>
      </>
    );
  }
  return (
    <>
      <Title sub={`Signed in as ${me.login}.`}>Your page</Title>
      <Debts title="You owe" id="you-owe" debts={me.you_owe} line={debt => `$${debt.amount} to ${toWhom(debt)}`} />
      <Debts title="Owed to you" id="owed-to-you" debts={me.owed_to_you} line={debt => (debt.to === null ? `$${debt.amount}, if the owner decides on you` : `$${debt.amount}`)} />
      <PayOnMerge pay={me.pay} setPay={pay => setMe(current => ({ ...current, pay }))} />
      <ConnectPayPal paypal={me.paypal} setPayPal={paypal => setMe(current => ({ ...current, paypal }))} />
      <Editor me={me} setMe={setMe} />
      <Section title="Your public pages" id="public">
        <ul className="flex flex-col gap-2">
          <li><a href={`/solver/${me.login}/`}>As a solver</a></li>
          <li><a href={`/owner/${me.login}/`}>As an owner</a></li>
        </ul>
      </Section>
      <div className="mt-12"><Quiet onClick={signOut}>Sign out</Quiet></div>
    </>
  );
}
