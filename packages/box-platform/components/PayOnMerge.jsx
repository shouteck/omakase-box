'use client';
// Stripe on Your page (PF19): the solver's connection, a row with its status; the owner's pay on merge,
// one card and a table of repositories, each with what it may charge ("charge up to"; the CLI's limit is another thing). Signed-in only: this page is the one place
// charging can be turned on. The card itself is typed on Stripe's page.
import { useEffect, useRef, useState } from 'react';
import { countryName, STRIPE_COUNTRIES } from '../src/pay-ways.ts';
import Dialog from './Dialog.jsx';
import { Badge, Button, Empty, Row, Rows, Table } from './ui.jsx';

const FIELD = 'block w-full border border-line bg-surface px-3 py-2 rounded-xl';
const fmtDay = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A call to the board's pay routes; the answer's `pay` replaces the page's. */
function usePayCall(setPay) {
  const [message, setMessage] = useState(null);
  const call = async (path, body = {}) => {
    setMessage(null);
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const answer = await response.json();
      if (!response.ok) { setMessage(answer.error); return null; }
      if (answer.pay) setPay(answer.pay);
      return answer;
    } catch {
      setMessage('The board could not be reached. Nothing changed. Next: try again.');
      return null;
    }
  };
  const leave = async (path, body) => { const answer = await call(path, body); if (answer?.url) window.location.href = answer.url; };
  return { call, leave, message };
}

const Said = ({ message }) => (message ? <p role="status" className="mt-3 max-w-prose">{message}</p> : null);

/** The solver's Stripe row, under One click. Back from Stripe's page, it reads whether Stripe now says the account is ready. */
export function StripeRow({ pay, setPay }) {
  const [country, setCountry] = useState('US');
  const { call, leave, message } = usePayCall(setPay);
  useEffect(() => {
    if (pay.set_up && pay.solver?.connected && !pay.solver.ready) call('/api/me/stripe/read');
  // Once, on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!pay.set_up) return <Row icon="S" tone="stripe" title="Stripe" detail="Not set up on this board yet." />;
  const { connected, ready } = pay.solver;
  const status = ready ? <Badge tone="ok">Connected</Badge> : connected ? <Badge tone="wait">Stripe is checking your details</Badge> : <Badge>Not connected</Badge>;
  return (
    <>
      <Row icon="S" tone="stripe" title="Stripe" id="stripe"
        detail={ready ? 'Your own Stripe account. Stripe\'s fee comes out of the reward.' : connected ? 'Owners can pay you once Stripe has checked your details.' : 'Your own Stripe account, for a bank account in a supported country. Stripe\'s fee comes out of the reward.'}
        actions={<>{status}{ready ? null : (
          <>
            {connected ? null : (
              <label className="sr-only" htmlFor="country">Country of your bank account</label>
            )}
            {connected ? null : (
              <select id="country" name="country" className="border border-line bg-surface rounded-full px-3 py-1 text-sm" value={country} onChange={event => setCountry(event.target.value)}>
                {STRIPE_COUNTRIES.map(code => <option key={code} value={code}>{countryName(code)}</option>)}
              </select>
            )}
            <Button primary={!connected} onClick={() => leave('/api/me/stripe/connect', { country })}>{connected ? 'Continue on Stripe' : 'Connect'}</Button>
          </>
        )}</>}
      />
      <Said message={message} />
    </>
  );
}

/** Turn a repository on, or change its reward. The repositories offered are only those where you posted bounties (PF20): nothing is typed. */
function RepositoryDialog({ open, onClose, editing, repositories, yours, save }) {
  const offered = yours.filter(entry => !repositories.some(on => on.repository.toLowerCase() === entry.repository.toLowerCase()));
  const [chosen, setChosen] = useState('');
  const [reward, setReward] = useState('');
  useEffect(() => {
    if (!open) return;
    const first = editing ? null : offered[0] ?? null;
    setChosen(editing?.repository ?? first?.repository ?? '');
    setReward(String(editing?.limit ?? first?.reward ?? ''));
  // When it opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);
  const choose = entry => { setChosen(entry.repository); setReward(String(entry.reward)); };
  const submit = async event => {
    event.preventDefault();
    const others = repositories.filter(entry => entry.repository.toLowerCase() !== chosen.toLowerCase());
    if (await save([...others, { repository: chosen, limit: Number(reward) }])) onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Reward on ${editing.repository}` : 'Turn on a repository'} onSubmit={submit} submit={editing ? 'Save' : 'Turn on'}>
      {editing ? null : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1">Your repositories with bounties</legend>
          {offered.map(entry => (
            <label key={entry.repository} className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${chosen === entry.repository ? 'border-ink' : 'border-line'}`}>
              <input type="radio" name="repository" value={entry.repository} checked={chosen === entry.repository} onChange={() => choose(entry)} />
              <span className="flex-1 min-w-0 break-all">{entry.repository}</span>
              <span className="text-sm text-soft whitespace-nowrap">{entry.open === 1 ? '1 open' : `${entry.open} open`} · ${entry.reward}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="flex flex-col gap-1">
        <span>Reward each merged bounty is paid, in whole dollars</span>
        <input name="reward" type="number" min="1" className={FIELD} value={reward} onChange={event => setReward(event.target.value)} required />
      </label>
      <p className="text-sm text-soft">When exactly one solution to your bounty there lands and its reward is this amount, the board charges it to your card and pays the solver&apos;s own Stripe account. A bounty stating another reward waits for you on its page. A merge from before you turned it on is never charged.</p>
    </Dialog>
  );
}

/** The owner's pay on merge: one card, then each repository and the reward its bounties are paid. Off by default. */
export function PayOnMergeOwner({ pay, setPay }) {
  const { call, leave, message } = usePayCall(setPay);
  const [dialog, setDialog] = useState(null);
  const done = useRef(false);
  // Back from Stripe's page: a saved card names its session.
  useEffect(() => {
    if (!pay.set_up || done.current) return;
    done.current = true;
    const session = new URLSearchParams(window.location.search).get('card');
    if (session) call('/api/me/card/saved', { session }).then(() => window.history.replaceState(null, '', '/me/#pay'));
  // Once, on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!pay.set_up) return <Empty title="Pay on merge is not set up on this board yet." why="Pay each solver from the bounty's page." />;
  const repositories = (pay.repositories ?? []).map(entry => ({ repository: entry.repository, limit: entry.limit, on_at: entry.on_at, open: entry.open ?? 0 }));
  const yours = pay.yours ?? [];
  const more = yours.some(entry => !repositories.some(on => on.repository.toLowerCase() === entry.repository.toLowerCase()));
  const save = async list => (await call('/api/me/pay', { repositories: list.map(({ repository, limit }) => ({ repository, limit })) })) !== null;
  if (!pay.card) {
    return (
      <>
        <Empty title="Pay on merge is off." why="Save a card, then choose which of your repositories it pays for, and the reward." action={<Button primary onClick={() => leave('/api/me/card')}>Save a card on Stripe&apos;s page</Button>} />
        <Said message={message} />
      </>
    );
  }
  return (
    <>
      <Rows>
        <Row icon="▭" tone="card" title={pay.card} detail="Pays for every repository below. Saved on Stripe's page; the board never sees the number." actions={<Button onClick={() => leave('/api/me/card')}>Replace</Button>} />
      </Rows>
      <div className="mt-3">
        {repositories.length > 0 ? (
          <Table label="Repositories on pay on merge" head={['Repository', ['Reward', 'r'], 'Open bounties', 'On since', '']}
            rows={repositories.map(entry => [
              <span key="n" className="break-all">{entry.repository}</span>,
              `$${entry.limit}`,
              entry.open === 0 ? <span key="o" className="text-soft">None open</span> : String(entry.open),
              fmtDay(entry.on_at),
              <span key="a" className="inline-flex gap-2"><Button onClick={() => setDialog(entry)}>Edit</Button><Button onClick={() => save(repositories.filter(other => other !== entry))}>Turn off</Button></span>
            ])} />
        ) : yours.length === 0
          ? <Empty title="No repositories yet." why="Pay on merge works on repositories where you have posted a bounty. Post one with your agent (box bounty), and it appears here to turn on." />
          : <Empty title="No repository is on." why="Turn one of yours on, and merged solutions there pay themselves." />}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 items-center">
        {more ? <Button onClick={() => setDialog('new')}>+ Turn on a repository</Button> : null}
        <button type="button" className="text-sm text-soft underline underline-offset-[3px]" onClick={() => call('/api/me/pay', { remove_card: true })}>Remove the card and turn pay on merge off</button>
      </div>
      <Said message={message} />
      <RepositoryDialog open={dialog !== null} onClose={() => setDialog(null)} editing={dialog === 'new' ? null : dialog} repositories={repositories} yours={yours} save={save} />
    </>
  );
}
