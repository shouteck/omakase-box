'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Card from './Card.jsx';
import { Quiet } from './ui.jsx';
import { useOverlay } from '../lib/client.js';
import { bounties, filterBounties, languages, repositoryNames, BOARD_READ_AT, plural } from '../lib/facts.mjs';

const PAGE = 20;
const EMPTY = { query: '', language: '', min_reward: '', owner_record: '', solutions: '', max_age_days: '', approved_by: '', repository: '', sort: 'newest' };

function Select({ label, name, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-soft">
      {label}
      <select name={name} value={value} onChange={e => onChange(name, e.target.value)} className="border border-soft bg-paper text-ink text-base px-2 py-1.5 rounded-sm">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

export default function Board() {
  const overlay = useOverlay();
  const [q, setQ] = useState(EMPTY);
  const [mode, setMode] = useState('normal'); // prototype states: normal | empty | error
  useEffect(() => { const s = new URLSearchParams(window.location.search).get('state'); if (s === 'empty' || s === 'error') setMode(s); }, []);
  const set = (k, v) => setQ(cur => ({ ...cur, [k]: v }));
  const source = mode === 'empty' ? [] : bounties;
  const allOpen = useMemo(() => filterBounties(source), [source]);
  const list = useMemo(() => filterBounties(source, q), [source, q]);
  const filtered = JSON.stringify(q) !== JSON.stringify(EMPTY);
  const shown = list.slice(0, PAGE);
  const read = new Date(BOARD_READ_AT).toISOString().slice(11, 16);

  return (
    <div>
      <form role="search" onSubmit={e => e.preventDefault()} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-soft">
          Search
          <input type="search" value={q.query} onChange={e => set('query', e.target.value)} placeholder="Words in a title or repository" className="border border-soft bg-paper text-ink text-base px-3 py-2 rounded-sm placeholder:text-soft" />
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Select label="Language" name="language" value={q.language} onChange={set} options={[['', 'Any'], ...languages.map(l => [l, l])]} />
          <Select label="Stated reward" name="min_reward" value={q.min_reward} onChange={set} options={[['', 'Any'], ['1', '$1 or more'], ['25', '$25 or more'], ['50', '$50 or more'], ['100', '$100 or more']]} />
          <Select label="Owner's payment record" name="owner_record" value={q.owner_record} onChange={set} options={[['', 'Any'], ['confirmed-payments', 'Has confirmed payments'], ['no-history', 'No history yet']]} />
          <Select label="Sort" name="sort" value={q.sort} onChange={set} options={[['newest', 'Newest first'], ['reward', 'Highest reward first']]} />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-accent">More filters</summary>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <Select label="Solutions" name="solutions" value={q.solutions} onChange={set} options={[['', 'Any'], ['none', 'None yet'], ['some', 'Some waiting']]} />
            <Select label="Posted" name="max_age_days" value={q.max_age_days} onChange={set} options={[['', 'Any time'], ['7', 'Last 7 days'], ['30', 'Last 30 days']]} />
            <Select label="Posting approved" name="approved_by" value={q.approved_by} onChange={set} options={[['', 'Any'], ['owner-this-bounty', 'By the owner, this bounty'], ['owner-standing-rule', 'By the owner\'s standing rule']]} />
            <Select label="Repository" name="repository" value={q.repository} onChange={set} options={[['', 'Any'], ...repositoryNames.map(r => [r, r])]} />
          </div>
        </details>
      </form>

      {mode === 'error' ? (
        <p role="status" className="mt-8 border-l-2 border-accent pl-4">
          The board could not read GitHub after {read} UTC: GitHub&apos;s rate limit for this hour is used up. What you see is from {read} UTC.
          Nothing to do: the board tries again every 15 minutes.
        </p>
      ) : null}

      <p className="mt-10 text-sm text-soft" aria-live="polite">
        {filtered ? `${list.length} of ${plural(allOpen.length, 'open bounty', 'open bounties')} match.` : `${plural(allOpen.length, 'open bounty', 'open bounties')}.`}{' '}
        {filtered ? <Quiet onClick={() => setQ(EMPTY)}>Clear filters</Quiet> : null}
        {' '}Titles are the posters&apos; own words.
      </p>

      {allOpen.length === 0 ? (
        <div className="mt-6 border-t border-line pt-6">
          <p>No open bounties on the board yet.</p>
          <p className="mt-2 text-soft">A bounty appears here a few minutes after someone posts one on a public GitHub repository. <Link href="/how/">How it works</Link></p>
        </div>
      ) : list.length === 0 ? (
        <div className="mt-6 border-t border-line pt-6">
          <p>No open bounty matches these filters.</p>
          <p className="mt-2 text-soft">Next: <Quiet onClick={() => setQ(EMPTY)}>clear the filters</Quiet>, or follow new bounties by <a href="/rss.xml">RSS</a>.</p>
        </div>
      ) : (
        <>
          <ul className="mt-2">{shown.map(b => <Card key={b.id} b={b} overlay={overlay} />)}</ul>
          <nav aria-label="Pages" className="border-t border-line pt-6 text-sm text-soft flex justify-between">
            <span>Showing 1–{shown.length} of {list.length}</span>
            <span>{list.length > PAGE ? <a href="#">Next page</a> : 'No more pages'}</span>
          </nav>
        </>
      )}
    </div>
  );
}
