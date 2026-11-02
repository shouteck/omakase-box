'use client';
// The three ways to pay, from the one source, saying what is true on this board. Each shows
// the moment the owner sees, as the front page's other tiles do. Three equal cards: they are
// ways, not levels. Until the board has answered, or if it does not, nothing is claimed either way.
import { useEffect, useState } from 'react';
import { connectWords, countryName, isSetUp, NOT_SET_UP, STRIPE_COUNTRIES, STRIPE_REACH, throughHere, WAYS } from '../src/pay-ways.ts';

function useWaysHere() {
  const [here, setHere] = useState(null);
  useEffect(() => {
    fetch('/api/ways').then(async response => {
      if (response.ok) setHere(await response.json());
    }).catch(() => undefined);
  }, []);
  return here;
}

/** The moment itself. A picture of a button, not one: nothing here can be clicked. */
function Moment({ way, here }) {
  const body = here !== null && !isSetUp(way.id, here)
    ? <p className="text-sm text-soft">{NOT_SET_UP[0].toUpperCase()}{NOT_SET_UP.slice(1)}.</p>
    : (
      <>
        <p className={way.id === 'one-click' ? 'inline-block rounded-full border border-line px-3 py-0.5 text-sm font-medium' : way.id === 'on-merge' ? 'text-sm font-medium text-accent' : 'text-sm font-medium'}>{way.shows}</p>
        <p className="mt-1 text-sm text-soft">{way.whoSays}&apos;s word</p>
      </>
    );
  return <div className="bg-card rounded-2xl border border-line px-4 py-3 min-h-[5rem] flex flex-col items-start justify-center">{body}</div>;
}

/** Three equal cards, inside the front page's tile. */
export function WayCards() {
  const here = useWaysHere();
  return (
    <>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4">
        {WAYS.map(way => (
          <li key={way.id} className="min-w-0 flex flex-col gap-3">
            <div>
              <h3 className="font-medium">{way.name}</h3>
              <p className="text-sm text-soft">{throughHere(way, here)}</p>
            </div>
            <Moment way={way} here={here} />
            <p className="text-sm">{way.afterMerge}</p>
          </li>
        ))}
      </ul>
      {here?.on_merge ? <p className="mt-4 text-sm text-soft">{STRIPE_REACH}</p> : null}
    </>
  );
}

/** The solver's step, naming only what this board has. */
export function ConnectWords() {
  const here = useWaysHere();
  return <p>{connectWords(here)} Then say on the bounty&apos;s page whether it arrived.</p>;
}

/** Who Stripe can pay, folded. Nothing at all where this board has no Stripe. */
export function WhereStripePays() {
  const here = useWaysHere();
  if (!here?.on_merge) return null;
  return (
    <details data-stripe-countries className="border-t border-line py-4">
      <summary className="font-medium">Where Stripe can pay a solver</summary>
      <div className="mt-2 pl-[1.1em] text-soft max-w-prose flex flex-col gap-3">
        <p>{STRIPE_REACH}</p>
        <p>{STRIPE_COUNTRIES.map(countryName).sort((a, b) => a.localeCompare(b)).join(', ')}.</p>
      </div>
    </details>
  );
}

/** How it works says the ways in its steps; this says which of them this board does not have. */
export function WaysNotHere() {
  const here = useWaysHere();
  if (here === null) return null;
  const names = WAYS.filter(way => !isSetUp(way.id, here)).map(way => way.name);
  if (names.length === 0) return null;
  return <p>{names.map((name, index) => (index === 0 ? name : name.toLowerCase())).join(' and ')} {names.length === 1 ? 'is' : 'are'} {NOT_SET_UP}.</p>;
}
