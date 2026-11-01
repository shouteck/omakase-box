'use client';
// The three ways to pay, from the one source, saying what is true on this board. Until the
// board has answered, or if it does not, nothing is claimed either way.
import { useEffect, useState } from 'react';
import { isSetUp, NOT_SET_UP, WAYS } from '../src/pay-ways.ts';

const SHORT = {
  'by-hand': 'Any way the solver lists. You record it.',
  'one-click': 'You pay on Stripe\'s or PayPal\'s page.',
  'on-merge': 'Your saved card, once you turn it on.'
};
const COLUMNS = [['through', 'Through'], ['solverNeeds', 'Solver needs'], ['afterMerge', 'After the merge, the owner'], ['whoSays', 'Who says it was paid']];

function useWaysHere() {
  const [here, setHere] = useState(null);
  useEffect(() => {
    fetch('/api/ways').then(async response => {
      if (response.ok) setHere(await response.json());
    }).catch(() => undefined);
  }, []);
  return here;
}

const Unset = ({ way, here }) => (here !== null && !isSetUp(way.id, here) ? <span className="block text-sm text-soft font-normal">{NOT_SET_UP[0].toUpperCase()}{NOT_SET_UP.slice(1)}.</span> : null);

/** The front page's tile: one short line each. */
export function WayFacts() {
  const here = useWaysHere();
  return WAYS.map(way => (
    <div key={way.id} className="bg-card rounded-2xl border border-line px-4 py-3 min-w-0 grow basis-40">
      <p className="font-medium">{way.name}</p>
      <p className="text-sm text-soft">{SHORT[way.id]}</p>
      <Unset way={way} here={here} />
    </div>
  ));
}

/** How it works: a table at desktop width; on a phone each way stacks, with its labels. */
export function WayTable() {
  const here = useWaysHere();
  return (
    <table className="block md:table w-full text-left border-b border-line">
      <thead className="hidden md:table-header-group">
        <tr>
          <th scope="col" className="py-3 pr-6 font-medium"><span className="sr-only">Way</span></th>
          {COLUMNS.map(([key, label]) => <th key={key} scope="col" className="py-3 pr-6 font-medium text-sm text-soft align-bottom">{label}</th>)}
        </tr>
      </thead>
      <tbody className="block md:table-row-group">
        {WAYS.map(way => (
          <tr key={way.id} className="block md:table-row border-t border-line py-4 md:py-0">
            <th scope="row" className="block md:table-cell md:py-4 md:pr-6 font-medium align-top">{way.name}<Unset way={way} here={here} /></th>
            {COLUMNS.map(([key, label]) => (
              <td key={key} className="block md:table-cell mt-2 md:mt-0 md:py-4 md:pr-6 text-soft align-top">
                <span className="block md:hidden text-sm">{label}</span>
                <span className="text-ink md:text-soft">{way[key]}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
