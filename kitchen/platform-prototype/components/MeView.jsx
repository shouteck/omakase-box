'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Title, Section, Primary, Quiet, Soft } from './ui.jsx';
import { Reward } from './Card.jsx';
import { useOverlay, useSession, signOut } from '../lib/client.js';
import { bounties, withOverlay, stateOf, payeeOf, people, METHOD_LABEL, daysBetween, fmtDate, plural } from '../lib/facts.mjs';

const SHAPES = {
  paypal: { hint: 'https://paypal.me/yourname', ok: v => /^https:\/\/(www\.)?paypal\.me\/[A-Za-z0-9_.-]+\/?$/.test(v), fix: 'paste a link that starts with https://paypal.me/' },
  stripe: { hint: 'https://buy.stripe.com/…', ok: v => /^https:\/\/(buy\.stripe\.com|donate\.stripe\.com)\/[A-Za-z0-9_-]+$/.test(v), fix: 'paste a Stripe payment link that starts with https://buy.stripe.com/' },
  sponsors: { hint: 'https://github.com/sponsors/yourname', ok: v => /^https:\/\/github\.com\/sponsors\/[A-Za-z0-9-]+\/?$/.test(v), fix: 'paste a link that starts with https://github.com/sponsors/' },
  wise: { hint: 'you@example.com', ok: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), fix: 'type the email address your Wise account uses' },
  wallet: { hint: '0x… and the chain', ok: v => /^[A-Za-z0-9]{20,100}$/.test(v), fix: 'paste the address only, letters and digits, and name its chain' },
};

function MethodsEditor({ login }) {
  const [list, setList] = useState(people[login]?.methods ?? []);
  const [kind, setKind] = useState('paypal');
  const [value, setValue] = useState('');
  const [chain, setChain] = useState('');
  const [visibility, setVisibility] = useState('everyone');
  const [msg, setMsg] = useState(null);
  const add = e => {
    e.preventDefault();
    const v = value.trim();
    if (/^javascript:/i.test(v) || !SHAPES[kind].ok(v)) { setMsg(`That is not a ${METHOD_LABEL[kind]}. Next: ${SHAPES[kind].fix}.`); return; }
    if (kind === 'wallet' && !chain.trim()) { setMsg('Name the chain for this address. Next: type it in "Chain", for example "Base (USDC)".'); return; }
    setList([...list, { kind, value: v, visibility, ...(kind === 'wallet' ? { chain: chain.trim() } : {}) }]);
    setValue(''); setChain(''); setMsg('Added. In the prototype it is kept only on this page.');
  };
  return (
    <>
      {list.length === 0 ? <p>None yet. You need one before you can be paid, not before you answer a bounty.</p> : (
        <ul className="flex flex-col gap-2">
          {list.map((m, i) => (
            <li key={i}>{METHOD_LABEL[m.kind]}{m.chain ? ` on ${m.chain}` : ''}: <span className="break-all">{m.value}</span> <Soft as="span">· shown to {m.visibility === 'everyone' ? 'everyone' : 'owners who owe you only'}</Soft> <Quiet onClick={() => setList(list.filter((_, j) => j !== i))}>Remove</Quiet></li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <label className="flex flex-col gap-1 text-sm text-soft">Method
          <select value={kind} onChange={e => { setKind(e.target.value); setMsg(null); }} className="border border-soft bg-paper text-ink text-base px-2 py-1.5 rounded-sm">
            {Object.keys(SHAPES).map(k => <option key={k} value={k}>{METHOD_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-soft">{kind === 'wise' ? 'Email' : kind === 'wallet' ? 'Address' : 'Link'}
          <input value={value} onChange={e => setValue(e.target.value)} placeholder={SHAPES[kind].hint} className="border border-soft bg-paper text-ink text-base px-3 py-1.5 rounded-sm placeholder:text-soft" />
        </label>
        {kind === 'wallet' ? (
          <label className="flex flex-col gap-1 text-sm text-soft">Chain
            <input value={chain} onChange={e => setChain(e.target.value)} placeholder="for example Base (USDC)" className="border border-soft bg-paper text-ink text-base px-3 py-1.5 rounded-sm placeholder:text-soft" />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm text-soft">Who sees it
          <select value={visibility} onChange={e => setVisibility(e.target.value)} className="border border-soft bg-paper text-ink text-base px-2 py-1.5 rounded-sm">
            <option value="everyone">Everyone, on my profile</option>
            <option value="owed-owners">Only an owner who owes me</option>
          </select>
        </label>
        <div className="sm:col-span-2 flex items-center gap-6">
          <button type="submit" className="border border-ink px-4 py-1.5 rounded-sm">Add method</button>
          {msg ? <p role="status" className="text-sm">{msg}</p> : null}
        </div>
      </form>
      <Soft className="mt-4">&ldquo;Everyone&rdquo; puts the method on your public solver page. &ldquo;Only an owner who owes me&rdquo; keeps it off every public page and feed; the owner of a bounty your solution was merged into still sees it there. The board checks only the shape of what you type. It never follows a link or moves money.</Soft>
    </>
  );
}

export default function MeView() {
  const overlay = useOverlay();
  const me = useSession();
  if (!me) return (
    <>
      <Title sub="Sign in to see what you owe as an owner, what you are owed as a solver, and the ways you accept payment.">Your page</Title>
      <Primary href="/sign-in/">Sign in with GitHub</Primary>
    </>
  );
  const all = bounties.map(b => withOverlay(b, overlay));
  const iOwe = all.filter(b => b.poster === me && b.reward > 0 && ['merged-owed', 'owner-decides'].includes(stateOf(b)));
  const waiting = all.filter(b => b.poster === me && ['paid-recorded', 'disputed'].includes(stateOf(b)));
  const owedMe = all.filter(b => payeeOf(b).login === me && b.reward > 0 && ['merged-owed', 'paid-recorded', 'disputed'].includes(stateOf(b)));
  const oldest = [...iOwe].sort((x, y) => Date.parse(payeeOf(x).mergedAt) - Date.parse(payeeOf(y).mergedAt))[0];
  const confirmFirst = owedMe.find(b => stateOf(b) === 'paid-recorded');
  return (
    <>
      <Title sub={`Signed in as ${me} (a sample account).`}>Your page</Title>

      <Section title={`You owe${iOwe.length ? ` (${iOwe.length})` : ''}`} id="owe">
        {iOwe.length === 0 ? <p>Nothing. No merged bounty of yours is waiting for a payment record.</p> : (
          <>
            <ul>
              {iOwe.map(b => {
                const p = payeeOf(b);
                return (
                  <li key={b.id} className="border-t border-line py-4">
                    <div className="flex items-baseline justify-between gap-6"><Link href={`/b/${b.id}/#payment`}>{b.title}</Link><Reward amount={b.reward} /></div>
                    <p className="text-sm text-soft mt-1">{p.kind === 'one' ? `to ${p.login}` : 'more than one pull request merged: you decide whom to pay'} · merged {fmtDate(p.mergedAt)}, {plural(daysBetween(p.mergedAt), 'day')} ago</p>
                  </li>
                );
              })}
            </ul>
            {oldest ? <div className="mt-6"><Primary href={`/b/${oldest.id}/#payment`}>{payeeOf(oldest).kind === 'one' ? `See how to pay ${payeeOf(oldest).login}` : 'See the oldest'}</Primary></div> : null}
          </>
        )}
      </Section>

      {waiting.length ? (
        <Section title="Recorded paid, not yet confirmed by the solver" id="waiting">
          <ul>{waiting.map(b => <li key={b.id} className="border-t border-line py-4"><Link href={`/b/${b.id}/#payment`}>{b.title}</Link><p className="text-sm text-soft mt-1">to {payeeOf(b).login} · {stateOf(b) === 'disputed' ? 'the solver says not received' : 'no word from the solver yet'}</p></li>)}</ul>
        </Section>
      ) : null}

      <Section title={`Owed to you${owedMe.length ? ` (${owedMe.length})` : ''}`} id="owed">
        {owedMe.length === 0 ? <p>Nothing. When a solution of yours is merged on a rewarded bounty, it appears here.</p> : (
          <>
            <ul>{owedMe.map(b => <li key={b.id} className="border-t border-line py-4"><div className="flex items-baseline justify-between gap-6"><Link href={`/b/${b.id}/#payment`}>{b.title}</Link><Reward amount={b.reward} /></div><p className="text-sm text-soft mt-1">from {b.poster} · {stateOf(b) === 'merged-owed' ? `not recorded paid yet, merged ${plural(daysBetween(payeeOf(b).mergedAt), 'day')} ago` : stateOf(b) === 'disputed' ? 'you said it has not arrived' : 'the owner says they paid: confirm if it arrived'}</p></li>)}</ul>
            {confirmFirst && !iOwe.length ? <div className="mt-6"><Primary href={`/b/${confirmFirst.id}/#payment`}>Confirm a payment</Primary></div> : null}
          </>
        )}
      </Section>

      <Section title="Ways you accept payment" id="methods">
        <MethodsEditor login={me} />
      </Section>

      <Section title="What others see" id="public">
        <ul className="flex flex-col gap-2">
          <li><Link href={`/owner/${me}/`}>Your page as an owner</Link>: what solvers see about you</li>
          <li><Link href={`/solver/${me}/`}>Your page as a solver</Link>: what owners see about you</li>
        </ul>
        <p className="mt-6"><Quiet onClick={signOut}>Sign out</Quiet></p>
      </Section>
    </>
  );
}
