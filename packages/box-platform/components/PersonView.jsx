'use client';
// A person's public page, solver or owner. One shell for every address; the facts
// come from the server, and only what the person chose to make public is among them.
import { useEffect, useState } from 'react';
import { MethodList } from './Methods.jsx';
import { Facts, Section, Soft, Title, fmtDate, plural } from './ui.jsx';

const BountyLine = ({ b, children }) => <li><a href={`/b/${b.id}/`}>{b.title}</a> <Soft as="span">{b.repository}{b.amount > 0 ? ` · $${b.amount}` : ''}{children}</Soft></li>;

function Solver({ data }) {
  return (
    <>
      <Title sub="Facts from GitHub, and what this person chose to make public. The board does not rate people.">{data.login}</Title>
      <Section title="Ways they accept payment" id="methods">
        <MethodList methods={data.methods} empty="None listed publicly. Next: ask on the pull request how they want to be paid." />
      </Section>
      <Section title="Track record" id="record">
        {data.record.has_history
          ? <p>{plural(data.record.merged, 'merged solution')} (GitHub) · {plural(data.record.confirmed_received, 'payment')} they confirmed received (their word).</p>
          : <p>No history yet.</p>}
      </Section>
      {data.merged.length > 0 ? (
        <Section title="Merged solutions" id="merged">
          <ul className="flex flex-col gap-2">{data.merged.map(b => <BountyLine key={b.id} b={b}> · merged {fmtDate(b.merged_at)}{b.counted ? '' : ' · not counted'}</BountyLine>)}</ul>
        </Section>
      ) : null}
    </>
  );
}

function Owner({ data }) {
  const open = data.bounties.filter(b => b.issue_state === 'open');
  const closed = data.bounties.filter(b => b.issue_state !== 'open');
  return (
    <>
      <Title sub="Bounties this person posted on public GitHub repositories, and the payment facts on them. The board does not rate people.">{data.login}</Title>
      <Section title="Payment facts" id="facts">
        {data.record.has_history ? (
          <Facts rows={[
            ['Merged', `${data.record.merged}. Source: GitHub.`],
            ['Recorded paid', `${data.record.recorded_paid}. The owner's word.`],
            ['Confirmed received', `${data.record.confirmed_received}, by ${plural(data.record.from_solvers, 'different solver')}. The solvers' word.`],
            ['Says not received', `${data.record.says_not_received}. The solvers' word.`],
            ['Owed now', data.record.owed_now === 0 ? 'None.' : `${data.record.owed_now}, the oldest for ${plural(data.record.oldest_owed_days, 'day')}.`],
            data.record.median_days_to_record_paid === null ? null : ['Typical time to record paid', `${plural(data.record.median_days_to_record_paid, 'day')} after the merge.`]
          ]} />
        ) : <p className="max-w-prose">No history yet. No rewarded bounty of {data.login}&apos;s has been merged, so there is nothing to show either way.</p>}
        {data.not_counted.length > 0 ? <Soft className="mt-4 max-w-prose">Not counted: {data.not_counted.map(entry => `${entry.solver}, because ${entry.because}`).join('; ')}.</Soft> : null}
      </Section>
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
