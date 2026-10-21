'use client';
import Link from 'next/link';
import { Title, Section, Soft } from './ui.jsx';
import { useOverlay, useSession } from '../lib/client.js';
import { solverRecord, visibleMethods, METHOD_LABEL, people, fmtDate, payeeOf, stateOf, STATES } from '../lib/facts.mjs';

export default function SolverView({ login }) {
  const overlay = useOverlay();
  const viewer = useSession();
  const s = solverRecord(login, overlay);
  const { shown, hidden } = visibleMethods(login, viewer, overlay);
  return (
    <>
      <Title sub={`Facts only: what was merged and which payments ${login} confirmed. No ratings, no ranking. GitHub account since ${people[login]?.since ?? 'unknown'}.`}>{login}, as a solver</Title>
      <Section title="Track record" id="record">
        {s.hasHistory ? (
          <p className="text-lg"><span className="font-semibold tabular-nums">{s.merged}</span> solutions merged · <span className="font-semibold tabular-nums">{s.confirmedPayments}</span> payments confirmed received</p>
        ) : <p>No history yet. No solution of {login}&apos;s has been merged on a bounty here.</p>}
        <Soft className="mt-2">Merged: GitHub. Confirmed received: {login}&apos;s own word. Merges into a repository where {login} has push access are not counted.</Soft>
      </Section>

      <Section title="Accepts payment by" id="methods">
        {shown.length === 0 && hidden === 0 ? <p>Nothing listed yet.</p> : (
          <ul className="list-disc pl-5">
            {shown.map((m, i) => <li key={i}>{METHOD_LABEL[m.kind]}{m.chain ? ` on ${m.chain}` : ''}: <span className="break-all">{m.kind === 'wise' || m.kind === 'wallet' ? <code className="text-sm">{m.value}</code> : <a href={m.value} rel="nofollow noopener">{m.value}</a>}</span></li>)}
          </ul>
        )}
        {hidden ? <Soft className="mt-2">{hidden === 1 ? 'One more method is' : `${hidden} more methods are`} shown only to an owner who owes {login}.</Soft> : null}
        <Soft className="mt-2">Listed by {login}. The board stores them and shows them as {login} chose; it never follows or checks them.</Soft>
      </Section>

      <Section title="Merged solutions" id="merged">
        {s.won.length === 0 ? <p>None yet.</p> : (
          <ul>{s.won.map(b => <li key={b.id} className="border-t border-line py-4"><Link href={`/b/${b.id}/`}>{b.title}</Link><p className="text-sm text-soft mt-1">{b.repository} · merged {fmtDate(payeeOf(b).mergedAt)} · {STATES[stateOf(b)].label}</p></li>)}</ul>
        )}
      </Section>
    </>
  );
}
