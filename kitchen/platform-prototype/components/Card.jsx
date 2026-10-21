import Link from 'next/link';
import { repoOf, ownerRecord, daysBetween, plural, LATE_DAYS } from '../lib/facts.mjs';

/** The owner's record, each count with whose word it is; a dispute or a long debt comes first. */
export function ownerFacts(r) {
  if (!r.hasHistory) return 'no payment history yet';
  const warn = [];
  if (r.saysNotReceived) warn.push(r.saysNotReceived === 1 ? '1 payment the solver says has not arrived' : `${r.saysNotReceived} payments the solvers say have not arrived`);
  if (r.owedNow && r.oldestOwedDays > LATE_DAYS) warn.push(`owes ${r.owedNow}, the oldest for ${plural(r.oldestOwedDays, 'day')}`);
  const parts = [`${r.merged} merged`, `${r.recordedPaid} paid by the owner's word`, `${r.confirmedReceived} received by the solvers' word`];
  if (r.owedNow && !(r.oldestOwedDays > LATE_DAYS)) parts.push(`${r.owedNow} owed for ${plural(r.oldestOwedDays, 'day')}`);
  return <>{warn.length ? <strong className="font-semibold">{warn.join(' · ')}. </strong> : null}{parts.join(' · ')}</>;
}

export function Reward({ amount }) {
  return amount > 0
    ? <span className="text-lg font-semibold tabular-nums whitespace-nowrap">${amount}</span>
    : <span className="text-sm text-soft whitespace-nowrap">No reward</span>;
}

/** A board card: what, how much, will this owner pay, where, how busy, how old. */
export default function Card({ b, overlay }) {
  const repo = repoOf(b);
  const r = ownerRecord(b.poster, overlay);
  const open = b.solutions.filter(s => s.state === 'open').length;
  return (
    <li className="border-t border-line py-6">
      <div className="flex items-baseline justify-between gap-6">
        <Link href={`/b/${b.id}/`} className="text-lg font-semibold no-underline hover:underline focus-visible:underline" style={{ color: 'var(--color-ink)', textDecoration: undefined }}>{b.title}</Link>
        <Reward amount={b.reward} />
      </div>
      <p className="mt-1 text-sm text-soft">
        {repo.name} · {repo.language} · {daysBetween(b.createdAt) === 0 ? 'posted today' : `${plural(daysBetween(b.createdAt), 'day')} old`} · {open ? plural(open, 'solution') + ' waiting' : 'no solutions yet'}
      </p>
      {b.reward > 0 ? (
        <p className="mt-2 text-sm">
          Posted by <Link href={`/owner/${b.poster}/`}>{b.poster}</Link>, who pays the solver directly: {ownerFacts(r)}
        </p>
      ) : null}
    </li>
  );
}
