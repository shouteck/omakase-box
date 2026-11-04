'use client';
// Your solutions (PF31c): every bounty this person answered, in the stage it is in, kept for good. The same list as the
// owner's Your bounties (Bounties.jsx): the stages are figures that choose the list, every row has one shape (the bounty,
// where it stands with the one fact that matters there, the amount). The accent marks what waits on someone: a payment
// due, or a payment recorded by hand that waits on this person's confirmation, where the amount is the Confirm button.
import { useRef, useState } from 'react';
import { ago, Glyph } from './Bounties.jsx';
import { fmtDate } from './ui.jsx';

const STAGES = [
  { key: 'progress', name: 'In progress', why: 'Your pull request is open.', glyph: 'solutions' },
  { key: 'due', name: 'Payment due', why: 'Merged, and waiting for the owner to pay.', glyph: 'due' },
  { key: 'paid', name: 'Paid', why: 'Paid, or recorded paid by the owner.', glyph: 'paid' },
  { key: 'closed', name: 'Not merged', why: 'Closed without your solution merged.', glyph: 'closed' }
];
const NAMES = Object.fromEntries(STAGES.map(stage => [stage.key, stage.name]));
const GLYPHS = Object.fromEntries(STAGES.map(stage => [stage.key, stage.glyph]));
const PAGE = 20;
const CHECKS = { passing: 'checks passing', failing: 'checks failing', pending: 'checks running', none: 'no checks', unread: 'checks not read' };

/** The one fact that matters at this stage. */
function Detail({ s }) {
  if (s.note) return s.note;
  if (s.stage === 'progress') return [s.draft ? 'Draft' : 'Ready for review', CHECKS[s.checks]].filter(Boolean).join(' · ');
  if (s.stage === 'due') return <>Merged · owed by <a href={`/owner/${s.from}/`} style={{ color: 'inherit' }}>{s.from}</a> since {fmtDate(s.since)}{s.one_of ? ' · the owner chooses whom to pay' : ''}</>;
  if (s.stage === 'paid') return s.needs_confirm ? `Recorded paid by ${s.from}, by hand · not yet confirmed by you` : `${s.paid_by}${s.paid_at ? ` · ${fmtDate(s.paid_at)}` : ''}`;
  return 'Closed without a merge';
}

const waits = s => s.stage === 'due' || (s.stage === 'paid' && s.needs_confirm);
const firstView = list => list.some(s => s.stage === 'due') ? 'due' : list.some(s => s.stage === 'paid' && s.needs_confirm) ? 'paid' : ['progress', 'paid', 'closed'].find(key => list.some(s => s.stage === key)) ?? 'all';

export default function Solutions({ solutions, onConfirm, now = Date.now() }) {
  const list = solutions?.list ?? [];
  const [view, setView] = useState(() => firstView(list));
  const [page, setPage] = useState(0);
  const tabs = useRef([]);
  const choose = next => { setView(next); setPage(0); };
  if (list.length === 0) {
    return (
      <div data-no-solutions className="border-t border-line text-center py-14">
        <p className="font-medium">No solutions yet</p>
        <p className="text-sm text-soft max-w-[26rem] mx-auto mt-1">When you open a pull request on a bounty, it appears here and moves across the four stages.</p>
        <p className="mt-4 text-sm"><a href="/board/">Open bounties</a></p>
      </div>
    );
  }
  const of = key => list.filter(s => s.stage === key);
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
  const amount = s => s.needs_confirm
    ? <button type="button" data-confirm-row={s.id} onClick={() => onConfirm(s)} className="rounded-full px-3.5 py-1.5 text-sm font-medium bg-button text-button-ink tabular-nums whitespace-nowrap">Confirm ${s.reward}</button>
    : `$${s.reward}`;
  return (
    <>
      <div role="tablist" aria-label="Stage" className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 sm:gap-x-6 gap-y-1" onKeyDown={keys}>
        {STAGES.map((entry, index) => {
          const count = of(entry.key).length;
          const on = view === entry.key;
          return (
            <button key={entry.key} ref={element => { tabs.current[index] = element; }} type="button" role="tab" aria-selected={on} tabIndex={on || view === 'all' && index === 0 ? 0 : -1} data-solution-tab={entry.key} onClick={() => choose(entry.key)}
              className={`group relative text-left rounded-xl sm:rounded-none px-3 py-2.5 sm:px-0 sm:pt-3.5 sm:pb-1.5 sm:border-t border-line ${on ? 'bg-surface sm:bg-transparent' : ''}`}>
              <span aria-hidden="true" className={`hidden sm:block absolute inset-x-0 -top-px h-0.5 ${on ? 'bg-ink' : 'group-hover:bg-soft'}`} />
              <span className={`flex items-center gap-2 text-sm ${on ? 'text-ink font-medium' : 'text-soft'}`}>{entry.name}{of(entry.key).some(waits) ? <span data-waiting-dot title="Waiting" className="size-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} /> : null}</span>
              <span className="flex items-baseline gap-2.5 mt-1">
                <span className={`text-xl sm:text-2xl font-medium tracking-tight tabular-nums ${count === 0 ? 'text-soft' : ''}`}>{count}</span>
                {count > 0 ? <span className="text-sm text-soft tabular-nums">${of(entry.key).reduce((total, s) => total + s.reward, 0).toLocaleString('en-US')}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-10 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <div><p className="font-medium">{stage ? stage.name : 'All your solutions'}</p><p className="text-sm text-soft">{stage ? stage.why : 'Newest first.'}</p></div>
        <div className="flex gap-4 text-sm"><button type="button" data-view="all" onClick={() => choose('all')} className={view === 'all' ? 'font-medium text-ink' : 'text-soft'}>All {list.length}</button></div>
      </div>
      {rows.length === 0
        ? <p data-none className="mt-3 border-t border-line py-8 text-center text-sm text-soft">None at this stage.</p>
        : (
          <table aria-label={stage ? stage.name : 'Your solutions'} className="w-full mt-3 text-[0.9375rem] border-collapse">
            <thead className="hidden sm:table-header-group"><tr className="text-sm text-soft text-left border-b border-line"><th scope="col" className="font-normal py-2.5 pr-3">Bounty</th><th scope="col" className="font-normal py-2.5 px-3">Stage</th><th scope="col" className="font-normal py-2.5 pl-3 text-left">Reward</th></tr></thead>
            <tbody className="border-t border-line sm:border-t-0">{rows.map(s => (
              <tr key={s.id} data-solution={s.id} data-stage={s.stage} className="block sm:table-row border-b border-line py-3.5 sm:py-0">
                <td className="block sm:table-cell sm:py-4 sm:pr-3 align-middle">
                  <a href={`/b/${s.id}/`} className="font-medium" style={{ color: 'var(--color-ink)' }}>{s.title}</a>
                  <span className="flex justify-between gap-3 text-sm text-soft"><span title={s.created_at}>{s.repository} #{s.issue_number} · pull request #{s.pull_number} · {ago(s.created_at, now)}</span><span className="sm:hidden tabular-nums" style={{ color: 'var(--color-ink)' }}>{amount(s)}</span></span>
                </td>
                <td className="block sm:table-cell sm:py-4 sm:px-3 align-middle pt-2 sm:pt-4">
                  <span className="inline-flex items-center gap-2 text-soft whitespace-nowrap"><Glyph stage={GLYPHS[s.stage]} />{NAMES[s.stage]}</span>
                  <span data-detail className="block text-sm pl-6 text-soft"><Detail s={s} /></span>
                </td>
                <td className="hidden sm:table-cell sm:py-4 sm:pl-3 text-left tabular-nums align-middle">{amount(s)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      {pages > 1 || solutions.more ? (
        <div className="flex justify-between items-center pt-3.5 text-sm text-soft">
          <span className="tabular-nums">{solutions.more ? `Your newest ${list.length} solutions. ` : ''}Showing {page * PAGE + 1}–{page * PAGE + rows.length} of {shown.length}</span>
          {pages > 1 ? <span className="flex gap-4"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="disabled:text-soft disabled:opacity-60">Previous</button><button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="disabled:opacity-60">Next</button></span> : null}
        </div>
      ) : null}
    </>
  );
}
