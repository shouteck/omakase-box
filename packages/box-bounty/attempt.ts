// A taken attempt, followed to its end (PF26): `submit` marks the draft ready for the poster's review, and `status`
// says where it stands — the pull request on GitHub, what others wrote on it (marked as theirs), merged or closed,
// and whether it is paid and how. Payment is read from the board's public answers only: the tool holds no board
// session and needs none. Connecting a way to be paid is a person's step on the board; status names it once.
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHARGE_WORDS, PAYPAL_WORDS } from '../box-platform/src/charge-words.js';
import { boardAddress, readBountyFact, readPayAccepts, type BoardFact } from './board.js';
import { BountyRefused } from './errors.js';
import { api, invalid, isObject, READABLE_LOGIN, redact } from './gh.js';
import { methodWords } from './pay.js';
import { settingsDir, writeToolFile } from './settings.js';
import { DRAFT_BODY, loadTaken, saveTaken, takenIds, type Taken } from './take.js';
import { solverAccount, solverAccountOr, solverBlock } from './untrusted.js';

/** What someone wrote on the pull request: a comment, a review, or a review's comment on a line. */
interface Note { readonly author: string | null; readonly at: string; readonly kind: 'comment' | 'review' | 'line comment'; readonly verdict: string | null; readonly path: string | null; readonly body: string }
interface Attempt {
  readonly nodeId: string; readonly draft: boolean; readonly state: 'open' | 'closed' | 'merged'; readonly mergedAt: string | null;
  readonly base: string; readonly head: string; readonly author: string | null; readonly body: string; readonly changedFiles: number;
  readonly notes: readonly Note[]; readonly notShown: number;
}

const SHOWN = 50;
const QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id isDraft state merged mergedAt baseRefName headRefName author{login} body changedFiles
comments(last:${SHOWN}){totalCount nodes{author{login} body createdAt}}
reviews(last:${SHOWN}){totalCount nodes{author{login} body state submittedAt comments(first:${SHOWN}){totalCount nodes{author{login} body path createdAt}}}}}}}`;

const loginOf = (value: unknown): string | null => isObject(value) && typeof value['login'] === 'string' && READABLE_LOGIN.test(value['login']) ? value['login'] : null;
const unreadable = (): never => invalid('github-response-invalid', 'GitHub returned an unreadable pull request; nothing changed; next: check gh auth status, then run the same command again');
const workRoot = (taken: Taken): string => taken.workspace !== undefined && existsSync(taken.workspace) ? taken.workspace : tmpdir();

/** The attempt's pull request in one read, bound to the branch the take pushed: a record pointing elsewhere is refused by name. */
function readAttempt(taken: Taken): Attempt {
  const [owner, name] = taken.repository.split('/');
  const data = api(workRoot(taken), 'graphql', { query: QUERY, variables: { owner, name, number: taken.pullRequest!.number } });
  const pr = isObject(data) && isObject(data['data']) && isObject(data['data']['repository']) ? data['data']['repository']['pullRequest'] : undefined;
  if (!isObject(pr) || typeof pr['id'] !== 'string' || typeof pr['isDraft'] !== 'boolean' || !['OPEN', 'CLOSED', 'MERGED'].includes(String(pr['state'])) || typeof pr['baseRefName'] !== 'string'
    || typeof pr['headRefName'] !== 'string' || typeof pr['body'] !== 'string' || !Number.isSafeInteger(pr['changedFiles']) || !isObject(pr['comments']) || !isObject(pr['reviews'])) return unreadable();
  if (pr['headRefName'] !== taken.branch) throw new BountyRefused('attempt-mismatch', `pull request #${taken.pullRequest!.number} on ${taken.repository} is from ${JSON.stringify(pr['headRefName'].slice(0, 100))}, not ${taken.branch}, so it is not this attempt; nothing changed; next: check ${taken.pullRequest!.url}`);
  const notes: Note[] = [];
  let total = 0;
  const list = (connection: unknown): unknown[] => {
    if (!isObject(connection) || !Array.isArray(connection['nodes']) || !Number.isSafeInteger(connection['totalCount'])) return unreadable();
    total += connection['totalCount'] as number;
    return connection['nodes'];
  };
  const at = (value: unknown): string => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : unreadable();
  const text = (value: unknown): string => typeof value === 'string' ? redact(value) : unreadable();
  for (const node of list(pr['comments'])) {
    if (!isObject(node)) return unreadable();
    notes.push({ author: loginOf(node['author']), at: at(node['createdAt']), kind: 'comment', verdict: null, path: null, body: text(node['body']) });
  }
  for (const review of list(pr['reviews'])) {
    if (!isObject(review) || typeof review['state'] !== 'string') return unreadable();
    // A review with no words of its own still says something when it approves or asks for changes.
    const verdict = review['state'] === 'APPROVED' ? 'approved' : review['state'] === 'CHANGES_REQUESTED' ? 'asked for changes' : null;
    if (text(review['body']) !== '' || verdict !== null) notes.push({ author: loginOf(review['author']), at: at(review['submittedAt']), kind: 'review', verdict, path: null, body: text(review['body']) });
    else total -= 1;
    for (const line of list(review['comments'])) {
      if (!isObject(line)) return unreadable();
      notes.push({ author: loginOf(line['author']), at: at(line['createdAt']), kind: 'line comment', verdict: null, path: typeof line['path'] === 'string' ? line['path'] : null, body: text(line['body']) });
    }
  }
  notes.sort((a, b) => a.at.localeCompare(b.at));
  return {
    nodeId: pr['id'], draft: pr['isDraft'], state: pr['state'] === 'MERGED' ? 'merged' : pr['state'] === 'CLOSED' ? 'closed' : 'open', mergedAt: typeof pr['mergedAt'] === 'string' ? pr['mergedAt'] : null,
    base: pr['baseRefName'], head: pr['headRefName'], author: loginOf(pr['author']), body: pr['body'], changedFiles: pr['changedFiles'] as number, notes, notShown: Math.max(0, total - notes.length)
  };
}

function takenOrRefuse(id: string): Taken {
  const taken = loadTaken(id);
  if (taken === null) throw new BountyRefused('not-taken', `${id} is not a bounty you took; nothing changed; next: box bounty take ${id}, or box bounty status inside the checkout that posted it`);
  if (taken.stage === 'waiting') throw new BountyRefused('not-taken-yet', `${id} waits on the owner's yes and is not taken yet; nothing changed; next: once the owner has answered, box bounty take ${id}`);
  return taken;
}

const retargeted = (taken: Taken, attempt: Attempt): string => `pull request #${taken.pullRequest!.number} now targets ${JSON.stringify(attempt.base.slice(0, 100))}, not the bounty's branch ${taken.bountyBranch} — someone changed it`;

/** `submit`: the draft becomes ready for the poster's review. Only work already pushed counts. */
export function submitTaken(id: string): string {
  const taken = takenOrRefuse(id);
  if (taken.stage === 'withdrawn') throw new BountyRefused('attempt-withdrawn', `${id} was withdrawn; nothing changed; next: box bounty take ${id} starts a new attempt`);
  const attempt = readAttempt(taken);
  const number = taken.pullRequest!.number;
  if (attempt.state !== 'open') throw new BountyRefused('attempt-ended', `pull request #${number} is already ${attempt.state} on GitHub; nothing changed; next: box bounty status ${id}`);
  if (attempt.base !== taken.bountyBranch) throw new BountyRefused('attempt-retargeted', `${retargeted(taken, attempt)}; nothing changed; next: set its base back to ${taken.bountyBranch} at ${taken.pullRequest!.url}, then submit again`);
  if (attempt.changedFiles === 0) throw new BountyRefused('nothing-to-submit', `pull request #${number} changes no file on GitHub — only the empty start commit is there; nothing changed; next: commit in ${taken.workspace ?? 'your workspace'} and push to ${taken.target} ${taken.branch}, then box bounty submit ${id}`);
  if (!attempt.draft) {
    if (taken.stage !== 'submitted') saveTaken({ ...taken, stage: 'submitted', at: new Date().toISOString() });
    return `${id} — pull request #${number} is already ready for review; nothing more to do. next: box bounty status ${id}`;
  }
  // The tool's own draft sentence is replaced; words the solver wrote in the description stay as they are.
  const draftText = DRAFT_BODY(id);
  const body = attempt.body.includes(draftText) ? attempt.body.replace(draftText, `A solution to bounty ${id}, ready for review.`) : null;
  const data = api(workRoot(taken), 'graphql', {
    query: `mutation($id:ID!${body === null ? '' : ',$body:String!'}){ready:markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}${body === null ? '' : ' described:updatePullRequest(input:{pullRequestId:$id,body:$body}){pullRequest{body}}'}}`,
    variables: { id: attempt.nodeId, ...(body === null ? {} : { body }) }
  });
  const ready = isObject(data) && isObject(data['data']) && isObject(data['data']['ready']) && isObject(data['data']['ready']['pullRequest']) ? data['data']['ready']['pullRequest']['isDraft'] : undefined;
  if (ready !== false) return invalid('github-response-invalid', `GitHub did not say pull request #${number} is ready for review; the attempt stays a draft on record; next: mark it ready at ${taken.pullRequest!.url}, then box bounty submit ${id}`);
  saveTaken({ ...taken, stage: 'submitted', at: new Date().toISOString() });
  return [
    `${id} — submitted: pull request #${number} is ready for the poster's review, ${attempt.changedFiles} file(s) changed · ${taken.pullRequest!.url}`,
    `next: box bounty status ${id} follows it — review comments, merged or closed, and payment; to answer a review, push to ${taken.target} ${taken.branch}`
  ].join('\n');
}

// ---- payment, from the solver's side, as the board's public answers say it ----

const day = (at: string | null): string => at?.slice(0, 10) ?? 'an unstated date';

function paymentLine(fact: BoardFact, solver: string | null, paysOnMerge: boolean | null): string {
  if (fact.kind === 'unreachable') return `board: not read (${fact.reason}); next: box bounty status again when online`;
  if (fact.kind === 'not-listed') return 'board: not listed yet — it reads GitHub every 15 minutes';
  const you = (login: string | null): string => login !== null && solver !== null && login.toLowerCase() === solver.toLowerCase() ? 'you' : solverAccountOr(login, 'an account whose name could not be read');
  const state = fact.charge as keyof typeof CHARGE_WORDS | null | undefined;
  const words = (state ?? null) === null ? undefined : (fact.paypalCharge === true ? PAYPAL_WORDS[state!] : undefined) ?? CHARGE_WORDS[state!];
  const charge = words === undefined ? '' : `; payment: ${words}`;
  const provider = fact.stripe === true ? 'Stripe' : fact.paypal === true ? 'PayPal' : null;
  if (provider !== null) return `board: paid $${fact.amount ?? '?'} to ${you(fact.to)} through ${provider} on ${day(fact.recordedAt)}, ${provider}'s word${charge} · ${fact.page}`;
  switch (fact.payment) {
    case 'no-reward': return 'board: no reward is stated, so nothing is owed';
    case 'nothing-owed': return `board: nothing owed yet — no merged solution is on the default branch${charge}`;
    case 'merged-not-on-default': return `board: merged; not yet seen on the default branch, so not shown as owed${charge}`;
    case 'owed': return fact.to !== null && you(fact.to) === 'you'
      ? `board: owed $${fact.amount ?? '?'} to you since ${day(fact.since)}${paysOnMerge === true ? '; this bounty pays on merge, so with Stripe connected the board charges the owner\'s saved card' : '; the owner pays you directly'}${charge}`
      : `board: owed $${fact.amount ?? '?'} to ${you(fact.to)}, not to you${charge}`;
    case 'owner-decides': return `board: owed $${fact.amount ?? '?'} to one of ${fact.toOneOf.map(login => you(login)).join(', ')}; the owner decides which${charge}`;
    case 'recorded': return `board: recorded paid $${fact.amount ?? '?'} to ${you(fact.to)} on ${day(fact.recordedAt)}, the owner's word; say whether it arrived, signed in, at ${fact.page}${charge}`;
    case 'confirmed': return `board: paid $${fact.amount ?? '?'} on ${day(fact.recordedAt)}; confirmed received by ${you(fact.solverBy)} on ${day(fact.solverAt)}`;
    case 'says-not-received': return `board: recorded paid $${fact.amount ?? '?'} on ${day(fact.recordedAt)}; ${you(fact.solverBy) === 'you' ? 'you say' : `${you(fact.solverBy)} says`} not received; the board does not decide · ${fact.page}`;
  }
}

// The board's link for the one human step is named once per account, then never again (no reminders).
const shownFile = (): string => join(settingsDir(), 'pay-step-shown.json');
function shownLogins(): string[] {
  try { const read = (JSON.parse(readFileSync(shownFile(), 'utf8')) as { logins?: unknown }).logins; return Array.isArray(read) ? read.filter((entry): entry is string => typeof entry === 'string') : []; }
  catch { return []; }
}
const shownFor = (login: string): boolean => shownLogins().includes(login.toLowerCase());
function markShown(login: string): void {
  const logins = shownLogins();
  writeToolFile(shownFile(), `${JSON.stringify({ kind: 'box-pay-step-shown', logins: [...new Set([...logins, login.toLowerCase()])] }, null, 2)}\n`);
}

function payWayLines(solver: string | null): string[] {
  if (solver === null) return ['how you can be paid: not read — the pull request\'s author could not be read'];
  const accepts = readPayAccepts(solver);
  if (accepts === undefined) return [];
  if (accepts.unreadAt !== undefined) return [`how you can be paid: not read from the board; see ${accepts.unreadAt}`];
  const ways = accepts.ways;
  const connected = ways === undefined ? [] : [
    ...(ways.onMerge ? ['Stripe, on merge and with one click'] : ways.oneClick.includes('Stripe') ? ['Stripe, with one click'] : []),
    ...(ways.oneClick.includes('PayPal') ? ['PayPal, with one click'] : [])
  ];
  const listed = accepts.methods.length > 0 ? [`ways you listed: ${methodWords(accepts).join(', ')}${accepts.more > 0 ? ` and ${accepts.more} more` : ''}`] : [];
  if (connected.length > 0 || listed.length > 0) return [`how you can be paid, as the board says: ${[...connected.map(way => `${way} (connected)`), ...listed].join('; ')}`];
  if (ways?.unknown === true) return ['how you can be paid: the board has not read a pull request of yours yet, so it cannot say; it reads GitHub every 15 minutes'];
  const lines = ['how you can be paid: the board shows no way for you'];
  if (!shownFor(solver)) {
    lines.push(`one step only a person can take: whoever holds the GitHub account ${solverAccount(solver)} signs in at ${boardAddress()}/me/ and connects Stripe or PayPal, or lists a way to be paid. The tool cannot do it, and says this once.`);
    markShown(solver);
  }
  return lines;
}

// ---- status ----

const stageWords = (taken: Taken): string => ({ waiting: 'waiting on the owner\'s yes', taken: 'taken', submitted: 'submitted', withdrawn: 'withdrawn' })[taken.stage];

/** `status <id>` on a bounty this account took. */
export function attemptStatus(id: string, options: { readonly comments?: boolean } = {}): string {
  const taken = takenOrRefuse(id);
  const number = taken.pullRequest!.number;
  const attempt = readAttempt(taken);
  const board = readBountyFact(id);
  const poster = board?.poster ?? null;
  const solver = attempt.author;
  const same = (a: string | null, b: string | null): boolean => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
  const pr = attempt.state === 'merged' ? `merged${attempt.mergedAt === null ? '' : ` on ${day(attempt.mergedAt)}`}`
    : attempt.state === 'closed' ? 'closed without a merge'
    : attempt.draft ? 'a draft' : 'ready for review';
  const lines = [`${id} — ${stageWords(taken)} on ${taken.repository}: pull request #${number} is ${pr}, ${attempt.changedFiles} file(s) changed · ${taken.pullRequest!.url}`];
  if (attempt.base !== taken.bountyBranch) lines.push(`  ${retargeted(taken, attempt)}; a merge there is not a merge into the bounty`);
  const fromPoster = attempt.notes.filter(note => same(note.author, poster)).length;
  const yours = attempt.notes.filter(note => same(note.author, solver) && !same(note.author, poster)).length;
  if (attempt.notes.length > 0 || options.comments === true) {
    lines.push(`  on the pull request: ${attempt.notes.length} comment(s) and review(s)${poster === null ? '' : `, ${fromPoster} from the account that posted this bounty`}${yours === 0 ? '' : `, ${yours} of your own`}; latest ${attempt.notes.at(-1)?.at ?? 'none'}${attempt.notShown > 0 ? `; ${attempt.notShown} more on GitHub, not shown` : ''}`);
  }
  if (options.comments === true) {
    lines.push(`  ${attempt.notes.length} written on GitHub, not by the tool:`);
    for (const note of attempt.notes) {
      const who = note.author === null ? 'an account whose name could not be read' : solverAccount(note.author);
      const role = same(note.author, poster) && same(note.author, solver) ? ' (you; you also posted this bounty)' : same(note.author, poster) ? ' (the account that posted this bounty)' : same(note.author, solver) ? ' (you)' : '';
      const what = note.kind === 'review' ? `review${note.verdict === null ? '' : `, ${note.verdict}`}` : note.kind === 'line comment' ? `comment on ${note.path === null ? 'a line' : JSON.stringify(note.path.slice(0, 200))}` : 'comment';
      lines.push(`    ${who}${role}, ${what}, at ${note.at}:`);
      if (note.body !== '') lines.push(...solverBlock('other account', note.body.split('\n'), '      '));
    }
  }
  if (board !== null) {
    lines.push(`  ${paymentLine(board.fact, solver, board.paysOnMerge)}`);
    if ((board.reward ?? 0) > 0 && attempt.state !== 'closed') lines.push(...payWayLines(solver).map(line => `  ${line}`));
  } else lines.push('  board: off on this machine, so payment is not read; box bounty config set board <address> names one');
  lines.push(`next: ${nextStep(taken, attempt, options.comments === true)}`);
  return lines.join('\n');
}

function nextStep(taken: Taken, attempt: Attempt, read: boolean): string {
  const id = taken.id;
  if (attempt.state === 'merged') return `nothing more to do on GitHub; box bounty status ${id} later shows payment`;
  if (attempt.state === 'closed') return `the attempt ended without a merge; box bounty close ${id} withdraws it on record`;
  if (attempt.draft) return `work in ${taken.workspace ?? 'your workspace'}, push to ${taken.target} ${taken.branch}, then box bounty submit ${id}`;
  return attempt.notes.length > 0 && !read ? `read what was written: box bounty status ${id} --comments; push to ${taken.target} ${taken.branch} to answer` : `wait for the poster's review; box bounty status ${id} reads it again`;
}

/** The attempts this account took, from the local record alone: no GitHub read. */
export function takenOverview(): string[] {
  const all = takenIds().flatMap(id => { const taken = loadTaken(id); return taken === null || taken.stage === 'withdrawn' ? [] : [taken]; });
  if (all.length === 0) return [];
  return [
    `bounties you took (${all.length}):`,
    ...all.map(taken => `  ${taken.id} on ${taken.repository} — ${stageWords(taken)}${taken.pullRequest === undefined ? '' : `, pull request #${taken.pullRequest.number} ${taken.pullRequest.url}`}`),
    'next: box bounty status <id> reads one: the pull request, what was written on it, and payment'
  ];
}
