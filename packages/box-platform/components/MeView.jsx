'use client';
// Your page. One form: pick a kind, paste, save. Nothing here is needed to answer
// a bounty; it is how an owner who owes you finds a way to pay you.
import { useEffect, useRef, useState } from 'react';
import { LABELS, MethodLine } from './Methods.jsx';
import { Primary, Quiet, Section, Soft, Title } from './ui.jsx';

const EXAMPLES = { paypal: 'https://paypal.me/you', stripe: 'https://buy.stripe.com/…', 'github-sponsors': 'https://github.com/sponsors/you', 'wise-email': 'you@example.com', wallet: 'Your address' };
const DEFAULTS = { paypal: 'everyone', stripe: 'everyone', 'github-sponsors': 'everyone', 'wise-email': 'owner-only', wallet: 'owner-only' };
const CHOICES = { everyone: 'Everyone, on my profile', 'owner-only': 'Only an owner who owes me' };
const FIELD = 'block w-full max-w-prose border border-line bg-paper px-3 py-2 rounded-sm';
const stored = ({ kind, value, chain, visibility }) => ({ kind, value, chain, visibility });

function Editor({ me, setMe }) {
  const [kind, setKind] = useState('paypal');
  const [visibility, setVisibility] = useState(DEFAULTS.paypal);
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
              <Soft>{CHOICES[method.visibility]}. <Quiet onClick={() => send(me.methods.filter((_, at) => at !== i).map(stored), 'Removed.')}>Remove</Quiet></Soft>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={add} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span>Kind</span>
          <select name="kind" className={FIELD} value={kind} onChange={event => { setKind(event.target.value); setVisibility(DEFAULTS[event.target.value]); setMessage(null); }}>
            {Object.entries(LABELS).map(([name, label]) => <option key={name} value={name}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{kind === 'wallet' ? 'Address' : 'Paste it here'}</span>
          <input name="value" className={FIELD} value={value} onChange={event => setValue(event.target.value)} placeholder={EXAMPLES[kind]} required autoComplete="off" />
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
        <div><button type="submit" data-primary className="bg-accent px-5 py-2.5 font-semibold rounded-sm" style={{ color: 'var(--color-paper)' }}>Save</button></div>
        {message ? <p role="status" ref={status} tabIndex={-1} className="max-w-prose">{message}</p> : null}
      </form>
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
