'use client';
import Link from 'next/link';
import { Title, Section, Quiet, Soft } from './ui.jsx';
import { resetPrototype, signIn, signOut, useSession } from '../lib/client.js';
import { bounties, stateOf, STATES } from '../lib/facts.mjs';

export default function PrototypeStates() {
  const who = useSession();
  const byState = Object.keys(STATES).map(s => [s, bounties.filter(b => stateOf(b) === s)]);
  return (
    <>
      <Title sub="For reviewers of the prototype: a link to every state, and the sample accounts to see each as the owner or the solver.">Prototype states</Title>
      <p>Signed in as: {who ?? 'nobody'}. {['example-mara', 'example-wren', 'example-quill', 'example-sol'].map(l => <span key={l}> <Quiet onClick={() => signIn(l)}>{l}</Quiet></span>)} · <Quiet onClick={signOut}>sign out</Quiet> · <Quiet onClick={resetPrototype}>reset all clicks</Quiet></p>
      <Section title="Bounty states" id="states">
        <ul className="flex flex-col gap-3">
          {byState.map(([s, list]) => (
            <li key={s}><span className="font-semibold">{STATES[s].label}</span>: {list.length ? list.map((b, i) => <span key={b.id}>{i ? ', ' : ''}<Link href={`/b/${b.id}/`}>{b.id}</Link> ({b.poster})</span>) : 'none in the sample'}</li>
          ))}
        </ul>
        <Soft className="mt-3">Owner view: sign in as the poster. Solver view: sign in as the payee (example-quill is owed on bt-3a91c0e2d4f1 and asked to confirm on bt-4c6e19b0a2d8; example-sol said not received on bt-8b4d1f7a6c30).</Soft>
      </Section>
      <Section title="Board and profile states" id="other">
        <ul className="flex flex-col gap-2">
          <li><Link href="/">Board</Link> · <a href="/?state=empty">empty board</a> · <a href="/?state=error">GitHub unreachable</a> · filter to nothing for the no-match state</li>
          <li>Owner with a record: <Link href="/owner/example-mara/">example-mara</Link> · mixed record: <Link href="/owner/example-wren/">example-wren</Link> · no history: <Link href="/owner/example-orrin/">example-orrin</Link> · self-dealing not counted: <Link href="/owner/example-pike/">example-pike</Link></li>
          <li>Solver with a record: <Link href="/solver/example-quill/">example-quill</Link> · new solver: <Link href="/solver/example-fern/">example-fern</Link></li>
          <li><a href="/b/bt-000000000000/">A bounty that is not on the board</a> (not found)</li>
          <li><Link href="/me/">Your page</Link> signed out, and as each account above</li>
        </ul>
      </Section>
    </>
  );
}
