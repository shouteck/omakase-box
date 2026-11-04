'use client';
import { useEffect, useState } from 'react';
import { WAYS } from '../src/pay-ways.ts';
import PaymentCard from './PaymentPanel.jsx';
import { CodeBlock, Facts, SampleNote, Section, Soft, Stale, TheirWords, Title, fmtDate } from './ui.jsx';

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

function View({ data }) {
  const b = data.bounty;
  // PF32: the server says when a bounty takes answers: a posted one until a merge or close, a listed one until a payment or close.
  const open = b.open_to_answers ?? (b.state === 'open' || b.state === 'solutions-waiting');
  const listed = b.source === 'listed';
  return (
    <>
      <SampleNote data={data} />
      <nav aria-label="Breadcrumb" className="text-sm text-soft mb-6"><a href="/board/">Open bounties</a> / {b.id}</nav>
      <Title sub={stateSentence(b)}>{b.title}</Title>
      <Soft className="-mt-9 mb-10">{listed ? `The title is the issue's own words (${b.issue_author}).` : <>The title is the poster&apos;s own words.</>}</Soft>
      <Stale data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-x-12 gap-y-10 items-start">
        <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6 bg-surface rounded-3xl px-6 pt-6 pb-3" aria-label="Summary">
          <PaymentCard id={b.id} poster={b.poster} amount={b.amount} state={b.state} issue={b.links.issue}
            terms={<Facts stacked rows={[
              ['Terms', listed ? 'The owner chooses whom to pay, from every pull request linked to the issue, merged or not. One is paid.' : 'The merged solution earns the whole reward. Other solutions and parts used by hand earn nothing.'],
              ...(listed ? [] : [['Posting approved', b.approved_by ? APPROVED[b.approved_by] : 'The project\'s record does not say.']]),
              ['Read from GitHub', data.read_at ? `${fmtDate(data.read_at)}, ${data.read_at.slice(11, 16)} UTC` : 'Not yet']
            ]} />}>
          <Facts stacked rows={[
            ['Posted by', <a key="poster" href={`/owner/${b.poster}/`}>{b.poster}</a>],
            ['Repository', <>{b.repository}{b.language ? ` · ${b.language}` : ''}</>],
            ['Posted', fmtDate(b.posted_at)],
            ['Solutions so far', String(b.solutions.length)],
            ...(listed ? [['Listed', `From the board by ${b.listed_by}, on GitHub's issue #${b.issue_number}`]] : []),
            ['Who may answer', 'Agents welcome, through a GitHub account'],
            ...(b.amount > 0 ? [['Payment', WAYS.filter(way => b.how_it_pays.ways.includes(way.id)).map(way => way.name).join(', ')]] : [])
          ]} />
          </PaymentCard>
        </aside>

        <div className="lg:col-start-1 lg:row-start-1 min-w-0">
          <Section title="The task" id="task">
            <TheirWords who={listed ? <>The issue&apos;s words ({b.issue_author}), from the <a href={b.links.issue} rel="nofollow noopener">GitHub issue</a></> : <>The poster&apos;s words ({b.poster}), from the <a href={b.links.issue} rel="nofollow noopener">GitHub issue</a></>}>{b.task}</TheirWords>
          </Section>

          {open && listed ? (
            <Section title="How to answer" id="answer">
              <ol className="flex flex-col gap-4">
                <li>1. Fork {b.repository} and work from its default branch, {b.default_branch}.</li>
                <li>
                  <p>2. Open a pull request against {b.default_branch} in {b.repository} whose description says:</p>
                  <CodeBlock lines={[`Fixes #${b.issue_number}`]} what="line" className="mt-2" />
                </li>
                <li>3. The board links it to this bounty from GitHub. The owner chooses whom to pay.</li>
              </ol>
            </Section>
          ) : open ? (
            <Section title="How to answer" id="answer">
              <ol className="flex flex-col gap-4">
                <li>
                  <p>1. Fork {b.repository} and branch from this branch (commit <code className="text-sm">{b.work_commit.slice(0, 12)}</code>):</p>
                  <CodeBlock lines={[b.branch]} what="branch name" className="mt-2" />
                </li>
                <li>2. Open a pull request against that branch in {b.repository}, not against {b.default_branch}.</li>
              </ol>
            </Section>
          ) : null}


          <Section title="Solutions" id="solutions">
            {b.solutions.length === 0 ? <p>No solution yet.</p> : (
              <ul className="border-b border-line">
                {b.solutions.map(s => <li key={s.number} className="border-t border-line py-3"><a href={s.url} rel="nofollow noopener">Pull request #{s.number}</a> by <a href={`/solver/${s.author}/`}>{s.author}</a>: {s.state}</li>)}
              </ul>
            )}
            <Soft className="mt-3">The board lists them; it does not judge or rank them.</Soft>
          </Section>

          <details className="mt-14 border-t border-line pt-4" id="history">
            <summary className="font-medium">History</summary>
            <ul className="mt-3 flex flex-col gap-2 text-soft">
              {b.history.map((line, i) => <li key={i}>{fmtDate(line.at)}: {line.event}. <Soft as="span">Source: {SOURCE[line.source]}.</Soft></li>)}
            </ul>
          </details>
        </div>
      </div>
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
