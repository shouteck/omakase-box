'use client';
// Connecting Stripe, and the owner's card, limit and switch. All of it is signed-in only:
// this page is the one place charging can be turned on. The card itself is typed on Stripe's page.
import { useEffect, useRef, useState } from 'react';
import { Quiet, Section, Soft } from './ui.jsx';

// K46: the countries a test account in this setup could be created and charged in. Finishing Stripe's page there is Stripe's to decide.
const COUNTRIES = ['AE', 'AT', 'AU', 'BE', 'BG', 'BR', 'CA', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GI', 'GR', 'HK', 'HR', 'HU', 'IE', 'IT', 'JP', 'LI', 'LT', 'LU', 'LV', 'MT', 'MX', 'MY', 'NL', 'NO', 'NZ', 'PL', 'PT', 'RO', 'SE', 'SG', 'SI', 'SK', 'TH', 'US'];
const FIELD = 'block w-full max-w-prose border border-soft bg-surface px-3 py-2 rounded-xl';
const BUTTON = 'bg-button px-5 py-2.5 font-medium rounded-full';
const INK = { color: 'var(--color-button-ink)' };
const countryName = code => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code); } catch { return code; } };

export default function PayOnMerge({ pay, setPay }) {
  const [country, setCountry] = useState('US');
  const [limit, setLimit] = useState(pay.limit ?? '');
  const [names, setNames] = useState((pay.repositories ?? []).map(entry => entry.repository).join('\n'));
  const [message, setMessage] = useState(null);
  const status = useRef(null);

  const call = async (path, body = {}) => {
    setMessage(null);
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const answer = await response.json();
      if (!response.ok) { setMessage(answer.error); status.current?.focus(); return null; }
      if (answer.pay) setPay(answer.pay);
      return answer;
    } catch {
      setMessage('The board could not be reached. Nothing changed. Next: try again.');
      return null;
    }
  };
  const leave = async (path, body) => { const answer = await call(path, body); if (answer?.url) window.location.href = answer.url; };

  // Back from Stripe's page: a saved card names its session; otherwise read whether Stripe now says the account is ready.
  useEffect(() => {
    if (!pay.set_up) return;
    const session = new URLSearchParams(window.location.search).get('card');
    if (session) { call('/api/me/card/saved', { session }).then(() => window.history.replaceState(null, '', '/me/')); return; }
    if (pay.solver?.connected && !pay.solver.ready) call('/api/me/stripe/read');
  // Once, on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pay.set_up) return <Section title="Pay on merge" id="pay"><p className="max-w-prose text-soft">Pay on merge is not set up on this board yet. Solvers are paid directly, by the ways they list below.</p></Section>;

  const save = event => {
    event.preventDefault();
    return call('/api/me/pay', { limit: Number(limit), repositories: names.split(/\s+/).filter(Boolean) }).then(answer => { if (answer) setMessage('Saved.'); });
  };

  return (
    <>
      <Section title="Get paid through Stripe" id="stripe">
        {pay.solver.ready
          ? <p className="max-w-prose">Your Stripe account is connected. If your solution is the one merged, an owner can pay the reward to your own account, with one click or by pay on merge.</p>
          : (
            <div className="flex flex-col gap-4 max-w-prose">
              <p>{pay.solver.connected ? 'You have started connecting Stripe, and Stripe does not yet say your account can take payments.' : 'Connect your own Stripe account, and an owner can pay you there with one click or by pay on merge.'}</p>
              {pay.solver.connected ? null : (
                <label className="flex flex-col gap-1">
                  <span>Country of your bank account</span>
                  <select name="country" className={FIELD} value={country} onChange={event => setCountry(event.target.value)}>
                    {COUNTRIES.map(code => <option key={code} value={code}>{countryName(code)}</option>)}
                  </select>
                </label>
              )}
              <div><button type="button" data-primary className={BUTTON} style={INK} onClick={() => leave('/api/me/stripe/connect', { country })}>{pay.solver.connected ? 'Continue on Stripe\'s page' : 'Connect Stripe'}</button></div>
            </div>
          )}
        <Soft className="mt-4 max-w-prose">Stripe treats you as a merchant and asks for identity and bank details on its own page; the board never sees them. Stripe&apos;s fee comes out of the reward: about $1.61 of $45 in the US, and more abroad. The card&apos;s bank can reverse a payment after the merge, and that dispute and its fee land on your account. Your country not listed? List another way to be paid below.</Soft>
      </Section>

      <Section title="Pay on merge" id="pay">
        <p className="max-w-prose mb-4">Off by default. Turn it on for a repository, and when exactly one solution to your bounty there lands, the board starts a charge from your card to the solver&apos;s own Stripe account. It never holds the money and takes no fee. It never charges for a merge from before you turned it on.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 items-baseline mb-6">
          {pay.card ? <p>Saved card: {pay.card}.</p> : <p>No card saved.</p>}
          <button type="button" className={pay.card ? 'underline' : BUTTON} style={pay.card ? undefined : INK} onClick={() => leave('/api/me/card')}>{pay.card ? 'Replace it on Stripe\'s page' : 'Save a card on Stripe\'s page'}</button>
          {pay.card ? <Quiet onClick={() => call('/api/me/pay', { remove_card: true }).then(() => setNames(''))}>Remove the card and turn everything off</Quiet> : null}
        </div>
        {pay.card ? (
          <form onSubmit={save} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span>The most one bounty may charge, in whole dollars</span>
              <input name="limit" type="number" min="1" className={FIELD} value={limit} onChange={event => setLimit(event.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              <span>Repositories it is on for, one per line, as owner/name</span>
              <textarea name="repositories" rows={3} className={FIELD} value={names} onChange={event => setNames(event.target.value)} />
            </label>
            <Soft className="max-w-prose">Only this page can turn it on: your agent and the command line cannot. If a card asks you to authenticate at merge, nothing is charged, and the bounty&apos;s page offers you Stripe&apos;s page to finish it.</Soft>
            <div><button type="submit" className={BUTTON} style={INK}>Save</button></div>
          </form>
        ) : null}
        {message ? <p role="status" ref={status} tabIndex={-1} className="mt-4 max-w-prose">{message}</p> : null}
      </Section>
    </>
  );
}
