import type { BountyRecord } from './record.js';
import type { GitHubPublication } from './github.js';

export const FORMAT_MARKER = '<!-- box-bounty-format';
export type FormatState = { readonly kind: 'open' } | { readonly kind: 'closed-none' } | { readonly kind: 'closed-merged'; readonly pullRequest: number; readonly commit: string };
export interface BountyFormat {
  /** Version 1 (pre-BT11a) carried a reward fixed at 0. Version 2 carries the
      amount the owner had set when the bounty was posted — the only change. */
  readonly schemaVersion: 1 | 2;
  readonly kind: 'box-bounty';
  readonly id: string;
  readonly repository: string;
  readonly workCommit: string;
  readonly branch: string;
  readonly withChanges: boolean;
  readonly createdAt: string;
  readonly state: FormatState;
  readonly reward: { readonly amount: number; readonly currency: 'USD' };
  readonly terms: 'merged-solution-earns-whole';
}
export type FormatRead = { readonly kind: 'absent' } | { readonly kind: 'invalid' } | { readonly kind: 'present'; readonly value: BountyFormat; readonly start: number };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{40}$/.test(value);
const keys = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).sort().join(',') === [...names].sort().join(',');
function parse(value: unknown): BountyFormat | null {
  if (!object(value) || !keys(value, ['schemaVersion', 'kind', 'id', 'repository', 'workCommit', 'branch', 'withChanges', 'createdAt', 'state', 'reward', 'terms'])) return null;
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) || value.kind !== 'box-bounty' || typeof value.id !== 'string' || !/^bt-[a-f\d]{12}$/.test(value.id)
    || typeof value.repository !== 'string' || !/^[A-Za-z\d_.-]+\/[A-Za-z\d_.-]+$/.test(value.repository)
    || !sha(value.workCommit) || value.branch !== `box-bounty/${value.id}` || typeof value.withChanges !== 'boolean'
    || typeof value.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString().slice(0, 19) !== value.createdAt.slice(0, 19)
    || value.terms !== 'merged-solution-earns-whole' || !object(value.reward) || !keys(value.reward, ['amount', 'currency']) || value.reward.currency !== 'USD' || !object(value.state)) return null;
  // Version 1's reward is fixed at 0; version 2 carries the amount the owner
  // had set at posting — a whole dollar amount at or above 0 and nothing else.
  const amount = value.reward.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0 || (value.schemaVersion === 1 && amount !== 0)) return null;
  let state: FormatState;
  if ((value.state.kind === 'open' || value.state.kind === 'closed-none') && keys(value.state, ['kind'])) state = { kind: value.state.kind };
  else if (value.state.kind === 'closed-merged' && keys(value.state, ['kind', 'pullRequest', 'commit']) && typeof value.state.pullRequest === 'number' && Number.isSafeInteger(value.state.pullRequest) && value.state.pullRequest > 0 && sha(value.state.commit)) state = { kind: 'closed-merged', pullRequest: value.state.pullRequest, commit: value.state.commit };
  else return null;
  return { schemaVersion: value.schemaVersion, kind: 'box-bounty', id: value.id, repository: value.repository, workCommit: value.workCommit, branch: value.branch, withChanges: value.withChanges, createdAt: value.createdAt, state, reward: { amount, currency: 'USD' }, terms: value.terms };
}
export function readFormat(body: string): FormatRead {
  const start = body.indexOf(FORMAT_MARKER);
  if (start < 0) return { kind: 'absent' };
  if (body.indexOf(FORMAT_MARKER, start + FORMAT_MARKER.length) >= 0) return { kind: 'invalid' };
  const match = /^<!-- box-bounty-format\n([^<]*?)\n-->\s*$/.exec(body.slice(start));
  if (match?.[1] === undefined) return { kind: 'invalid' };
  try { const value = parse(JSON.parse(match[1])); return value === null ? { kind: 'invalid' } : { kind: 'present', value, start }; }
  catch { return { kind: 'invalid' }; }
}
export const renderFormat = (value: BountyFormat): string => `${FORMAT_MARKER}\n${JSON.stringify(value)}\n-->\n`;
export const publicText = (text: string): string => text.replaceAll('<', '&lt;');
// The amount a posted bounty is bound to state. It lives in the format block
// of the body the tool posted — the artifact GitHub accepted — never in the
// record's `reward` summary on its own: that file is agent-editable, so a
// number re-read from it could reach a public write the posted body never
// carried (BT11a fix round). A pre-wave approval (and a snapshot publication,
// whose body holds no block) is bound to $0 — the listing it approved states
// no other amount. A bounty with no GitHub publication is bound only by a
// folder post, which wrote `reward` itself in the same write as the post.
export function boundAmount(record: BountyRecord): number | undefined {
  if (record.github === undefined) return record.githubApproval !== undefined ? 0 : record.reward?.amount;
  const posted = readFormat(record.github.body);
  return posted.kind === 'present' ? posted.value.reward.amount : record.reward?.amount ?? 0;
}
export function formatFor(record: BountyRecord, publication: Pick<GitHubPublication, 'repository' | 'commit' | 'pushed' | 'branch' | 'seenPullRequests'> | undefined = record.github, stating: number | undefined = boundAmount(record)): BountyFormat {
  if (publication === undefined) throw new Error('a format needs a GitHub publication');
  const decision = [...record.events].reverse().find(event => event.stage === 'applied');
  let state: FormatState = { kind: 'open' };
  if (decision !== undefined && decision.merge !== undefined) {
    const attempt = record.attempts?.find(entry => entry.n === decision.attempt);
    const pr = attempt?.pullRequest ?? (attempt === undefined ? undefined : publication.seenPullRequests?.find(entry => entry.commit === attempt.commit)?.n) ?? Number(/pull request #(\d+)/.exec(decision.reason ?? '')?.[1]);
    if (!Number.isSafeInteger(pr) || pr < 1) throw new Error('the merged solution has no recorded pull request');
    state = { kind: 'closed-merged', pullRequest: pr, commit: decision.merge };
  } else if (['withdrawn', 'rejected', 'undone', 'expired'].includes(record.stage)) state = { kind: 'closed-none' };
  // The block and the listing state the same amount: the caller that is
  // about to bind a reward passes it in, so a preview states what a post
  // would bind — version 2. A record published before BT11a (a GitHub
  // publication with no reward bound) keeps rendering the version 1 block
  // it went out with, so a still-live issue body stays byte-identical.
  const amount = stating ?? 0;
  const legacy = record.reward === undefined && record.github !== undefined;
  return { schemaVersion: legacy ? 1 : 2, kind: 'box-bounty', id: record.id, repository: publication.repository, workCommit: publication.commit, branch: publication.branch, withChanges: (publication.pushed?.length ?? 0) > 0, createdAt: record.createdAt, state, reward: { amount, currency: 'USD' }, terms: 'merged-solution-earns-whole' };
}
export function formatFact(body: string, expected: BountyFormat): 'absent' | 'invalid' | 'matches-record' | 'differs-from-record' {
  const read = readFormat(body);
  return read.kind === 'present' ? JSON.stringify(read.value) === JSON.stringify(expected) ? 'matches-record' : 'differs-from-record' : read.kind;
}
