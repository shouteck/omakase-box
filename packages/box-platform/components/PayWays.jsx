'use client';
// The three ways to pay, from the one source, saying what is true on this board. Each shows
// the moment the owner sees, as the front page's other tiles do. Three equal cards: they are
// ways, not levels. Until the board has answered, or if it does not, nothing is claimed either way.
import { useEffect, useState } from 'react';
import { connectWords, countryName, isSetUp, NOT_SET_UP, pageWords, STRIPE_COUNTRIES, STRIPE_REACH, throughHere, WAYS } from '../src/pay-ways.ts';

function useWaysHere() {
  const [here, setHere] = useState(null);
  useEffect(() => {
    fetch('/api/ways').then(async response => {
      if (response.ok) setHere(await response.json());
    }).catch(() => undefined);
  }, []);
  return here;
}

/** What happens after a merge: the same start and end on every way, so what differs is your part. */
function Steps({ way, here }) {
  const steps = [
    { you: false, words: 'Solution merged' },
    ...way.steps.map(step => ({ ...step, words: way.id === 'one-click' && here !== null ? step.words.replace('the provider\'s page', pageWords(here)) : step.words })),
    { you: false, words: 'Solver paid' }
  ];
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.words} className="relative flex gap-3 pb-3 last:pb-0">
          {index < steps.length - 1 ? <span aria-hidden="true" className="absolute left-[0.3rem] top-3 bottom-0 w-px bg-line" /> : null}
          <span aria-hidden="true" className={`relative mt-1.5 size-2.5 shrink-0 rounded-full border ${step.you ? 'border-accent bg-accent' : 'border-soft bg-card'}`} />
          <span className={step.you ? 'text-sm font-medium' : 'text-sm text-soft'}>{step.words}</span>
        </li>
      ))}
    </ol>
  );
}

/** Three equal cards, inside the front page's tile. Until the board has answered, or if it does not, nothing is claimed either way. */
export function WayCards() {
  const here = useWaysHere();
  return (
    <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {WAYS.map(way => {
        const off = here !== null && !isSetUp(way.id, here);
        return (
          <li key={way.id} className="bg-card rounded-2xl border border-line p-4 min-w-0 flex flex-col gap-4">
            <div>
              <h3 className="font-medium">{way.name}</h3>
              <p className="text-sm text-soft">{throughHere(way, here)}</p>
            </div>
            <p className={off ? 'text-sm text-soft' : 'text-lg font-medium tracking-tight'}>{off ? `${NOT_SET_UP[0].toUpperCase()}${NOT_SET_UP.slice(1)}.` : way.yourPart}</p>
            {off ? null : <Steps way={way} here={here} />}
            {off ? null : <p className="mt-auto text-sm text-soft">{way.whoSays}&apos;s word</p>}
          </li>
        );
      })}
    </ul>
  );
}

/** The solver's step, naming only what this board has. */
export function ConnectWords() {
  const here = useWaysHere();
  return <p>{connectWords(here)} Then say on the bounty&apos;s page whether it arrived.</p>;
}

/** The country list itself, readable signed out: How it works links here (PF19). Nothing where this board has no Stripe. */
export function StripeCountries() {
  const here = useWaysHere();
  if (!here?.on_merge) return null;
  return (
    <details id="stripe" data-stripe-countries className="border-t border-b border-line py-4">
      <summary className="font-medium">Where Stripe can pay a solver</summary>
      <div className="mt-2 pl-[1.1em] text-soft flex flex-col gap-3">
        <p>{STRIPE_REACH}</p>
        <p>{STRIPE_COUNTRIES.map(countryName).sort((a, b) => a.localeCompare(b)).join(', ')}.</p>
      </div>
    </details>
  );
}

/** Who Stripe can pay: the rule, where a reader decides. The country list is on the page where a solver connects. */
export function StripeReach() {
  const here = useWaysHere();
  return here?.on_merge ? <p data-stripe-reach>{STRIPE_REACH} <a href="/me/#stripe">Your page lists the countries.</a></p> : null;
}

/** How it works says the ways in its steps; this says which of them this board does not have. */
export function WaysNotHere() {
  const here = useWaysHere();
  if (here === null) return null;
  const names = WAYS.filter(way => !isSetUp(way.id, here)).map(way => way.name);
  if (names.length === 0) return null;
  return <p>{names.map((name, index) => (index === 0 ? name : name.toLowerCase())).join(' and ')} {names.length === 1 ? 'is' : 'are'} {NOT_SET_UP}.</p>;
}
