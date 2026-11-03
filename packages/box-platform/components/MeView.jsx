'use client';
// Your page (PF19): one switch between the two roles a person can have here. As an owner: what you owe,
// and pay on merge. As a solver: what is owed to you, and the ways an owner can pay you. Nothing here is
// needed to answer a bounty; it is how money between the two finds its way.
import { useEffect, useRef, useState } from 'react';
import Bounties from './Bounties.jsx';
import Dialog from './Dialog.jsx';
import { LABELS } from './Methods.jsx';
import { PayOnMergeOwner, StripeRow } from './PayOnMerge.jsx';
import { StripeCountries } from './PayWays.jsx';
import { Badge, Button, Empty, fmtDate, Primary, Row, Rows, Table, Title } from './ui.jsx';

const EXAMPLES = { paypal: 'https://paypal.me/you', stripe: 'https://buy.stripe.com/…', 'github-sponsors': 'https://github.com/sponsors/you', 'wise-email': 'you@example.com', wallet: 'Your address' };
const DEFAULTS = { paypal: 'everyone', stripe: 'everyone', 'github-sponsors': 'everyone', 'wise-email': 'owner-only', wallet: 'owner-only' };
const CHOICES = { everyone: 'Everyone, on your profile', 'owner-only': 'Only an owner who owes you' };
const FIELD = 'block w-full border border-line bg-surface px-3 py-2 rounded-xl';
const stored = ({ kind, value, chain, visibility }) => ({ kind, value, chain, visibility });
const ROLE_KEY = 'board-role';
// The address can name a section: an older link, or a page coming back from Stripe or PayPal.
const OWNER_HASHES = ['#owner', '#pay', '#you-owe'];
const SOLVER_HASHES = ['#solver', '#stripe', '#paypal', '#methods', '#owed-to-you'];

/** The ways a solver lists, and adding one in a dialog: pick a kind, paste, choose who sees it. */
function Links({ me, setMe }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(me.paypal.set_up ? 'stripe' : 'paypal');
  const [visibility, setVisibility] = useState('everyone');
  const [value, setValue] = useState('');
  const [chain, setChain] = useState('');
  const [message, setMessage] = useState(null);
  const send = async (methods, done) => {
    try {
      const response = await fetch('/api/me/methods', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ methods }) });
      const body = await response.json();
      if (response.ok) { setMe({ ...me, methods: body.methods }); setMessage(done); return true; }
      setMessage(body.error);
    } catch {
      setMessage('The board could not be reached. Nothing was saved. Next: try again.');
    }
    return false;
  };
  const add = async event => {
    event.preventDefault();
    const method = { kind, value: value.trim(), visibility, ...(kind === 'wallet' ? { chain: chain.trim() } : {}) };
    if (await send([...me.methods.map(stored), method], 'Saved.')) { setValue(''); setChain(''); setOpen(false); }
  };
  const choose = name => { setKind(name); setVisibility(DEFAULTS[name]); setValue(name === 'github-sponsors' ? me.sponsors_page : ''); setMessage(null); };
  return (
    <>
      {me.methods.length === 0
        ? <Empty title="No links yet." why="An owner can pay you only by a way you list or connect." />
        : (
          <Rows>
            {me.methods.map((method, i) => (
              <Row key={i} icon="↗" title={method.chain ? `${LABELS[method.kind]} (${method.chain})` : LABELS[method.kind]}
                detail={<>{method.link ? <a href={method.value} target="_blank" rel="nofollow noopener noreferrer" className="break-all">{method.value}</a> : <span className="break-all">{method.value}</span>} · Seen by: {CHOICES[method.visibility].replace(', on your profile', '')}</>}
                actions={<Button onClick={() => send(me.methods.filter((_, at) => at !== i).map(stored), 'Removed.')}>Remove</Button>} />
            ))}
          </Rows>
        )}
      <div className="mt-3"><Button onClick={() => { setMessage(null); choose(kind); setOpen(true); }}>+ Add a way to be paid</Button></div>
      {message && !open ? <p role="status" className="mt-3">{message}</p> : null}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a way to be paid" onSubmit={add} submit="Add">
        <fieldset>
          <legend className="mb-2">Kind</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* Once connecting works, a pasted PayPal.me is no longer offered. Links already saved stay until their owner removes them. */}
            {Object.entries(LABELS).filter(([name]) => name !== 'paypal' || !me.paypal.set_up).map(([name, label]) => (
              <label key={name} className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 text-sm ${kind === name ? 'border-ink' : 'border-line'}`}>
                <input type="radio" name="kind" value={name} checked={kind === name} onChange={() => choose(name)} /> {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1">
          <span>{kind === 'wallet' ? 'Address' : 'Paste it here'}</span>
          <input name="value" className={FIELD} value={value} onChange={event => setValue(event.target.value)} placeholder={EXAMPLES[kind]} required autoComplete="off" />
          {value !== '' && value === me.sponsors_page ? <span className="text-sm text-soft">From your GitHub. Check it exists before saving: <a href={value} target="_blank" rel="nofollow noopener noreferrer">open your Sponsors page</a>.</span> : null}
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
        <p className="text-sm text-soft">&quot;Only an owner who owes you&quot; shows it to one person: the poster of a bounty, on that bounty&apos;s page, while your merged solution is unpaid, or while you say a recorded payment has not arrived. Never on your profile, a feed or the MCP server.</p>
        {message && open ? <p role="status">{message}</p> : null}
      </Dialog>
    </>
  );
}

const PAYPAL_BACK = {
  'try-again': 'PayPal\'s sign-in did not finish. Nothing was connected. Next: try again.',
  refused: 'PayPal did not give the board an account ID. Nothing was connected. Next: try again, or list another way to be paid.',
  'not-set-up': 'PayPal is not set up on this board. Nothing was connected.'
};

/** PayPal under One click: the login is on PayPal's own page, and the row says "connected", which is the fact. */
function PayPalRow({ paypal, setPayPal }) {
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
    <>
      <Row id="paypal" icon="P" tone="paypal" title="PayPal"
        detail={!paypal.set_up ? 'Not set up on this board yet.' : 'The board keeps only your PayPal account ID. PayPal\'s fee comes out of the reward, and PayPal can reverse a disputed payment from your account.'}
        actions={paypal.set_up ? (paypal.connected ? <><Badge tone="ok">Connected</Badge><Button onClick={disconnect}>Disconnect</Button></> : <><Badge>Not connected</Badge><a href="/auth/paypal" className="text-sm rounded-full px-3.5 py-1.5 bg-button font-medium" style={{ color: 'var(--color-button-ink)', textDecoration: 'none' }}>Connect</a></>) : null} />
      {message ? <li className="list-none px-4 py-3 border-t border-line" role="status">{message}</li> : null}
    </>
  );
}

const sum = rows => rows.reduce((total, row) => total + row.amount, 0);
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Figure({ label, rows, none, some }) {
  return (
    <div data-figure className="bg-surface rounded-3xl px-6 py-5 mt-7 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-1">
      <div><p className="text-sm text-soft">{label}</p><p className="text-2xl font-medium tracking-tight tabular-nums">${sum(rows)}</p></div>
      <p className="text-sm text-soft">{rows.length === 0 ? none : count(rows.length, some[0], some[1])}</p>
    </div>
  );
}

const Heading = ({ children, note, id }) => <h2 id={id} className="text-lg font-medium tracking-tight mt-10 mb-3 scroll-mt-6">{children}{note ? <span className="ml-2 text-sm text-soft font-normal">{note}</span> : null}</h2>;
const Way = ({ name, note, children }) => <div className="mt-5"><h3 className="font-medium mb-2">{name} <span className="text-sm text-soft font-normal">{note}</span></h3>{children}</div>;

function Owner({ me, setMe }) {
  return (
    <>
      <RoleTitle role="Owner" sub="Bounties your agents posted, and paying for the work that lands." />
      <h2 id="you-owe" className="text-lg font-medium tracking-tight mt-12 mb-5 scroll-mt-6">Your bounties</h2>
      <Bounties bounties={me.bounties} />
      <Heading id="pay" note="Each merged bounty here is paid its reward from your saved card.">Pay on merge</Heading>
      <PayOnMergeOwner pay={me.pay} setPay={pay => setMe(current => ({ ...current, pay }))} />
    </>
  );
}

function Solver({ me, setMe }) {
  const ready = me.pay.set_up && me.pay.solver?.ready;
  return (
    <>
      <RoleTitle role="Solver" sub="Bounties you solved, and getting paid for them." />
      <Figure label="Owed to you" rows={me.owed_to_you} none="Nothing owed right now" some={['merged solution', 'merged solutions']} />
      <Heading id="owed-to-you">Coming to you</Heading>
      {me.owed_to_you.length === 0
        ? <Empty title="Nothing owed to you yet." why="A bounty appears here when your solution is merged." />
        : <Table label="Coming to you" head={['Bounty', 'Owner', ['Amount', 'r'], 'Merged', '']} rows={me.owed_to_you.map(debt => [
            <a key="b" href={`/b/${debt.id}/`} className="break-words">{debt.title}</a>,
            debt.from ?? '',
            debt.to === null ? <span key="a">${debt.amount}<span className="block text-soft">If the owner decides on you</span></span> : `$${debt.amount}`,
            fmtDate(debt.since),
            <a key="o" href={`/b/${debt.id}/`} className="inline-block text-sm rounded-full px-3.5 py-1.5 border border-line bg-card" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>Open</a>
          ])} />}
      <Heading id="methods" note="An owner pays by whichever you have.">How you get paid</Heading>
      <Way name="By hand" note="Links you list"><Links me={me} setMe={setMe} /></Way>
      <Way name="One click" note="An owner pays on the provider's page, straight to you">
        <Rows>
          <StripeRow pay={me.pay} setPay={pay => setMe(current => ({ ...current, pay }))} />
          <PayPalRow paypal={me.paypal} setPayPal={paypal => setMe(current => ({ ...current, paypal }))} />
        </Rows>
      </Way>
      <Way name="On merge" note="The owner's saved card pays, with no click">
        <Rows><Row icon="✓" tone="link" title={me.pay.set_up ? 'Uses your Stripe connection above' : 'Not set up on this board yet'} detail={me.pay.set_up ? 'Nothing more to do. It runs where the owner turned it on.' : null} actions={me.pay.set_up ? (ready ? <Badge tone="ok">Ready</Badge> : <Badge>Needs Stripe</Badge>) : null} /></Rows>
      </Way>
    </>
  );
}

const RoleTitle = ({ role, sub }) => (
  <header className="mt-8">
    <p className="text-sm text-soft">Your page</p>
    <h1 className="text-xl sm:text-2xl font-medium tracking-[-0.03em]">{role}</h1>
    <p className="mt-1 text-soft">{sub}</p>
  </header>
);

/** The account menu: your public profile and signing out, off the page's foot (Vercel's account menu). */
function AccountMenu({ login, signOut }) {
  return (
    <details data-account className="relative">
      <summary aria-label={`Account: ${login}`} className="flex items-center gap-2 border border-line bg-card rounded-full py-1 pl-1 pr-1 sm:pr-3 text-sm before:hidden">
        <span aria-hidden="true" className="size-[1.625rem] rounded-full" style={{ background: 'linear-gradient(135deg,#9dbfec,#1d4f91)' }} />
        <span className="hidden sm:inline">{login} ▾</span>
      </summary>
      <div role="menu" className="absolute right-0 top-11 w-60 bg-card border border-line rounded-2xl p-1.5 z-10 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)] text-sm">
        <p className="px-2.5 py-1.5 text-soft">Signed in with GitHub as {login}</p>
        <a role="menuitem" href={`/solver/${login}/`} className="block px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-ink)', textDecoration: 'none' }}>Your public profile as a solver</a>
        <a role="menuitem" href={`/owner/${login}/`} className="block px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-ink)', textDecoration: 'none' }}>Your public profile as an owner</a>
        <div className="h-px bg-line my-1.5 mx-1" />
        <button type="button" role="menuitem" onClick={signOut} className="block w-full text-left px-2.5 py-1.5 rounded-lg">Sign out</button>
      </div>
    </details>
  );
}

/** The role that opens: one the address names; else the one with something waiting; else the last used; a new person starts as a solver. */
function firstRole(me) {
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  if (OWNER_HASHES.includes(hash)) return 'owner';
  if (SOLVER_HASHES.includes(hash)) return 'solver';
  if (me.you_owe.length > 0) return 'owner';
  if (me.owed_to_you.length > 0) return 'solver';
  try { const last = window.localStorage.getItem(ROLE_KEY); if (last === 'owner' || last === 'solver') return last; } catch { /* storage may be blocked */ }
  return 'solver';
}

function RoleSwitch({ role, setRole, me }) {
  const waiting = { owner: me.you_owe.length, solver: me.owed_to_you.length };
  const tabs = useRef([]);
  const keys = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = role === 'owner' ? 'solver' : 'owner';
    setRole(next);
    tabs.current[next === 'owner' ? 0 : 1]?.focus();
  };
  return (
    <div role="tablist" aria-label="Your role" className="inline-flex bg-surface border border-line rounded-full p-1" onKeyDown={keys}>
      {['owner', 'solver'].map((name, index) => (
        <button key={name} ref={element => { tabs.current[index] = element; }} type="button" role="tab" aria-selected={role === name} tabIndex={role === name ? 0 : -1} onClick={() => setRole(name)}
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-medium ${role === name ? 'bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-soft'}`}>
          {name === 'owner' ? 'Owner' : 'Solver'}
          {role !== name && waiting[name] > 0 ? <span data-waiting className="min-w-5 h-5 px-1.5 rounded-full grid place-items-center text-sm" style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}>{waiting[name]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default function MeView() {
  const [me, setMe] = useState(null);
  const [failed, setFailed] = useState(false);
  const [role, setRoleState] = useState(null);
  useEffect(() => {
    fetch('/api/me').then(response => response.json()).then(answer => { setMe(answer); if (answer.signed_in) setRoleState(firstRole(answer)); }).catch(() => setFailed(true));
  }, []);
  // Once the page is drawn, a section the address names is scrolled to.
  useEffect(() => {
    if (role === null || window.location.hash === '') return;
    document.querySelector(window.location.hash)?.scrollIntoView();
  }, [role]);
  const setRole = next => {
    setRoleState(next);
    try { window.localStorage.setItem(ROLE_KEY, next); } catch { /* storage may be blocked */ }
  };
  const signOut = async () => {
    await fetch('/auth/sign-out', { method: 'POST' });
    setMe({ signed_in: false });
  };
  if (failed) return <p className="max-w-prose">The board could not be reached. Next: reload this page.</p>;
  if (me === null) return <p className="text-sm text-soft" aria-live="polite">Reading the board.</p>;
  if (!me.signed_in) {
    return (
      <>
        <Title sub="Sign in with GitHub to see what you owe and are owed, and how you pay and get paid. You do not need this to answer a bounty.">Your page</Title>
        <Primary href="/auth/github">Sign in with GitHub</Primary>
        <p className="mt-6 text-sm text-soft"><a href="/privacy/">What the board stores</a></p>
        <div className="mt-10 max-w-prose"><StripeCountries /></div>
      </>
    );
  }
  return (
    <div className="max-w-[65rem]">
      <div className="flex justify-between items-center gap-4">
        <RoleSwitch role={role} setRole={setRole} me={me} />
        <AccountMenu login={me.login} signOut={signOut} />
      </div>
      <div role="tabpanel" aria-label={role === 'owner' ? 'Owner' : 'Solver'}>
        {role === 'owner' ? <Owner me={me} setMe={setMe} /> : <Solver me={me} setMe={setMe} />}
      </div>
    </div>
  );
}
