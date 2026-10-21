'use client';
import Link from 'next/link';
import { Title, Section, Soft } from './ui.jsx';
import { Reward } from './Card.jsx';
import { useOverlay, useSession } from '../lib/client.js';
import { ownerRecord, stateOf, STATES, payeeOf, isSelfDealt, fmtDate, plural, isOpenState } from '../lib/facts.mjs';

export default function OwnerView({ login }) {
  const overlay = useOverlay();
  const viewer = useSession();
  const r = ownerRecord(login, overlay);
  const merged = r.bounties.filter(b => b.reward > 0 && payeeOf(b).kind !== 'none');
  const open = r.bounties.filter(b => isOpenState(stateOf(b)));
  const rows = [
    [r.merged, 'rewarded bounties merged', 'GitHub'],
    [r.recordedPaid, 'recorded paid', `${login}'s word`],
    [r.confirmedReceived, `confirmed received${r.confirmedReceived ? `, by ${plural(r.confirmers, 'different solver')}` : ''}`, 'the solvers\' word'],
    [r.owedNow, `owed now${r.owedNow ? `, the oldest for ${plural(r.oldestOwedDays, 'day')}` : ''}`, 'GitHub and the owner\'s word'],
    ...(r.saysNotReceived ? [[r.saysNotReceived, 'recorded paid, but the solver says not received', 'both words, shown side by side']] : []),
  ];
  return (
    <>
      <Title sub={viewer === login ? 'This is your public page as an owner: exactly what every solver sees about you.' : 'What this owner\'s bounties show, as facts. The board has no ratings.'}>{login}, as an owner</Title>
      <Section title="Payment facts" id="facts">
        {r.hasHistory ? (
          <table className="w-full max-w-prose text-left">
            <caption className="sr-only">Payment facts for {login}</caption>
            <tbody>
              {rows.map(([n, what, src]) => (
                <tr key={what} className="border-t border-line align-baseline">
                  <td className="py-3 pr-6 text-lg font-semibold tabular-nums w-16">{n}</td>
                  <td className="py-3">{what} <Soft as="span">({src})</Soft></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="max-w-prose">No history yet. No rewarded bounty of {login}&apos;s has been merged, so there is nothing to show either way.</p>
        )}
        {r.notCounted ? <p className="mt-4 max-w-prose">{plural(r.notCounted, 'merged bounty', 'merged bounties')} not counted: the solver was {login} or had push access to the repository, so a payment there says nothing about paying others.</p> : null}
        {r.medianDaysToRecord !== null ? <p className="mt-4 max-w-prose">{login} usually records a payment {r.medianDaysToRecord === 0 ? 'the day of the merge' : `${plural(r.medianDaysToRecord, 'day')} after the merge`}. Recorded paid but not yet confirmed means the solver has not said either way.</p> : null}
        <Soft className="mt-4">The owner pays solvers directly. The board sets no deadline and never holds, guarantees or moves money.</Soft>
      </Section>

      <Section title="Merged bounties" id="merged">
        {merged.length === 0 ? <p>None yet.</p> : (
          <ul>
            {merged.map(b => {
              const p = payeeOf(b);
              return (
                <li key={b.id} className="border-t border-line py-4">
                  <div className="flex items-baseline justify-between gap-6"><Link href={`/b/${b.id}/`}>{b.title}</Link><Reward amount={b.reward} /></div>
                  <p className="text-sm text-soft mt-1">{STATES[stateOf(b)].label} · merged {fmtDate(p.mergedAt)}{p.kind === 'one' ? ` · to ${p.login}` : ''}{isSelfDealt(b) ? ' · not counted' : ''}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Open bounties" id="open">
        {open.length === 0 ? <p>None open now.</p> : (
          <ul>{open.map(b => <li key={b.id} className="border-t border-line py-4 flex items-baseline justify-between gap-6"><Link href={`/b/${b.id}/`}>{b.title}</Link><Reward amount={b.reward} /></li>)}</ul>
        )}
      </Section>
    </>
  );
}
