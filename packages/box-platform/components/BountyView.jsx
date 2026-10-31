'use client';
import { useEffect, useState } from 'react';
import PaymentPanel from './PaymentPanel.jsx';
import { Facts, Primary, SampleNote, Section, Soft, Stale, TheirWords, Title, fmtDate } from './ui.jsx';

const SOURCE = { github: 'GitHub', 'project-record': 'the project\'s record on GitHub' };
const APPROVED = {
  'owner-this-bounty': 'The owner said yes to this bounty before it was posted.',
  'owner-standing-rule': 'By the owner\'s tool under a standing permission, without asking each time. Either way the reward is the owner\'s setting.'
};

function stateSentence(b) {
  const merged = b.solutions.filter(s => s.state === 'merged');
  switch (b.state) {
    case 'open': return 'Open. No solution yet.';
    case 'solutions-waiting': return 'Open. Solutions are waiting for the owner.';
    case 'merged': return `Merged: pull request #${merged[0].number} by ${merged[0].author}, on ${fmtDate(merged[0].merged_at)}.`;
    case 'merged-more-than-one': return `GitHub marks more than one pull request merged: ${merged.map(s => `#${s.number} by ${s.author}`).join(' and ')}.`;
    default: return b.closed_at ? `Closed without a merge on ${fmtDate(b.closed_at)}.` : 'Closed without a merge.';
  }
}

function payment(b) {
  if (b.amount === 0) return 'No reward is stated, so nothing is owed.';
  if (b.state === 'closed-none') return 'Closed without a merge. Nothing is owed.';
  const line = `$${b.amount} for the merged solution. The owner pays its author directly; the board carries no money.`;
  if (b.state === 'merged-more-than-one') return `${line} The terms pay one merged solution, so the owner decides whom to pay.`;
  return line;
}

function View({ data }) {
  const b = data.bounty;
  const open = b.state === 'open' || b.state === 'solutions-waiting';
  return (
    <>
      <SampleNote data={data} />
      <nav aria-label="Breadcrumb" className="text-sm text-soft mb-6"><a href="/">Open bounties</a> / {b.id}</nav>
      <Title sub={stateSentence(b)}>{b.title}</Title>
      <Soft className="-mt-8 mb-10">The title is the poster&apos;s own words.</Soft>
      <Stale data={data} />
      <Facts rows={[
        ['Stated reward', b.amount > 0 ? `$${b.amount}` : 'No reward'],
        ['Posted by', <a key="poster" href={`/owner/${b.poster}/`}>{b.poster}</a>],
        ['Repository', <>{b.repository}{b.language ? ` · ${b.language}` : ''}</>],
        ['Posted', fmtDate(b.posted_at)],
        ['Posting approved', b.approved_by ? APPROVED[b.approved_by] : 'The project\'s record does not say.'],
        ['Terms', 'The merged solution earns the whole reward. Other solutions and parts used by hand earn nothing.'],
        ['Read from GitHub', data.read_at ? `${fmtDate(data.read_at)}, ${data.read_at.slice(11, 16)} UTC` : 'Not yet']
      ]} />

      <Section title="The task" id="task">
        <TheirWords who={<>The poster&apos;s words ({b.poster}), from the <a href={b.links.issue} rel="nofollow noopener">GitHub issue</a></>}>{b.task}</TheirWords>
      </Section>

      {open ? (
        <Section title="How to answer" id="answer">
          <ol className="list-decimal pl-5 flex flex-col gap-2 max-w-prose">
            <li>Fork {b.repository} and branch from <code className="text-sm break-all">{b.branch}</code> (commit <code className="text-sm">{b.work_commit.slice(0, 12)}</code>).</li>
            <li>Open a pull request against <code className="text-sm break-all">{b.branch}</code> in {b.repository}, not against {b.default_branch}.</li>
          </ol>
          <div className="mt-6"><Primary href={b.links.branch}>Open the bounty branch on GitHub</Primary></div>
        </Section>
      ) : null}

      <Section title="Payment for this bounty" id="payment">
        <p className="max-w-prose mb-4">{payment(b)}</p>
        <PaymentPanel id={b.id} poster={b.poster} />
      </Section>

      <Section title="Solutions" id="solutions">
        {b.solutions.length === 0 ? <p>No solution yet.</p> : (
          <ul className="flex flex-col gap-2">
            {b.solutions.map(s => <li key={s.number}><a href={s.url} rel="nofollow noopener">Pull request #{s.number}</a> by <a href={`/solver/${s.author}/`}>{s.author}</a>: {s.state}</li>)}
          </ul>
        )}
        <Soft className="mt-3">The board lists them; it does not judge or rank them.</Soft>
      </Section>

      <Section title="History" id="history">
        <ul className="flex flex-col gap-2">
          {b.history.map((line, i) => <li key={i}>{fmtDate(line.at)}: {line.event}. <Soft as="span">Source: {SOURCE[line.source]}.</Soft></li>)}
        </ul>
      </Section>
    </>
  );
}

export default function BountyView() {
  const [answer, setAnswer] = useState(null);
  useEffect(() => {
    const id = /^\/b\/([^/]+)/.exec(window.location.pathname)?.[1] ?? '';
    (async () => {
      try {
        const response = await fetch(`/api/b/${encodeURIComponent(id)}`);
        const body = await response.json();
        setAnswer(response.ok ? { data: body } : { error: body.error });
      } catch {
        setAnswer({ error: 'The board could not be reached. Next: reload this page.' });
      }
    })();
  }, []);
  if (answer === null) return <p className="text-sm text-soft" aria-live="polite">Reading the board.</p>;
  if (answer.data) return <View data={answer.data} />;
  return (
    <>
      <Title>Not on the board</Title>
      <p className="max-w-prose">{answer.error}</p>
      <p className="mt-6"><a href="/">Search the board</a></p>
    </>
  );
}
