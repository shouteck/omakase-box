import { BountyRefused } from './errors.js';
import { listRecords, loadRecord, postBounty } from './record.js';
import { loadSettings, readDecision, settingsFile, unknownSetting, writeDecision, writeRepository } from './settings.js';
import { repositoryAddress, repositoryIdentity, requireRepository } from './repository.js';

export const DECISION_WORDS = {
  allow: 'allow this repository',
  ask: 'be asked each time before publishing',
  once: 'this one bounty only'
} as const;
const disclosure = (address: string): string[] => [
  `Allowing ${address} means bounties are public under your GitHub account.`,
  'A solution the agent chooses is merged into your code. Merging is not gated.',
  'This decision covers this repository only. The tool closes an issue after a merge.',
  'These settings stop accidents and record changes; they are not a lock against an agent that deliberately changes them.'
];

export function allowRepository(repoRoot: string | null, name?: string, ask = false): string {
  if (name?.startsWith('bt-')) {
    if (ask || repoRoot === null) throw new BountyRefused('allow-arguments', 'a waiting bounty requires a repository and cannot use --ask; nothing changed');
    return allowBounty(repoRoot, name);
  }
  const address = name === undefined ? (repoRoot === null ? null : requireRepository(repoRoot)) : repositoryAddress(name);
  if (address === null) throw new BountyRefused('repository-address-invalid', 'allow needs a GitHub repository address, owner/name, or a waiting bounty; nothing changed');
  let currentAddress: string | null = null;
  if (repoRoot !== null) {
    try { currentAddress = repositoryIdentity(repoRoot); } catch { /* named addresses work outside this checkout */ }
  }
  const written = writeRepository(address, ask ? 'ask' : 'allowed');
  const lines = [...disclosure(address), `${ask ? 'ask me each time before publishing' : 'allowed'}: ${address}, written ${written.at} to ${written.path}.`];
  if (ask) lines.push('This covers publishing and nothing else. A merged solution closes the bounty without asking.');
  // A named repository may be allowed from outside any checkout. Release
  // waits only when the current checkout has that same address.
  if (!ask && repoRoot !== null && currentAddress === address) {
    for (const entry of listRecords(repoRoot)) {
      const record = entry.record;
      if (record?.stage !== 'waiting' || record.waiting?.for !== 'post' || record.waiting.to === undefined) continue;
      if (record.waiting.reason === 'secrets' || record.waiting.reason === 'untracked-file') {
        lines.push(`${record.id} still waits on the pre-publish check; box bounty allow ${record.id} answers that one hold.`);
        continue;
      }
      try {
        const posted = postBounty(repoRoot, record.id, record.waiting.to, { ...(record.waiting.choice === undefined ? {} : { choice: record.waiting.choice }) });
        lines.push(`${record.id}: the waiting bounty went out: ${posted.destination}`);
      } catch (error) {
        lines.push(`${record.id} still waits: ${error instanceof BountyRefused ? `${error.reason}: ${error.message}` : error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return lines.join('\n');
}
export function denyRepository(repoRoot: string | null, name?: string): string {
  const address = name === undefined ? (repoRoot === null ? null : requireRepository(repoRoot)) : repositoryAddress(name);
  if (address === null) throw new BountyRefused('repository-address-invalid', 'deny needs a GitHub repository address, owner/name; nothing changed');
  const written = writeRepository(address, null);
  return `${address}: not allowed; denied at ${written.at}. Removed from the active list. All-projects does not apply after deny. Open bounties are untouched.\nRe-allow: box bounty allow ${address}`;
}
export function allowBounty(repoRoot: string, id: string): string {
  const record = loadRecord(repoRoot, id);
  const waiting = record.waiting;
  if (record.stage !== 'waiting' || waiting?.for !== 'post' || waiting.to === undefined) throw new BountyRefused('owner-answer-not-waiting', `${id} is not waiting for a post; nothing changed. box bounty status ${id} shows its state`);
  const posted = postBounty(repoRoot, id, waiting.to, { answered: true, ...(waiting.choice === undefined ? {} : { choice: waiting.choice }) });
  return `${id}: answered once; posted to ${posted.destination}. No repository decision changed.`;
}
export function renderConfig(repoRoot: string | null): string {
  const settings = loadSettings();
  let address: string | null = null;
  let identityFact = 'no checkout selected';
  if (repoRoot !== null) {
    try { address = repositoryIdentity(repoRoot); identityFact = address ?? 'no GitHub address'; }
    catch (error) { identityFact = error instanceof BountyRefused ? `${error.reason}: ${error.message}` : String(error); }
  }
  const active = Object.entries(settings.repositories).filter(([, entry]) => entry.bounty === 'allowed' || entry.bounty === 'ask');
  const global = settings.default?.bounty === 'allowed' ? 'true' : settings.default?.bounty === 'ask' ? 'ask' : 'false (off by default)';
  const undecided = address === null ? 'a GitHub address for this checkout' : settings.repositories[address] === undefined && settings.default?.bounty !== 'allowed' && settings.default?.bounty !== 'ask'
    ? 'no repository permission for this repository' : 'none of the current permission choices';
  const lines = [
    `the owner's settings: ${settingsFile()}`,
    'Allowing a repository means bounties are public under your GitHub account and a solution the agent chooses is merged into your code. Each repository entry covers that repository only.',
    `this repository: ${identityFact}; add it: box bounty allow${address === null ? ' <owner/name>' : ` ${address}`}`,
    `all-projects: ${global}${settings.default === undefined ? ', nothing written' : `, changed ${settings.default.at}`}; applies to repositories without their own entry or removal; change: box bounty config set all-projects <true|false|ask>`,
    `repositories: ${active.length} active; add: box bounty config add repositories <owner/name>; remove: box bounty config remove repositories <owner/name>`,
    `  ${DECISION_WORDS.allow}: box bounty allow${address === null ? ' <owner/name>' : ` ${address}`}`,
    `  ${DECISION_WORDS.ask}: box bounty allow${address === null ? ' <owner/name>' : ` ${address}`} --ask`,
    `  ${DECISION_WORDS.once}: box bounty allow <waiting-bounty-id>`,
    'ask me each time covers publishing and nothing else; merging is not gated. A bounty whose solution is merged closes without asking.',
    `not decided yet: ${undecided}; decide with box bounty allow${address === null ? ' <owner/name>' : ` ${address}`}`
  ];
  for (const [key, entry] of Object.entries(settings.repositories)) {
    lines.push(`  ${key}: ${entry.bounty === null || entry.bounty === 'off' ? `not allowed; denied at ${entry.at}; all-projects does not apply after deny` : `${entry.bounty === 'ask' ? DECISION_WORDS.ask : 'allowed'}, added ${entry.changes[0]?.at ?? entry.at}, changed ${entry.at}`}; change: box bounty allow ${key}${entry.bounty === 'ask' ? '' : ' --ask'}; remove: box bounty deny ${key}`);
    for (const previous of entry.changes) lines.push(`    history: ${previous.bounty ?? 'denied'} at ${previous.at}; re-allow: box bounty allow ${key}`);
  }
  for (const notice of settings.migrations) lines.push(`migration ${notice.at}: ${JSON.stringify(notice.path)} ${notice.detail}; re-add: box bounty allow ${notice.repository ?? '<owner/name>'}`);
  for (const [key, notice] of Object.entries(settings.firstMerges)) lines.push(`first outside solution merged in ${key}: commit ${notice.commit} at ${notice.at}; see: box bounty status --full`);
  return lines.join('\n');
}
export function changeConfig(repoRoot: string | null, verb: string, name: string, value: string): string {
  if (name === 'repositories' && (verb === 'add' || verb === 'remove')) return verb === 'add' ? allowRepository(repoRoot, value) : denyRepository(repoRoot, value);
  if (name !== 'all-projects') return unknownSetting(name);
  if (verb !== 'set' || !['true', 'false', 'ask'].includes(value)) throw new BountyRefused('config-value-invalid', 'use box bounty config set all-projects <true|false|ask>; nothing changed');
  const bounty = value === 'true' ? 'allowed' : value === 'ask' ? 'ask' : 'off';
  const written = writeDecision(repoRoot ?? '.', 'default', bounty);
  return `all-projects: ${value}, written ${written.at}. ${value === 'true' ? 'Bounties may be public under your GitHub account across all projects; solutions the agent chooses are merged into your code.' : 'Each post needs a repository permission or one-bounty answer.'} Dated deny exceptions stay not allowed. Merging is not gated.`;
}

export function renderSummary(repoRoot: string, since?: string): string {
  let from = '';
  if (since !== undefined) {
    if (!Number.isFinite(Date.parse(since))) throw new BountyRefused('summary-time-invalid', `--since ${since} is not a readable time; pass an ISO time`);
    from = new Date(since).toISOString();
  }
  const posted: string[] = [], merged: string[] = [], closed: string[] = [], waiting: string[] = [];
  for (const entry of listRecords(repoRoot)) {
    const record = entry.record;
    if (record === null) continue;
    for (const event of record.events) {
      if (event.at < from) continue;
      if (event.stage === 'posted') posted.push(`${record.id} at ${event.at} (${event.destination ?? 'unspecified destination'})`);
      else if (event.stage === 'applied') merged.push(`${record.id} at ${event.at} (merge ${event.merge ?? 'unnamed'})`);
      else if (['rejected', 'withdrawn', 'expired', 'undone'].includes(event.stage)) closed.push(`${record.id} ${event.stage} at ${event.at}`);
    }
    if (record.waiting !== undefined) waiting.push(`${record.id} (${record.waiting.reason}, since ${record.waiting.at})`);
  }
  const read = readDecision(repoRoot);
  return [`what was done since ${since === undefined ? 'the beginning' : from}: facts from the record`, `  bounties posted: ${posted.length}: ${posted.join('; ')}`, `  solutions merged: ${merged.length}: ${merged.join('; ')}`, `  bounties closed with none: ${closed.length}: ${closed.join('; ')}`, `  waiting now: ${waiting.length}: ${waiting.join('; ')}`, `the owner's decision is ${read.decision ?? 'nothing written'}`].join('\n');
}
