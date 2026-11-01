'use client';
// The front page's few newest bounties. With none, the section is not there at all:
// the board's own page says so and what to do. The whole list is /board/.
import { useEffect, useState } from 'react';
import { Card } from './Board.jsx';
import { SampleNote, Stale } from './ui.jsx';

const SHOWN = 3;

export default function Newest() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/board').then(async response => {
      if (response.ok) setData(await response.json());
    }).catch(() => undefined);
  }, []);
  if (data === null || data.open_total === 0) return null;
  return (
    <section className="mt-24 sm:mt-36" aria-labelledby="newest">
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <h2 id="newest" className="text-xl font-medium tracking-tight">Newest bounties</h2>
        <a href="/board/" className="font-medium">See all <span aria-hidden="true">›</span></a>
      </div>
      <SampleNote data={data} />
      <Stale data={data} />
      <ul className="border-b border-line">{data.bounties.slice(0, SHOWN).map(b => <Card key={b.id} b={b} />)}</ul>
      <p className="mt-3 text-sm text-soft">Titles are the posters&apos; own words.</p>
    </section>
  );
}
