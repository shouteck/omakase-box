'use client';
// Your bounties (PF21): every bounty the owner's agents posted, in the four stages a bounty moves through.
// The stages are figures that choose the list below (Catalyst's overview, Geist's tabs); the list is one shape in every
// view: the bounty, where it stands with the one fact that matters there, and the reward. The title opens the bounty,
// where it is paid: no second button to the same page (GitHub's and Stripe's lists act from the item's own page).
// One ink and its greys; the accent only where something waits on the owner, red only for the owner's card failing.
import { useRef, useState } from 'react';
import PayWindow from './PayWindow.jsx';

/** PF31: on a row you owe, the amount is the action: one button that opens the payment window. */
const PayButton = ({ b, onPay }) => <button type="button" data-pay-row={b.id} onClick={() => onPay(b.id)} className="rounded-full px-3.5 py-1.5 text-sm font-medium bg-button text-button-ink tabular-nums whitespace-nowrap">Pay ${b.reward}</button>;

const STAGES = [
  { key: 'waiting', name: 'Waiting for solutions', why: 'Open, with no solution yet.' },
  { key: 'solutions', name: 'Solutions in', why: 'Your agent chooses one and merges it.' },
  { key: 'due', name: 'Payment due', why: 'Merged, and waiting for you to pay.' },
  { key: 'paid', name: 'Paid', why: 'Done.' }
];
const NAMES = { ...Object.fromEntries(STAGES.map(stage => [stage.key, stage.name])), closed: 'Closed, none merged' };
const STEP = { waiting: 1, solutions: 2, due: 3, paid: 4 };
const PAGE = 20;

/** A circle that fills a quarter per stage and becomes a tick when paid: the order is in the shape, not in colours. */
function Glyph({ stage }) {
  if (stage === 'paid') return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="var(--color-ink)" /><path d="M5.2 8.3l1.9 1.9 3.7-4" fill="none" stroke="var(--color-paper)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (stage === 'closed') return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-soft)" strokeWidth="1.4"><circle cx="8" cy="8" r="6.25" /><path d="M5 11L11 5" /></svg>;
  const colour = stage === 'due' ? 'var(--color-accent)' : 'var(--color-ink)';
  const fill = { waiting: 'M8 8V4.4A3.6 3.6 0 0 1 11.6 8Z', solutions: 'M8 4.4A3.6 3.6 0 0 1 8 11.6Z', due: 'M8 8V4.4A3.6 3.6 0 1 1 4.4 8Z' }[stage];
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.25" stroke={colour} strokeWidth="1.4" /><path d={fill} fill={colour} /></svg>;
}

const DAY = 86400000;
/** "2 days ago", the way GitHub's lists say it; the exact date is in the title attribute. */
function ago(iso, now) {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  if (days < 1) return 'today';
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

const Solver = ({ login }) => <a href={`/solver/${login}/`} style={{ color: 'inherit' }}>{login}</a>;

/** The one fact that matters at this stage, in grey under the stage's name. */
function Detail({ b }) {
  if (b.stage === 'waiting') return b.solutions === 0 ? 'No solutions yet' : `${b.solutions} closed without a merge`;
  if (b.stage === 'solutions') return b.note ?? `${b.solutions} ${b.solutions === 1 ? 'solution' : 'solutions'}`;
  if (b.stage === 'due') return b.note ?? (b.merged ? <>Merged · <Solver login={b.merged} /></> : null);
  if (b.stage === 'paid') return <>{b.merged ? <><Solver login={b.merged} />{b.paid_by ? ' · ' : ''}</> : null}{b.paid_by}{b.note ? ` · ${b.note}` : ''}</>;
  return null;
}

function Row({ b, now, onPay }) {
  const pay = b.stage === 'due';
  return (
    <tr data-bounty={b.id} data-stage={b.stage} className="block sm:table-row border-b border-line py-3.5 sm:py-0">
      <td className="block sm:table-cell sm:py-4 sm:pr-3 align-middle">
        <a href={`/b/${b.id}/`} className="font-medium" style={{ color: 'var(--color-ink)' }}>{b.title}</a>
        <span className="flex justify-between gap-3 text-sm text-soft"><span title={b.created_at}>{b.repository} #{b.issue_number} · {ago(b.created_at, now)}</span><span className="sm:hidden tabular-nums" style={{ color: 'var(--color-ink)' }}>{pay ? <PayButton b={b} onPay={onPay} /> : `${b.reward}`}</span></span>
      </td>
      <td className="block sm:table-cell sm:py-4 sm:px-3 align-middle pt-2 sm:pt-4">
        <span className="inline-flex items-center gap-2 text-soft whitespace-nowrap"><Glyph stage={b.stage} />{NAMES[b.stage]}</span>
        <span data-detail className={`block text-sm pl-6 ${b.card_failed ? 'text-[var(--color-danger)]' : 'text-soft'}`}><Detail b={b} /></span>
      </td>
      <td className="hidden sm:table-cell sm:py-4 sm:pl-3 text-left tabular-nums align-middle">{pay ? <PayButton b={b} onPay={onPay} /> : `${b.reward}`}</td>
    </tr>
  );
}

/** The stage the list opens on: the one waiting on the owner, else the first that has something. */
const firstView = list => list.some(b => b.stage === 'due') ? 'due' : ['solutions', 'waiting', 'paid'].find(key => list.some(b => b.stage === key)) ?? 'all';

export default function Bounties({ bounties, now = Date.now() }) {
  const list = bounties.list;
  const [view, setView] = useState(() => firstView(list));
  const [page, setPage] = useState(0);
  const [paying, setPaying] = useState(null);
  const changed = useRef(false);
  const tabs = useRef([]);
  const choose = next => { setView(next); setPage(0); };
  if (list.length === 0) {
    return (
      <div data-no-bounties className="border-t border-line text-center py-14">
        <p className="font-medium">No bounties yet</p>
        <p className="text-sm text-soft max-w-[26rem] mx-auto mt-1">When your agent hands off a task it cannot finish, the bounty appears here and moves across the four stages.</p>
        <p className="mt-5"><code className="inline-block border border-line bg-card rounded-xl px-3.5 py-1.5"><span className="text-soft">$ </span>box bounty post</code></p>
        <p className="mt-4 text-sm"><a href="/how/">How it works</a></p>
      </div>
    );
  }
  const of = key => list.filter(b => b.stage === key);
  const shown = view === 'all' ? list : of(view);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const rows = shown.slice(page * PAGE, page * PAGE + PAGE);
  const stage = STAGES.find(entry => entry.key === view);
  const keys = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const at = STAGES.findIndex(entry => entry.key === view);
    const next = (Math.max(at, 0) + (event.key === 'ArrowRight' ? 1 : STAGES.length - 1)) % STAGES.length;
    choose(STAGES[next].key);
    tabs.current[next]?.focus();
  };
  const sum = rows => rows.reduce((total, b) => total + b.reward, 0);
  const closed = of('closed').length;
  return (
    <>
      <div role="tablist" aria-label="Stage" className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 sm:gap-x-6 gap-y-1" onKeyDown={keys}>
        {STAGES.map((entry, index) => {
          const count = of(entry.key).length;
          const on = view === entry.key;
          return (
            <button key={entry.key} ref={element => { tabs.current[index] = element; }} type="button" role="tab" aria-selected={on} tabIndex={on || (view === 'all' || view === 'closed') && index === 0 ? 0 : -1} data-stage-tab={entry.key} onClick={() => choose(entry.key)}
              className={`group relative text-left rounded-xl sm:rounded-none px-3 py-2.5 sm:px-0 sm:pt-3.5 sm:pb-1.5 sm:border-t border-line ${on ? 'bg-surface sm:bg-transparent' : ''}`}>
              <span aria-hidden="true" className={`hidden sm:block absolute inset-x-0 -top-px h-0.5 ${on ? 'bg-ink' : 'group-hover:bg-soft'}`} />
              <span className={`flex items-center gap-2 text-sm ${on ? 'text-ink font-medium' : 'text-soft'}`}>{entry.name}{entry.key === 'due' && count > 0 ? <span data-waiting-dot title="Waiting on you" className="size-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} /> : null}</span>
              <span className="flex items-baseline gap-2.5 mt-1">
                <span className={`text-xl sm:text-2xl font-medium tracking-tight tabular-nums ${count === 0 ? 'text-soft' : ''}`}>{count}</span>
                {count > 0 ? <span className="text-sm text-soft tabular-nums">${sum(of(entry.key)).toLocaleString('en-US')}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-10 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <div><p className="font-medium">{stage ? stage.name : view === 'all' ? 'All bounties' : NAMES.closed}</p><p className="text-sm text-soft">{stage ? stage.why : view === 'all' ? 'Newest first.' : 'Closed on GitHub with no solution merged.'}</p></div>
        <div className="flex gap-4 text-sm">
          <button type="button" data-view="all" onClick={() => choose('all')} className={view === 'all' ? 'font-medium text-ink' : 'text-soft'}>All {list.length}</button>
          <button type="button" data-view="closed" onClick={() => choose('closed')} className={view === 'closed' ? 'font-medium text-ink' : 'text-soft'}>Closed {closed}</button>
        </div>
      </div>
      {rows.length === 0
        ? <p data-none className="mt-3 border-t border-line py-8 text-center text-sm text-soft">None at this stage.</p>
        : (
          <table aria-label={stage ? stage.name : 'Your bounties'} className="w-full mt-3 text-[0.9375rem] border-collapse">
            <thead className="hidden sm:table-header-group"><tr className="text-sm text-soft text-left border-b border-line"><th scope="col" className="font-normal py-2.5 pr-3">Bounty</th><th scope="col" className="font-normal py-2.5 px-3">Stage</th><th scope="col" className="font-normal py-2.5 pl-3 text-left">Reward</th></tr></thead>
            <tbody className="border-t border-line sm:border-t-0">{rows.map(b => <Row key={b.id} b={b} now={now} onPay={setPaying} />)}</tbody>
          </table>
        )}
      {pages > 1 || bounties.more ? (
        <div className="flex justify-between items-center pt-3.5 text-sm text-soft">
          <span className="tabular-nums">{bounties.more ? `Your newest ${list.length} bounties. ` : ''}Showing {page * PAGE + 1}–{page * PAGE + rows.length} of {shown.length}</span>
          {pages > 1 ? <span className="flex gap-4"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="disabled:text-soft disabled:opacity-60">Previous</button><button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="disabled:opacity-60">Next</button></span> : null}
        </div>
      ) : null}
      {paying ? <PayWindow id={paying} open onClose={() => { setPaying(null); if (changed.current) window.location.reload(); }} onChange={() => { changed.current = true; }} /> : null}
    </>
  );
}
