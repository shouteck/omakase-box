'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Facts, Section, Primary, Quiet, Soft, TheirWords } from './ui.jsx';
import { ownerFacts } from './Card.jsx';
import { useOverlay, useSession, useOwnerOnly, recordPaid, confirmReceipt, undoClicks } from '../lib/client.js';
import {
  findBounty, withOverlay, repoOf, stateOf, STATES, payeeOf, wordsOf, ownerRecord, isSelfDealt, historyOf,
  visibleMethods, METHOD_LABEL, daysBetween, fmtDate, plural,
} from '../lib/facts.mjs';

const SOURCE = { github: 'GitHub', 'project-record': 'the project\'s record on GitHub', board: 'on this board' };

export function MethodItem({ m, note }) {
  return (
    <li>{METHOD_LABEL[m.kind]}{m.chain ? ` on ${m.chain}` : ''}: <span className="break-all">{m.kind === 'wise' || m.kind === 'wallet' ? <code className="text-sm">{m.value}</code> : <a href={m.value} rel="nofollow noopener">{m.value}</a>}</span>
      {note ? <Soft as="span"> ({note})</Soft> : null}
    </li>
  );
}

/** A solver's methods on a bounty page. Owner-only ones come from the server, and only where the rule allows (facts.mjs mayseeOwnerOnly). */
function Methods({ login, viewer, b, hiddenWhy, next }) {
  const { shown, ownerOnly, mayFetch } = visibleMethods(login, viewer, b);
  const extra = useOwnerOnly(login, viewer, b.id, mayFetch);
  if (!shown.length && !ownerOnly) return <p>{login} has not listed a payment method yet. Next: ask on the GitHub issue how they want to be paid.</p>;
  const withheld = ownerOnly && !mayFetch;
  return (
    <>
      {shown.length || extra.state === 'shown' ? (
        <ul className="list-disc pl-5">
          {shown.map((m, i) => <MethodItem key={i} m={m} />)}
          {extra.state === 'shown' ? extra.methods.map((m, i) => <MethodItem key={`o${i}`} m={m} note={`${login} shows this only to an owner who owes them; you see it because this bounty owes ${login} and the payment is not recorded`} />) : null}
        </ul>
      ) : null}
      {extra.state === 'loading' ? <Soft className="mt-2">Asking the board for the {plural(ownerOnly, 'method')} {login} shows only to an owner who owes them…</Soft> : null}
      {extra.state === 'error' ? <p role="status" className="mt-2">{extra.error}</p> : null}
      {withheld ? <Soft className="mt-2">{plural(ownerOnly, shown.length ? 'more method' : 'method')} {login} shows only to an owner who owes them, on that bounty&apos;s page{hiddenWhy ? `: ${hiddenWhy}` : ''}.</Soft> : null}
      {withheld && !shown.length && next ? <p className="mt-2">{next}</p> : null}
      <Soft className="mt-2">Listed by {login} on their profile. The board does not check that these accounts are theirs.</Soft>
    </>
  );
}

/** A status line that takes focus when it appears after a click (L3), so keyboard and screen-reader users land on it. */
function Status({ children, focus }) {
  const ref = useRef(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [focus]);
  return <p ref={ref} tabIndex={-1} role="status" className="border-l-2 border-accent pl-4">{children}</p>;
}

/** More than one pull request merged: the owner owes one reward and names the payee when recording it (M1). */
function OwnerDecides({ b, payee, isOwner, viewer, onRecord }) {
  const [to, setTo] = useState(payee.prs[0].author);
  return (
    <div className="flex flex-col gap-4">
      <p>
        <strong className="font-semibold">Owed by <Link href={`/owner/${b.poster}/`}>{b.poster}</Link>: ${b.reward}, to one of the authors below</strong>, since {fmtDate(payee.mergedAt)} ({plural(daysBetween(payee.mergedAt), 'day')}).{' '}
        GitHub marks more than one pull request merged: {payee.prs.map((p, i) => <span key={p.pr}>{i ? ' and ' : ''}#{p.pr} by <Link href={`/solver/${p.author}/`}>{p.author}</Link></span>)}. The terms pay one merged solution, so the owner decides whom to pay. It counts as owed in {b.poster}&apos;s record until they record whom they paid.{' '}
        <Soft as="span">Source: GitHub.</Soft>
      </p>
      {isOwner ? (
        <div className="border-t border-line pt-6 mt-2 flex flex-col gap-6">
          <p className="font-semibold">Decide whom to pay, pay them directly by a method they listed, then record it.</p>
          {payee.prs.map(p => (
            <div key={p.pr}>
              <p className="mb-2">{p.author}, pull request #{p.pr}:</p>
              <Methods login={p.author} viewer={viewer} b={b}
                hiddenWhy={`until you record whom you paid, the board cannot say you owe ${p.author}`}
                next={`Next: ask on pull request #${p.pr} how ${p.author} wants to be paid.`} />
            </div>
          ))}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2">Whom did you pay?</legend>
            {payee.prs.map(p => (
              <label key={p.pr} className="flex items-center gap-2"><input type="radio" name="payee" value={p.author} checked={to === p.author} onChange={() => setTo(p.author)} /> {p.author} (pull request #{p.pr})</label>
            ))}
          </fieldset>
          <div><Primary onClick={() => { recordPaid(b.id, b.reward, to); onRecord(); }}>Record ${b.reward} paid to {to}</Primary></div>
          <Soft>Solvers will see &ldquo;Recorded paid by {b.poster} to {to}&rdquo; as your word, and only {to} can confirm receipt. Recording moves no money.</Soft>
        </div>
      ) : null}
    </div>
  );
}

/** "This bounty's payment": every fact with whose word it is. */
function Payment({ b, viewer, overlay }) {
  const [clickedNow, setClickedNow] = useState(false);
  const state = stateOf(b);
  const payee = payeeOf(b);
  const { recordedPaid, solverWord } = wordsOf(b);
  const isOwner = viewer === b.poster;
  const isPayee = payee.kind === 'one' && viewer === payee.login;
  const clicked = overlay[b.id];
  const after = fn => () => { fn(); setClickedNow(true); };

  if (b.reward === 0) return <p>No reward is stated, so nothing is owed.</p>;
  if (state === 'closed-none') return <p>Closed without a merge on {fmtDate(b.closedAt)}. Nothing is owed.</p>;
  if (payee.kind === 'none') return <p>Nothing is owed yet. When a solution is merged, its author is owed ${b.reward} by the owner, paid directly.</p>;
  if (payee.kind === 'owner-decides') return <OwnerDecides b={b} payee={payee} isOwner={isOwner} viewer={viewer} onRecord={() => setClickedNow(true)} />;

  const owedNow = state === 'merged-owed';
  return (
    <div className="flex flex-col gap-4">
      <p>
        <strong className="font-semibold">{owedNow ? 'Owed to' : 'Earned by'} <Link href={`/solver/${payee.login}/`}>{payee.login}</Link>: ${b.reward}</strong>{owedNow ? `, since ${fmtDate(payee.mergedAt)} (${plural(daysBetween(payee.mergedAt), 'day')})` : `, for the merge on ${fmtDate(payee.mergedAt)}`}.{' '}
        <Soft as="span">Source: GitHub records pull request #{payee.pr} as merged.</Soft>
      </p>
      {payee.chosenFrom ? <p>GitHub marks more than one pull request merged ({payee.chosenFrom.join(' and ')}); {b.poster} named {payee.login} when recording the payment. <Soft as="span">The owner&apos;s word.</Soft></p> : null}
      <p>
        {recordedPaid
          ? <>Recorded paid by <Link href={`/owner/${b.poster}/`}>{b.poster}</Link> on {fmtDate(recordedPaid.at)} (${recordedPaid.amount}). <Soft as="span">The owner&apos;s word{recordedPaid.source === 'memory' ? ', from the project\'s record on GitHub' : ', on this board'}.</Soft></>
          : <>Not recorded paid by {b.poster}.</>}
      </p>
      <p>
        {solverWord?.kind === 'received' ? <>Confirmed received by {payee.login} on {fmtDate(solverWord.at)}. <Soft as="span">The solver&apos;s word.</Soft></>
          : solverWord?.kind === 'not-received' ? <>{payee.login} says it has <strong className="font-semibold">not been received</strong>, as of {fmtDate(solverWord.at)}. <Soft as="span">The solver&apos;s word.</Soft></>
          : <>Not confirmed received by {payee.login}.</>}
      </p>
      {recordedPaid && solverWord?.kind === 'not-received' ? <p>The owner and the solver disagree. Both words are shown as theirs; the board does not decide between them.</p> : null}
      {isSelfDealt(b) ? <p>Not counted in anyone&apos;s record: {payee.login === b.poster ? `${payee.login} is the poster` : `GitHub lists ${payee.login} as ${payee.association} of the repository`}.</p> : null}

      {isOwner ? (
        <div className="border-t border-line pt-6 mt-2 flex flex-col gap-4">
          <p className="font-semibold">{owedNow ? `Pay ${payee.login} directly, by a method they listed:` : `${payee.login}'s public payment methods, for reference:`}</p>
          <Methods login={payee.login} viewer={viewer} b={b} hiddenWhy={owedNow ? null : 'it is not shown now that this payment is recorded'} />
        </div>
      ) : null}
      {isOwner && owedNow ? (
        <div className="flex flex-col gap-4">
          <p>Then record it here. Solvers will see &ldquo;Recorded paid by {b.poster}&rdquo; as your word, and {payee.login} can confirm receipt.</p>
          <div><Primary onClick={after(() => recordPaid(b.id, b.reward))}>Record ${b.reward} paid to {payee.login}</Primary></div>
          <Soft>Same as running <code>box bounty config set paid {b.id}</code> in your project. Recording moves no money.</Soft>
        </div>
      ) : null}
      {isOwner && recordedPaid && clicked?.paid ? (
        <Status focus={clickedNow}>Recorded. Solvers now see &ldquo;Recorded paid by {b.poster} on {fmtDate(recordedPaid.at)}&rdquo;. <Link href={`/owner/${b.poster}/`}>See what solvers see about you</Link> · <Quiet onClick={() => { undoClicks(b.id); setClickedNow(false); }}>Withdraw this record</Quiet></Status>
      ) : null}
      {isPayee && solverWord?.kind !== 'received' ? (
        <div className="border-t border-line pt-6 mt-2 flex flex-col gap-4">
          {recordedPaid ? <p>{b.poster} says they paid you ${recordedPaid.amount}. Has it arrived?</p> : <p>When {b.poster} pays you, confirm it here.</p>}
          <div className="flex flex-wrap items-center gap-6">
            <Primary onClick={after(() => confirmReceipt(b.id, payee.login, 'received'))}>Confirm I received ${b.reward}</Primary>
            {recordedPaid && solverWord?.kind !== 'not-received' ? <Quiet onClick={after(() => confirmReceipt(b.id, payee.login, 'not-received'))}>It has not arrived</Quiet> : null}
          </div>
          <Soft>Your answer is shown as your word, with the date. You can withdraw it.</Soft>
        </div>
      ) : null}
      {isPayee && clicked?.receipt ? <Status focus={clickedNow}>Saved as your word. <Quiet onClick={() => { undoClicks(b.id); setClickedNow(false); }}>Withdraw it</Quiet></Status> : null}
      {!isOwner && !isPayee && owedNow ? <Soft>The owner pays {payee.login} directly, by a method {payee.login} listed.</Soft> : null}
    </div>
  );
}

export default function BountyView({ id }) {
  const overlay = useOverlay();
  const viewer = useSession();
  const base = findBounty(id);
  if (!base) return null;
  const b = withOverlay(base, overlay);
  const repo = repoOf(b);
  const state = stateOf(b);
  const r = ownerRecord(b.poster, overlay);
  const mine = viewer ? b.solutions.filter(s => s.author === viewer) : [];
  const role = viewer === b.poster ? 'the owner' : payeeOf(b).login === viewer ? 'the solver who is owed' : viewer ? 'a signed-in solver' : 'a visitor';
  const approved = { 'owner-this-bounty': 'the owner said yes to this bounty before it was posted', 'owner-standing-rule': 'by the owner\'s tool under a standing permission, without asking each time' }[b.approvedBy];

  return (
    <article>
      <p className="text-sm text-soft mb-3"><Link href="/">Board</Link> / {repo.name} / {b.id}</p>
      <h1 className="text-2xl font-semibold tracking-tight max-w-prose">{b.title}</h1>
      <p className="mt-3 text-soft">{STATES[state].solver}</p>
      <Soft className="mt-1">You are viewing as {role}{viewer ? ` (${viewer})` : ''}.</Soft>
      {mine.length ? <p className="mt-3">You ({viewer}) have {mine.map(s => `pull request #${s.pr} (${s.state})`).join(' and ')} on this bounty.</p> : null}

      <div className="mt-10">
        <Facts rows={[
          ['Stated reward', b.reward > 0 ? <><strong className="font-semibold">${b.reward}</strong> for the merged solution. The owner pays its author directly; the board carries no money.</> : 'None stated.'],
          ['This owner', <><Link href={`/owner/${b.poster}/`}>{b.poster}</Link>: {ownerFacts(r)}.{r.medianDaysToRecord !== null ? ` Usually records a payment ${r.medianDaysToRecord === 0 ? 'the day of the merge' : `${plural(r.medianDaysToRecord, 'day')} after the merge`}.` : ''} <Soft as="span">Merges: GitHub. The board sets no deadline.</Soft></>],
          ['Repository', <><a href={`https://github.com/${repo.name}`}>{repo.name}</a> · {repo.language} · public</>],
          ['Posted', <>{fmtDate(b.createdAt)} ({plural(daysBetween(b.createdAt), 'day')} ago), {approved ?? 'how posting was approved is not in the project\'s record'}.{approved ? <Soft as="span"> The owner&apos;s tool&apos;s word, from the project&apos;s record on GitHub.</Soft> : null} <a href={`https://github.com/${repo.name}/issues/${b.issue}`}>Issue #{b.issue}</a></>],
          ['Terms', 'The merged solution earns the whole reward. Other solutions earn nothing.'],
        ]} />
      </div>

      <Section title="The task" id="task">
        <TheirWords who={`The poster's words (${b.poster}), from the GitHub issue`}>{b.task}</TheirWords>
      </Section>

      {['open', 'solutions-waiting'].includes(state) ? (
        <Section title="How to answer" id="answer">
          <ol className="list-decimal pl-5 flex flex-col gap-2 max-w-prose">
            <li>Fork {repo.name} and branch from <code className="text-sm">box-bounty/{b.id}</code> (commit <code className="text-sm">{b.workCommit.slice(0, 12)}</code>).</li>
            <li>Open a pull request against <code className="text-sm">box-bounty/{b.id}</code> in {repo.name}, not against {repo.defaultBranch}.</li>
            {b.reward > 0 ? <li>You can answer without signing in. To be paid if yours is merged, <Link href="/me/#methods">list at least one way you accept payment</Link> first; the owner pays you directly.</li> : null}
          </ol>
          <div className="mt-6"><Primary href={`https://github.com/${repo.name}/tree/box-bounty/${b.id}`}>Open the bounty branch on GitHub</Primary></div>
        </Section>
      ) : null}

      <Section title="Payment for this bounty" id="payment">
        <Payment b={b} viewer={viewer} overlay={overlay} />
      </Section>

      <Section title="Solutions" id="solutions">
        {b.solutions.length === 0 ? <p>None yet.</p> : (
          <ul className="flex flex-col gap-2">
            {b.solutions.map(s => (
              <li key={s.pr}>
                <a href={`https://github.com/${repo.name}/pull/${s.pr}`}>Pull request #{s.pr}</a> by <Link href={`/solver/${s.author}/`}>{s.author}</Link>, {s.state}{s.state === 'merged' ? ` on ${fmtDate(s.mergedAt)}` : `, opened ${fmtDate(s.openedAt)}`}
              </li>
            ))}
          </ul>
        )}
        <Soft className="mt-3">Solutions are their authors&apos; work. The board lists them; it does not judge or rank them.</Soft>
      </Section>

      <Section title="History" id="history">
        <ol className="flex flex-col gap-2">
          {historyOf(b).map((h, i) => (
            <li key={i} className="grid grid-cols-[7.5rem_1fr] gap-4">
              <span className="text-sm text-soft tabular-nums pt-0.5">{fmtDate(h.at)}</span>
              <span>{h.event}, by {h.by} <Soft as="span">({SOURCE[h.source]})</Soft></span>
            </li>
          ))}
        </ol>
      </Section>
    </article>
  );
}
