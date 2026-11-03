'use client';
import { useEffect, useState } from 'react';
import { Facts, plural, SampleNote, Soft, Stale } from './ui.jsx';

const dollars = n => `$${Number(n).toLocaleString('en-US')}`;
const or = (value, none) => value === null || value === undefined ? none : value;

/** The board as a whole (PF29): each number with what it counts, read from /numbers.json. */
export default function Numbers() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { fetch('/numbers.json').then(response => response.json()).then(setData).catch(() => setFailed(true)); }, []);
  if (failed) return <p role="status">The numbers could not be read just now. Nothing to do: reload the page in a minute.</p>;
  if (data === null) return <p className="text-soft">Reading the numbers…</p>;
  const { bounties, rewards, payments, last_30_days: recent, pull_requests: pulls, attempts_per_bounty: attempts, solvers, days_to_decision: days } = data;
  return (
    <>
      <SampleNote data={{ sample: data.sample_data }} />
      <Stale data={data} />
      <Facts rows={[
        ['Bounties listed', `${bounties.listed}; open now ${bounties.open}, of which ${bounties.open_with_reward} ${bounties.open_with_reward === 1 ? 'states' : 'state'} a reward above $0`],
        ['Rewards on open bounties', dollars(rewards.stated_on_open_bounties_usd)],
        ['Pays on merge', `${plural(rewards.pays_on_merge.bounties, 'open bounty', 'open bounties')}, ${dollars(rewards.pays_on_merge.usd)}`],
        ['No attempt yet', `${plural(rewards.no_attempt_yet.bounties, 'open bounty', 'open bounties')} with a reward, ${dollars(rewards.no_attempt_yet.usd)}`],
        ['Merged with a reward', payments.merged_with_reward === 0 ? 'none yet' : `${payments.merged_with_reward}: ${payments.recorded_paid} recorded paid, ${payments.confirmed_received} confirmed received, ${payments.says_not_received} said not received`],
        ['Owed now', payments.owed_now.bounties === 0 ? 'nothing' : `${plural(payments.owed_now.bounties, 'bounty', 'bounties')}, ${dollars(payments.owed_now.usd)}; the oldest ${plural(payments.owed_now.oldest_days, 'day', 'days')}`],
        ['Last 30 days', `${plural(recent.posted, 'bounty', 'bounties')} posted, ${plural(recent.merged, 'pull request', 'pull requests')} by others merged`],
        ['Pull requests by others', `${pulls.merged} merged, ${pulls.closed} closed without a merge, ${pulls.open} open`],
        ['Pull requests per bounty', attempts.bounties === 0 ? 'none yet' : `median ${attempts.median}, over ${plural(attempts.bounties, 'bounty', 'bounties')} with any`],
        ['Solvers', plural(solvers.distinct, 'GitHub account')],
        ['Days to a decision', days.bounties === 0 ? 'none decided yet' : `median ${or(days.median, 0)}, over ${plural(days.bounties, 'bounty', 'bounties')} decided`]
      ]} />
      <Soft className="mt-6">Pull requests by others leave out the poster's own and any by an owner, member or collaborator of the repository. Recorded paid is the owner's word, or the provider's for a payment through the board; confirmed and not received are the solver's. The same numbers, for programs: /numbers.json.</Soft>
    </>
  );
}
