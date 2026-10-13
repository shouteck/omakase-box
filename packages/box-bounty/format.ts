import type { BountyRecord } from './record.js';
import type { GitHubPublication } from './github.js';

export const FORMAT_MARKER = '<!-- box-bounty-format';
export type FormatState = { readonly kind: 'open' } | { readonly kind: 'closed-none' } | { readonly kind: 'closed-merged'; readonly pullRequest: number; readonly commit: string };
export interface BountyFormat {
  /** Version 1 (pre-BT11a) carried a reward fixed at 0. Version 2 carries the
      amount the owner had set when the bounty was posted. Version 3 — only
      ever on a bounty stating a reward above $0 — adds `payment`: how a
      solver names where to be paid (BT11b). */
  readonly schemaVersion: 1 | 2 | 3;
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
  /** Version 3 only: the pay-to instruction as fields a program can use — a
      solver adds one `pay-to:` line carrying a Stripe payment link to their
      pull request description. */
  readonly payment?: { readonly method: 'stripe-link'; readonly where: 'pull-request-description'; readonly prefix: 'pay-to:' };
}
export type FormatRead = { readonly kind: 'absent' } | { readonly kind: 'invalid' } | { readonly kind: 'present'; readonly value: BountyFormat; readonly start: number };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{40}$/.test(value);
const keys = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).sort().join(',') === [...names].sort().join(',');
function parse(value: unknown): BountyFormat | null {
  if (!object(value)) return null;
  // Version 3's exact key set carries `payment`; every other version carries
  // the set without it — a member out of place is not a block this tool wrote.
  const core = ['schemaVersion', 'kind', 'id', 'repository', 'workCommit', 'branch', 'withChanges', 'createdAt', 'state', 'reward', 'terms'];
  if (!keys(value, value.schemaVersion === 3 ? [...core, 'payment'] : core)) return null;
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3) || value.kind !== 'box-bounty' || typeof value.id !== 'string' || !/^bt-[a-f\d]{12}$/.test(value.id)
    || typeof value.repository !== 'string' || !/^[A-Za-z\d_.-]+\/[A-Za-z\d_.-]+$/.test(value.repository)
    || !sha(value.workCommit) || value.branch !== `box-bounty/${value.id}` || typeof value.withChanges !== 'boolean'
    || typeof value.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString().slice(0, 19) !== value.createdAt.slice(0, 19)
    || value.terms !== 'merged-solution-earns-whole' || !object(value.reward) || !keys(value.reward, ['amount', 'currency']) || value.reward.currency !== 'USD' || !object(value.state)) return null;
  // Version 3's `payment` names the one mechanism a program may rely on: a
  // `pay-to:` line in the pull request description carrying a Stripe link.
  if (value.schemaVersion === 3 && (!object(value.payment) || !keys(value.payment, ['method', 'where', 'prefix']) || value.payment.method !== 'stripe-link' || value.payment.where !== 'pull-request-description' || value.payment.prefix !== 'pay-to:')) return null;
  // Version 1's reward is fixed at 0; version 2 carries the amount the owner
  // had set at posting — a whole dollar amount at or above 0 and nothing else.
  const amount = value.reward.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0 || (value.schemaVersion === 1 && amount !== 0)) return null;
  let state: FormatState;
  if ((value.state.kind === 'open' || value.state.kind === 'closed-none') && keys(value.state, ['kind'])) state = { kind: value.state.kind };
  else if (value.state.kind === 'closed-merged' && keys(value.state, ['kind', 'pullRequest', 'commit']) && typeof value.state.pullRequest === 'number' && Number.isSafeInteger(value.state.pullRequest) && value.state.pullRequest > 0 && sha(value.state.commit)) state = { kind: 'closed-merged', pullRequest: value.state.pullRequest, commit: value.state.commit };
  else return null;
  const parsed: BountyFormat = { schemaVersion: value.schemaVersion, kind: 'box-bounty', id: value.id, repository: value.repository, workCommit: value.workCommit, branch: value.branch, withChanges: value.withChanges, createdAt: value.createdAt, state, reward: { amount, currency: 'USD' }, terms: value.terms };
  return value.schemaVersion === 3 ? { ...parsed, payment: { method: 'stripe-link', where: 'pull-request-description', prefix: 'pay-to:' } } : parsed;
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
  // would bind. A record already published keeps rendering the version the
  // posted body carries — pre-BT11a issues stay version 1, BT11a issues stay
  // version 2 — and a new post emits version 3 only when it states a reward,
  // since `payment` is the version-3 member. A GitHub publication whose
  // posted body holds no block at all keeps version 1 (BT11a fix round).
  const amount = stating ?? 0;
  const legacy = record.reward === undefined && record.github !== undefined;
  const posted = record.github !== undefined ? readFormat(record.github.body) : { kind: 'absent' as const };
  const schemaVersion = posted.kind === 'present' ? posted.value.schemaVersion : legacy ? 1 : amount > 0 ? 3 : 2;
  const format: BountyFormat = { schemaVersion, kind: 'box-bounty', id: record.id, repository: publication.repository, workCommit: publication.commit, branch: publication.branch, withChanges: (publication.pushed?.length ?? 0) > 0, createdAt: record.createdAt, state, reward: { amount, currency: 'USD' }, terms: 'merged-solution-earns-whole' };
  return schemaVersion === 3 ? { ...format, payment: { method: 'stripe-link', where: 'pull-request-description', prefix: 'pay-to:' } } : format;
}
export function formatFact(body: string, expected: BountyFormat): 'absent' | 'invalid' | 'matches-record' | 'differs-from-record' {
  const read = readFormat(body);
  return read.kind === 'present' ? JSON.stringify(read.value) === JSON.stringify(expected) ? 'matches-record' : 'differs-from-record' : read.kind;
}
