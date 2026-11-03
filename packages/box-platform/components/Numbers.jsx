'use client';
import { useEffect, useState } from 'react';
import { Facts, SampleNote, Soft, Stale } from './ui.jsx';

const dollars = n => `$${Number(n).toLocaleString('en-US')}`;
const or = (value, none) => value === null || value === undefined ? none : value;

/** The board as a whole (PF29): each number with what it counts, read from /numbers.json. */
export default function Numbers() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { fetch('/numbers.json').then(response => response.json()).then(setData).catch(() => setFailed(true)); }, []);
  if (failed) return <p role="status">The numbers could not be read just now. Nothing to do: reload the page in a minute.</p>;
  if (data === null) return <p className="text-soft">Reading the numbers…</p>;
  const { bounties, rewards, pull_requests: pulls, attempts_per_bounty: attempts, solvers, days_to_decision: days } = data;
  return (
    <>
      <SampleNote data={{ sample: data.sample_data }} />
      <Stale data={data} />
      <Facts rows={[
        ['Bounties listed', `${bounties.listed}; open now ${bounties.open}, of which ${bounties.open_with_reward} state a reward above $0`],
        ['Rewards on open bounties', dollars(rewards.stated_on_open_bounties_usd)],
        ['Recorded paid', `${rewards.recorded_paid.bounties} bounties, ${dollars(rewards.recorded_paid.usd)}`],
        ['Pull requests by others', `${pulls.merged} merged, ${pulls.closed} closed without a merge, ${pulls.open} open`],
        ['Pull requests per bounty', attempts.bounties === 0 ? 'none yet' : `median ${attempts.median}, over ${attempts.bounties} bounties with any`],
        ['Solvers', `${solvers.distinct} different GitHub accounts`],
        ['Days to a decision', days.bounties === 0 ? 'none decided yet' : `median ${or(days.median, 0)}, over ${days.bounties} bounties decided`]
      ]} />
      <Soft className="mt-6">Pull requests by others leave out the poster's own and any by an owner, member or collaborator of the repository. Recorded paid is the owner's word, or the provider's for a payment through the board. The same numbers, for programs: /numbers.json.</Soft>
    </>
  );
}
