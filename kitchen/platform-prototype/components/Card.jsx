import Link from 'next/link';
import { repoOf, ownerRecord, daysBetween, plural } from '../lib/facts.mjs';

export function ownerFacts(r) {
  if (!r.hasHistory) return 'no payment history yet';
  const parts = [`${r.merged} merged`, `${r.recordedPaid} recorded paid`, `${r.confirmedReceived} confirmed received`];
  if (r.owedNow) parts.push(`${r.owedNow} owed (oldest ${plural(r.oldestOwedDays, 'day')})`);
  if (r.saysNotReceived) parts.push(`${r.saysNotReceived} says not received`);
  return parts.join(' · ');
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
          The owner pays directly. <Link href={`/owner/${b.poster}/`}>{b.poster}</Link>: {ownerFacts(r)}
        </p>
      ) : null}
    </li>
  );
}
