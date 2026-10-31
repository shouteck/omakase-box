'use client';
import { useEffect, useRef, useState } from 'react';
import { Quiet, SampleNote, Stale, plural } from './ui.jsx';

const EMPTY = { query: '', language: '', min_reward: '', owner_record: '', sort: 'newest', solutions: '', max_age_days: '', approved_by: '', repository: '' };
const params = q => {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) if (value && value !== EMPTY[key]) out.set(key, value);
  return out;
};
const pageHref = (q, page) => { const p = params(q); if (page > 1) p.set('page', String(page)); const s = p.toString(); return s ? `/?${s}` : '/'; };

function Select({ label, name, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-soft">
      {label}
      <select name={name} value={value} onChange={e => onChange(name, e.target.value)} className="border border-soft bg-paper text-ink text-base px-2 py-1.5 rounded-sm min-w-0">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

/** A board card, K43's three lines. The title is the poster's words, as text. */
function Card({ b }) {
  return (
    <li className="border-t border-line py-6">
      <div className="flex items-baseline justify-between gap-6">
        <a href={`/b/${b.id}/`} className="text-lg font-semibold no-underline hover:underline focus-visible:underline min-w-0 break-words" style={{ color: 'var(--color-ink)' }}>{b.title}</a>
        {b.amount > 0
          ? <span className="text-lg font-semibold tabular-nums whitespace-nowrap">${b.amount}</span>
          : <span className="text-sm text-soft whitespace-nowrap">No reward</span>}
      </div>
      <p className="mt-1 text-sm text-soft break-words">
        {[b.repository, b.language, b.age_days === 0 ? 'posted today' : `${plural(b.age_days, 'day')} old`, b.solutions_open ? `${plural(b.solutions_open, 'solution')} waiting` : 'no solutions yet'].filter(Boolean).join(' · ')}
      </p>
      <p className="mt-2 text-sm">Posted by {b.poster}{b.amount > 0 ? ', who pays the solver directly' : ''}: <RecordLine record={b.record} /></p>
    </li>
  );
}

/** K43's line: a dispute or a debt older than 14 days first, in semibold. Whose word each count is, every time. */
function RecordLine({ record }) {
  if (!record.has_history) return 'no payment history yet.';
  const first = [
    record.says_not_received > 0 ? `${plural(record.says_not_received, 'payment')} the solver says ${record.says_not_received === 1 ? 'has' : 'have'} not arrived` : null,
    record.oldest_owed_days > 14 ? `owes ${record.owed_now}, the oldest for ${record.oldest_owed_days} days` : null
  ].filter(Boolean);
  const rest = [
    `${record.merged} merged`,
    `${record.recorded_paid} paid by the owner's word`,
    `${record.confirmed_received} received by the solvers' word`,
    record.owed_now > 0 && record.oldest_owed_days <= 14 ? `${record.owed_now} owed for ${plural(record.oldest_owed_days, 'day')}` : null
  ].filter(Boolean);
  return <>{first.length > 0 ? <span className="font-semibold">{first.join(' · ')} · </span> : null}{rest.join(' · ')}.</>;
}

export default function Board() {
  const [q, setQ] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [ready, setReady] = useState(false);
  const asked = useRef(0);

  useEffect(() => {
    const url = new URLSearchParams(window.location.search);
    const next = { ...EMPTY };
    for (const key of Object.keys(EMPTY)) if (url.get(key)) next[key] = url.get(key);
    setQ(next);
    setPage(Math.max(1, Number(url.get('page')) || 1));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const ask = ++asked.current;
    const href = pageHref(q, page);
    const timer = setTimeout(async () => {
      window.history.replaceState(null, '', href);
      try {
        const response = await fetch(`/api/board${href.slice(1)}`);
        const body = await response.json();
        if (ask !== asked.current) return;
        if (!response.ok) { setFailure(body.error); return; }
        setFailure(null);
        setData(body);
      } catch {
        if (ask === asked.current) setFailure('The board could not be reached. Next: reload this page.');
      }
    }, q.query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [q, page, ready]);

  const set = (key, value) => { setQ(current => ({ ...current, [key]: value })); setPage(1); };
  const clear = () => { setQ(EMPTY); setPage(1); };
  const filtered = params(q).size > 0;

  return (
    <div>
      <SampleNote data={data} />
      <form role="search" onSubmit={e => e.preventDefault()} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-soft">
          Search
          <input type="search" maxLength={100} value={q.query} onChange={e => set('query', e.target.value)} placeholder="Words in a title or repository" className="border border-soft bg-paper text-ink text-base px-3 py-2 rounded-sm placeholder:text-soft" />
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Select label="Language" name="language" value={q.language} onChange={set} options={[['', 'Any'], ...(data?.languages ?? []).map(l => [l, l]), ...(q.language && !data?.languages?.includes(q.language) ? [[q.language, q.language]] : [])]} />
          <Select label="Stated reward" name="min_reward" value={q.min_reward} onChange={set} options={[['', 'Any'], ['1', '$1 or more'], ['25', '$25 or more'], ['50', '$50 or more'], ['100', '$100 or more']]} />
          <Select label="Owner's payment record" name="owner_record" value={q.owner_record} onChange={set} options={[['', 'Any'], ['confirmed-payments', 'A solver confirmed a payment'], ['confirmed-none-late', 'Confirmed, none disputed or late'], ['no-history', 'No history yet']]} />
          <Select label="Sort" name="sort" value={q.sort} onChange={set} options={[['newest', 'Newest first'], ['reward', 'Highest reward first']]} />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-accent">More filters</summary>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <Select label="Solutions" name="solutions" value={q.solutions} onChange={set} options={[['', 'Any'], ['none', 'None yet'], ['some', 'Some waiting']]} />
            <Select label="Posted" name="max_age_days" value={q.max_age_days} onChange={set} options={[['', 'Any time'], ['7', 'Last 7 days'], ['30', 'Last 30 days']]} />
            <Select label="Posting approved" name="approved_by" value={q.approved_by} onChange={set} options={[['', 'Any'], ['owner-this-bounty', 'By the owner, this bounty'], ['owner-standing-rule', 'By the owner\'s standing rule']]} />
            <Select label="Repository" name="repository" value={q.repository} onChange={set} options={[['', 'Any'], ...(data?.repositories ?? []).map(r => [r, r]), ...(q.repository && !data?.repositories?.includes(q.repository) ? [[q.repository, q.repository]] : [])]} />
          </div>
        </details>
      </form>

      <Stale data={data} />
      {failure ? <p role="status" className="mt-8 border-l-2 border-accent pl-4">{failure}</p> : null}

      {data === null ? (failure ? null : <p className="mt-10 text-sm text-soft" aria-live="polite">Reading the board.</p>) : (
        <>
          <p className="mt-10 text-sm text-soft" aria-live="polite">
            {filtered ? `${data.count} of ${plural(data.open_total, 'open bounty', 'open bounties')} match.` : `${plural(data.open_total, 'open bounty', 'open bounties')}.`}{' '}
            {filtered ? <Quiet onClick={clear}>Clear filters</Quiet> : null}{' '}
            Titles are the posters&apos; own words.
          </p>
          {data.open_total === 0 ? (
            <div className="mt-6 border-t border-line pt-6">
              <p>No open bounties on the board yet.</p>
              <p className="mt-2 text-soft">A bounty appears here a few minutes after someone posts one on a public GitHub repository. <a href="/how/">How it works</a></p>
            </div>
          ) : data.count === 0 ? (
            <div className="mt-6 border-t border-line pt-6">
              <p>No open bounty matches these filters.</p>
              <p className="mt-2 text-soft">Next: <Quiet onClick={clear}>clear the filters</Quiet>.</p>
            </div>
          ) : (
            <>
              <ul className="mt-2">{data.bounties.map(b => <Card key={b.id} b={b} />)}</ul>
              <nav aria-label="Pages" className="border-t border-line pt-6 text-sm text-soft flex justify-between gap-4">
                <span>Page {data.page} of {data.pages}, {plural(data.count, 'bounty', 'bounties')}</span>
                <span className="flex gap-4">
                  {data.page > 1 ? <a href={pageHref(q, data.page - 1)}>Previous page</a> : null}
                  {data.page < data.pages ? <a href={pageHref(q, data.page + 1)}>Next page</a> : 'No more pages'}
                </span>
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}
