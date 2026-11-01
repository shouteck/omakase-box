'use client';
// The front page's few newest bounties, K43's cards. The whole list is /board/.
import { useEffect, useState } from 'react';
import { Card } from './Board.jsx';
import { SampleNote, Stale } from './ui.jsx';

const SHOWN = 3;

export default function Newest() {
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  useEffect(() => {
    fetch('/api/board').then(async response => {
      const body = await response.json();
      if (response.ok) setData(body); else setFailure(body.error);
    }).catch(() => setFailure('The board could not be reached. Next: reload this page.'));
  }, []);
  if (failure !== null) return <p role="status" className="border-l-2 border-accent pl-4">{failure}</p>;
  if (data === null) return <p className="text-sm text-soft" aria-live="polite">Reading the board.</p>;
  return (
    <>
      <SampleNote data={data} />
      <Stale data={data} />
      {data.open_total === 0
        ? <p className="border-t border-line pt-6">No open bounties on the board yet. A bounty appears here a few minutes after someone posts one on a public GitHub repository.</p>
        : (
          <>
            <p className="text-sm text-soft">Titles are the posters&apos; own words.</p>
            <ul className="mt-2 border-b border-line">{data.bounties.slice(0, SHOWN).map(b => <Card key={b.id} b={b} />)}</ul>
          </>
        )}
      <p className="mt-6"><a href="/board/">See all</a></p>
    </>
  );
}
