'use client';
import Link from 'next/link';
import { Title, Section, Soft } from './ui.jsx';
import { MethodItem } from './BountyView.jsx';
import { useOverlay, useSession, useOwnerOnly } from '../lib/client.js';
import { solverRecord, visibleMethods, people, fmtDate, payeeOf, stateOf, STATES } from '../lib/facts.mjs';

export default function SolverView({ login }) {
  const overlay = useOverlay();
  const viewer = useSession();
  const s = solverRecord(login, overlay);
  // A profile page is no bounty's page: owner-only methods show here to the solver alone (B1).
  const { shown, ownerOnly, mayFetch } = visibleMethods(login, viewer, null);
  const own = useOwnerOnly(login, viewer, null, mayFetch);
  return (
    <>
      <Title sub={`Facts only: what was merged and which payments ${login} confirmed. No ratings, no ranking. GitHub account since ${people[login]?.since ?? 'unknown'}.`}>{login}, as a solver</Title>
      {people[login]?.sampleNote ? <p className="mb-6 max-w-prose border-l-2 border-accent pl-4">{people[login].sampleNote}</p> : null}
      <Section title="Track record" id="record">
        {s.hasHistory ? (
          <p className="text-lg"><span className="font-semibold tabular-nums">{s.merged}</span> solutions merged · <span className="font-semibold tabular-nums">{s.confirmedPayments}</span> payments confirmed received</p>
        ) : <p>No history yet. No solution of {login}&apos;s has been merged on a bounty here.</p>}
        <Soft className="mt-2">Merged: GitHub. Confirmed received: {login}&apos;s own word. Merges on a repository GitHub lists {login} as an owner, member or collaborator of are not counted.</Soft>
      </Section>

      <Section title="Accepts payment by" id="methods">
        {shown.length === 0 && ownerOnly === 0 ? <p>Nothing listed yet.</p> : null}
        {shown.length || own.state === 'shown' ? (
          <ul className="list-disc pl-5">
            {shown.map((m, i) => <MethodItem key={i} m={m} />)}
            {own.state === 'shown' ? own.methods.map((m, i) => <MethodItem key={`o${i}`} m={m} note="only you see it here; an owner who owes you sees it on that bounty's page" />) : null}
          </ul>
        ) : null}
        {own.state === 'error' ? <p role="status" className="mt-2">{own.error}</p> : null}
        {ownerOnly && !mayFetch ? <Soft className="mt-2">{ownerOnly === 1 ? 'One more method is' : `${ownerOnly} more methods are`} shown only to an owner who owes {login}, on that bounty&apos;s page.</Soft> : null}
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
