import { BountyRefused } from './errors.js';
import { isOpenStage, listRecords, loadRecord, persistRecord, postBounty, promisedTotal } from './record.js';
import { loadSettings, localFirstMergeLine, readDecision, readReward, rewardNoticeLine, saveSettings, settingsFile, unknownSetting, writeDecision, writeRepository } from './settings.js';
import type { DecisionRead } from './settings.js';
import { relative } from 'node:path';
import { checkInstructionFile, checkInstructionMarkers, discoverInstructions, instructionNotices, syncInstructions } from './instructions.js';
import { checkInstructionSettingsWrite, readInstructions, writeInstructions } from './settings.js';
import { changePublishList, publishLists } from './never-ship.js';
import { repositoryAddress, repositoryIdentity, requireRepository } from './repository.js';

export const DECISION_WORDS = {
  allow: 'allow this repository',
  ask: 'be asked each time before publishing',
  once: 'this one bounty only'
} as const;
const disclosure = (address: string): string[] => {
  const { amount } = readReward();
  return [
    `Allowing ${address} means bounties are public under your GitHub account.`,
    'A solution the agent chooses is merged into your code. Merging is not gated.',
    'This decision covers this repository only. The tool closes an issue after a merge.',
    `Each bounty states the reward you have set — $${amount}${amount === 0 ? ', so no payment is promised' : ', a promise in your name you pay by hand'}. You set it with: box bounty config set reward <whole dollars>.`,
    'These settings stop accidents and record changes; they are not a lock against an agent that deliberately changes them.'
  ];
};

export function allowRepository(repoRoot: string | null, name?: string, ask = false, emitDisclosure?: (text: string) => void): string {
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
  const words = disclosure(address);
  const written = writeRepository(address, ask ? 'ask' : 'allowed', emitDisclosure === undefined ? undefined : () => emitDisclosure(words.join('\n')));
  const lines = [...(emitDisclosure === undefined ? words : []), `${ask ? 'ask me each time before publishing' : 'allowed'}: ${address}, written ${written.at} to ${written.path}.`];
  if (ask) lines.push('This covers publishing and nothing else. A merged solution closes the bounty without asking.');
  // A named repository may be allowed from outside any checkout. Release
  // waits only when the current checkout has that same address.
  if (!ask && repoRoot !== null && currentAddress === address) {
    for (const entry of listRecords(repoRoot)) {
      const record = entry.record;
      if (record?.stage !== 'waiting' || record.waiting?.for !== 'post' || record.waiting.to === undefined) continue;
      if (record.waiting.reason === 'secrets') {
        lines.push(`${record.id} still waits on the pre-publish scan — an answer cannot release it; decide in box bounty config: the path goes on safe to publish or never publish.`);
        continue;
      }
      if (record.waiting.reason === 'untracked-file') {
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
  if (waiting.reason === 'secrets') throw new BountyRefused('allow-scan-held', `${id} waits on the pre-publish scan — an owner answer cannot release it. Decide in box bounty config: the path goes on safe to publish or never publish; or the flagged content is removed and the post run again; nothing changed`);
  // The answer is recorded bound to what the owner was shown before the held
  // post reruns: a wait the rerun uncovers carries it forward for the same
  // post, and a later `post` reuses it only while the published state still
  // matches — drift drops it (github-preview-stale or a fresh wait).
  record.waiting = { ...waiting, answered: { at: new Date().toISOString(), ...(waiting.shown === undefined ? {} : { shown: waiting.shown }) } };
  persistRecord(repoRoot, record);
  const posted = postBounty(repoRoot, id, waiting.to, { answered: true, ...(waiting.choice === undefined ? {} : { choice: waiting.choice }) });
  return `${id}: answered once; posted to ${posted.destination}. No repository decision changed.`;
}
export function renderConfig(repoRoot: string | null): string {
  const settings = loadSettings();
  let address: string | null = null;
  let current: DecisionRead | null = null;
  let identityFact = 'no checkout selected';
  if (repoRoot !== null) {
    try { address = repositoryIdentity(repoRoot); identityFact = address ?? 'no GitHub address'; if (address !== null) current = readDecision(repoRoot); }
    catch (error) { identityFact = error instanceof BountyRefused ? `${error.reason}: ${error.message}` : String(error); }
  }
  const active = Object.entries(settings.repositories).filter(([, entry]) => entry.bounty === 'allowed' || entry.bounty === 'ask');
  const { amount: rewardAmount, limit: rewardLimit } = readReward();
  const global = settings.default?.bounty === 'allowed' ? 'true' : settings.default?.bounty === 'ask' ? 'ask' : 'false (off by default)';
  const undecided: string[] = [];
  if (address === null) undecided.push('a GitHub address for this checkout');
  else if (current?.decision === null && !current.denied) undecided.push('no repository permission for this repository');
  if (settings.default === undefined) undecided.push('all-projects (nothing written; defaults to off)');
  const effective = current === null ? 'permission cannot be read without one GitHub address' : current.denied || current.decision === 'off' && current.level === 'project'
    ? `not allowed; ${current.denied ? 'denied' : 'marked off'} at ${current.at}; the all-projects setting does not override this decision`
    : current.decision === null || current.decision === 'off' ? 'not allowed; no repository permission is written'
      : `${current.decision === 'ask' ? DECISION_WORDS.ask : 'allowed'}${current.level === 'default' ? ' by the all-projects setting' : ' by this repository entry'}, changed ${current.at}`;
  const lines = [
    `the owner's settings: ${settingsFile()}`,
    'Allowing a repository means bounties are public under your GitHub account and a solution the agent chooses is merged into your code. Each repository entry covers that repository only.',
    `this repository: ${identityFact}; ${effective}`,
    `all-projects: ${global}${settings.default === undefined ? ', nothing written' : `, changed ${settings.default.at}`}; change: box bounty config set all-projects <true|false|ask>`,
    '  true grants publication permission in repositories without their own decision; false grants no blanket permission; ask asks before each publication in repositories without their own decision.',
    '  A repository entry overrides all-projects. A dated deny removal keeps that repository not allowed even when all-projects is true or ask; box bounty allow <owner/name> re-allows it.',
    `repositories: ${active.length} active; adding grants standing publication permission: box bounty config add repositories <owner/name>; removing revokes it: box bounty config remove repositories <owner/name>`,
    `reward: $${rewardAmount} — what each new bounty states${rewardAmount === 0 ? '; no payment is promised' : ' — a promise in your name, paid by hand'}; a posted bounty keeps its amount; change: box bounty config set reward <whole dollars>`,
    `reward limit: ${rewardLimit === null ? 'not set — a reward above $0 needs it first' : `$${rewardLimit}`} — the most that may be promised across open bounties; change: box bounty config set reward-limit <whole dollars>`,
    'ask me each time covers publishing and nothing else; merging is not gated. A bounty whose solution is merged closes without asking.',
    `not decided yet: ${undecided.length === 0 ? 'nothing among the settings shown' : undecided.join('; ')}`
  ];
  if (address !== null) {
    if (current?.decision !== 'allowed') lines.push(`  ${DECISION_WORDS.allow}: box bounty allow ${address}`);
    if (current?.decision !== 'ask') lines.push(`  ${DECISION_WORDS.ask}: box bounty allow ${address} --ask`);
  }
  if (repoRoot !== null) {
    const publish = publishLists(repoRoot);
    lines.push(`never publish: ${publish.never.length === 0 ? 'none listed' : publish.never.join(', ')} — kept out of every bounty; change: box bounty config add never-publish <path>, or remove never-publish <path>`);
    lines.push(`safe to publish: ${publish.safe.length === 0 ? 'none listed' : publish.safe.join(', ')} — paths the pre-publish scan does not hold a bounty over; change: box bounty config add safe-to-publish <path>, or remove safe-to-publish <path>`);
    const choice = readInstructions(repoRoot);
    lines.push(`instructions: ${choice.enabled ? 'on' : 'off'}; change: box bounty config set instructions <true|false>`);
    lines.push(`instruction-file: ${choice.file ?? 'none chosen'}; choose any existing file: box bounty config set instruction-file <existing-path>`);
    const found = discoverInstructions(repoRoot);
    lines.push(`instruction files found: ${found.length === 0 ? 'none; name an existing file with box bounty config set instruction-file <existing-path>' : found.map(file => `${file.path}${file.refusal === undefined ? '' : ` (refused: ${file.refusal})`}`).join(', ')}`);
    lines.push(...instructionNotices(repoRoot, false));
    const listed = listRecords(repoRoot);
    const promised = promisedTotal(listed.filter(entry => entry.record !== null && isOpenStage(entry.record.stage)));
    lines.push(`promised across this repository's open bounties: $${promised}${rewardLimit === null ? ' — no limit is set' : ` of a $${rewardLimit} limit — $${rewardLimit - promised} left`}`);
    const waiting = listed.flatMap(entry => entry.record?.stage === 'waiting' && entry.record.waiting?.for === 'post' ? [entry.record] : []);
    for (const record of waiting) {
      lines.push(record!.waiting!.reason === 'secrets'
        ? `  ${record!.id} waits on the pre-publish scan — decide with the lists above: safe to publish or never publish the path`
        : `  ${DECISION_WORDS.once}: box bounty allow ${record!.id}`);
    }
    if (waiting.length === 0) lines.push('waiting posts: none; see current actions with box bounty status');
  }
  for (const [key, entry] of Object.entries(settings.repositories)) {
    lines.push(`  ${key}: ${entry.bounty === null || entry.bounty === 'off' ? `not allowed; denied at ${entry.at}; all-projects does not apply after deny` : `${entry.bounty === 'ask' ? DECISION_WORDS.ask : 'allowed'}, added ${entry.changes[0]?.at ?? entry.at}, changed ${entry.at}`}; change: box bounty allow ${key}${entry.bounty === 'ask' ? '' : ' --ask'}; remove: box bounty deny ${key}`);
    for (const previous of entry.changes) lines.push(`    history: ${previous.bounty ?? 'denied'} at ${previous.at}`);
  }
  const rewardNotice = rewardNoticeLine();
  if (rewardNotice !== null) lines.push(rewardNotice);
  for (const notice of settings.migrations) lines.push(`migration ${notice.at}: ${JSON.stringify(notice.path)} ${notice.detail}; re-add: box bounty allow ${notice.repository ?? '<owner/name>'}`);
  for (const [key, notice] of Object.entries(settings.firstMerges)) lines.push(`first outside solution merged in ${key}: commit ${notice.commit} at ${notice.at}; see: box bounty status --full`);
  const localMerge = repoRoot === null ? null : localFirstMergeLine(repoRoot);
  if (localMerge !== null) lines.push(localMerge);
  return lines.join('\n');
}
export function changeConfig(repoRoot: string | null, verb: string, name: string, value: string, emitDisclosure?: (text: string) => void): string {
  if (name === 'instructions' || name === 'instruction-file') {
    if (repoRoot === null || verb !== 'set') throw new BountyRefused('config-value-invalid', 'instruction settings require a checkout and config set; nothing changed');
    checkInstructionSettingsWrite(repoRoot);
    const previous = readInstructions(repoRoot);
    if (name === 'instructions') {
      if (value !== 'true' && value !== 'false') throw new BountyRefused('config-value-invalid', 'use box bounty config set instructions <true|false>; nothing changed');
      writeInstructions(repoRoot, { ...previous, enabled: value === 'true' });
      return [`instructions: ${value === 'true' ? 'on' : 'off'}; owner's settings outside the repository. Existing blocks remain when off.`, ...syncInstructions(repoRoot, true)].join('\n');
    }
    const file = checkInstructionFile(repoRoot, value);
    checkInstructionMarkers(file);
    writeInstructions(repoRoot, { ...previous, file: relative(repoRoot, file).replaceAll('\\', '/') });
    return [`instruction-file: ${value}; saved in the owner's settings. Enable or add the block: box bounty config set instructions true`, ...syncInstructions(repoRoot, true)].join('\n');
  }
  if ((name === 'never-publish' || name === 'safe-to-publish') && (verb === 'add' || verb === 'remove')) {
    if (repoRoot === null) throw new BountyRefused('config-value-invalid', `${name} lists paths inside one repository — run it inside a checkout; nothing changed`);
    return changePublishList(repoRoot, name, verb, value);
  }
  if (name === 'never-publish' || name === 'safe-to-publish') throw new BountyRefused('config-value-invalid', `use box bounty config add ${name} <path>, or config remove ${name} <path>; nothing changed`);
  if (name === 'repositories' && (verb === 'add' || verb === 'remove')) return verb === 'add' ? allowRepository(repoRoot, value, false, emitDisclosure) : denyRepository(repoRoot, value);
  if (name === 'reward' || name === 'reward-limit') {
    if (verb !== 'set') throw new BountyRefused('config-value-invalid', `use box bounty config set ${name} <whole dollars>; nothing changed`);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new BountyRefused('reward-amount-invalid', `"${value}" is not a whole dollar amount at or above 0; nothing changed`);
    const amount = Number(value);
    const settings = loadSettings();
    const at = new Date().toISOString();
    const lines: string[] = [];
    if (name === 'reward') {
      const limit = settings.rewardLimit?.amount ?? null;
      if (amount > 0 && (limit === null || limit < amount)) throw new BountyRefused('reward-needs-limit', limit === null
        ? 'a reward above $0 first needs the most that may be promised across open bounties — set it: box bounty config set reward-limit <whole dollars>; nothing changed'
        : `the open-bounty limit is $${limit}, below a $${amount} reward — raise it first: box bounty config set reward-limit <whole dollars>; nothing changed`);
      // The first amount above 0 is the moment the tool says in plain words
      // what a reward is — once ever, recorded so it is never repeated.
      const firstNaming = amount > 0 && settings.rewardPromiseSaid === undefined;
      saveSettings({ ...settings, reward: { amount, at }, ...(firstNaming ? { rewardPromiseSaid: at } : {}) });
      lines.push(`reward: $${amount}, written ${at} to ${settingsFile()} — each bounty posted now states it.`);
      if (firstNaming) lines.push('A bounty reward is a promise, made in your name, that you pay by hand — the tool never moves money.');
    } else {
      const reward = settings.reward?.amount ?? 0;
      if (amount < reward) throw new BountyRefused('limit-below-reward', `the reward is $${reward} — the limit on what open bounties may promise cannot be set below it; nothing changed`);
      saveSettings({ ...settings, rewardLimit: { amount, at } });
      lines.push(`reward limit: $${amount}, written ${at} to ${settingsFile()} — the most that may be promised across open bounties.`);
    }
    // Bounties already out keep the amount they were posted with — a change
    // here is for later bounties only, and the tool says so while any are
    // open. This repository is what the tool can see; the owner keeps the
    // limit with that horizon in mind.
    const open = repoRoot === null ? [] : listRecords(repoRoot).filter(entry => entry.record !== null && isOpenStage(entry.record.stage));
    const posted = open.filter(entry => entry.record!.reward !== undefined).length;
    if (posted > 0) lines.push(`${posted} open ${posted === 1 ? 'bounty keeps' : 'bounties keep'} the amount each was posted with — this changes later bounties only.`);
    else lines.push('a bounty keeps the amount it was posted with — this changes later bounties only.');
    if (repoRoot !== null) {
      const promised = promisedTotal(open);
      const limit = name === 'reward-limit' ? amount : settings.rewardLimit?.amount ?? null;
      lines.push(limit === null ? `promised now: $${promised} across this repository's open bounties; no limit is set` : `promised now: $${promised} across this repository's open bounties — $${limit - promised} left of the $${limit} limit`);
    }
    return lines.join('\n');
  }
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
  const posted: string[] = [], merged: string[] = [], closed: string[] = [], waiting: string[] = [], findings: string[] = [];
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
    // Scan findings are standing facts, not events — a settled one carries no
    // time of its own, so every finding on the record is reported, whatever
    // --since says about the events around it.
    for (const finding of record.scanFindings ?? []) {
      for (const hit of finding.hits) findings.push(`${record.id}: ${hit.path}:${hit.line} (${hit.rule}) — ${finding.settled ?? 'flagged — unsettled'}`);
    }
  }
  const read = readDecision(repoRoot);
  return [`what was done since ${since === undefined ? 'the beginning' : from}: facts from the record`, `  bounties posted: ${posted.length}: ${posted.join('; ')}`, `  solutions merged: ${merged.length}: ${merged.join('; ')}`, `  bounties closed with none: ${closed.length}: ${closed.join('; ')}`, `  waiting now: ${waiting.length}: ${waiting.join('; ')}`, `  scan findings: ${findings.length}: ${findings.join('; ')}`, `the owner's decision is ${read.decision ?? 'nothing written'}`].join('\n');
}
