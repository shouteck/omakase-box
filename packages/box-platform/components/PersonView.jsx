'use client';
// A person's public page, solver or owner. One shell for every address; the facts
// come from the server, and only what the person chose to make public is among them.
import { useEffect, useState } from 'react';
import { MethodList } from './Methods.jsx';
import { Section, Soft, Title, fmtDate } from './ui.jsx';

const BountyLine = ({ b, children }) => <li><a href={`/b/${b.id}/`}>{b.title}</a> <Soft as="span">{b.repository}{b.amount > 0 ? ` · $${b.amount}` : ''}{children}</Soft></li>;

function Solver({ data }) {
  return (
    <>
      <Title sub="Facts from GitHub, and what this person chose to make public. The board does not rate people.">{data.login}</Title>
      <Section title="Ways they accept payment" id="methods">
        <MethodList methods={data.methods} empty="None listed publicly. Next: ask on the pull request how they want to be paid." />
      </Section>
      <Section title="Merged solutions" id="merged">
        {data.merged.length === 0 ? <p>No history yet.</p> : <ul className="flex flex-col gap-2">{data.merged.map(b => <BountyLine key={b.id} b={b}> · merged {fmtDate(b.merged_at)}</BountyLine>)}</ul>}
      </Section>
    </>
  );
}

function Owner({ data }) {
  const open = data.bounties.filter(b => b.issue_state === 'open');
  const closed = data.bounties.filter(b => b.issue_state !== 'open');
  return (
    <>
      <Title sub="Bounties this person posted on public GitHub repositories. Payment facts are not on the board yet.">{data.login}</Title>
      <Section title="Open bounties" id="open">
        {open.length === 0 ? <p>None open.</p> : <ul className="flex flex-col gap-2">{open.map(b => <BountyLine key={b.id} b={b} />)}</ul>}
      </Section>
      {closed.length > 0 ? (
        <Section title="Closed bounties" id="closed">
          <ul className="flex flex-col gap-2">{closed.map(b => <BountyLine key={b.id} b={b} />)}</ul>
        </Section>
      ) : null}
    </>
  );
}

export default function PersonView({ kind }) {
  const [answer, setAnswer] = useState(null);
  useEffect(() => {
    const login = new RegExp(`^/${kind}/([^/]+)`).exec(window.location.pathname)?.[1] ?? '';
    (async () => {
      try {
        const response = await fetch(`/api/${kind}/${login}`);
        const body = await response.json();
        setAnswer(response.ok ? { data: body } : { error: body.error });
      } catch {
        setAnswer({ error: 'The board could not be reached. Next: reload this page.' });
      }
    })();
  }, [kind]);
  if (answer === null) return <p className="text-sm text-soft" aria-live="polite">Reading the board.</p>;
  if (answer.error) return <><Title>Not on the board</Title><p className="max-w-prose">{answer.error}</p></>;
  return kind === 'solver' ? <Solver data={answer.data} /> : <Owner data={answer.data} />;
}
