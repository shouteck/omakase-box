// BT11b — the solver's payment link. The tool never pays, never opens the
// link and never holds money: a solver who wants to be paid puts one
// `pay-to:` line in their pull request description, the merge decides, and
// the owner pays by hand. This file is the boundary everything reads: the
// only parser for the line, the four facts `look`/`status` show, and the
// message the tool builds for the owner when a bounty with a reward closes
// on a merge.

// What a recognised payment link looks like today, per Stripe's own
// documentation (payment links are `https://buy.stripe.com/<id>`; test-mode
// links prefix the id with `test_` — ids are alphanumeric):
//   https://buy.stripe.com/28E7sLbHrbu70eC5C5afS00
//   https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00
// Docs: https://docs.stripe.com/payment-links/url-parameters
// Anything not matching this shape is not recognised: another scheme, a
// lookalike host, user-info, a path with more or fewer segments, a query or
// fragment, or anything after the address — the line is an allow-list.
const LINK = /^https:\/\/buy\.stripe\.com\/(test_)?[0-9A-Za-z]{4,64}$/;

// The whole line is bounded: `pay-to:` plus the longest recognised address
// sits far under this, and a longer line is refused before anything in it is
// looked at twice.
const MAX_LINE = 200;

// Control and bidirectional characters never appear in an honest line.
const FORBIDDEN = /[\x00-\x1f\x7f-\x9f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

export type PayToFact =
  | { readonly state: 'none' | 'unrecognised' }
  | { readonly state: 'recognised' | 'test-mode'; readonly link: string };

// Reads only the pull request description text handed to it — never a
// comment, never a file. The first line that starts with `pay-to:` is the
// only line read; everything after is left alone.
export function parsePayTo(body: string): PayToFact {
  for (const raw of body.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line.startsWith('pay-to:')) continue;
    if (line.length > MAX_LINE || FORBIDDEN.test(line)) return { state: 'unrecognised' };
    const value = line.slice('pay-to:'.length);
    // Exactly one space, then one address, then the end of the line.
    if (!value.startsWith(' ') || value === ' ') return { state: 'unrecognised' };
    const address = value.slice(1);
    if (address === '' || /\s/.test(address)) return { state: 'unrecognised' };
    const match = LINK.exec(address);
    if (match === null) return { state: 'unrecognised' };
    return match[1] === 'test_' ? { state: 'test-mode', link: address } : { state: 'recognised', link: address };
  }
  return { state: 'none' };
}

// The four facts `look` and `status` may show next to a solution — the tool's
// own words; unrecognised text is never echoed.
export function payToLine(fact: PayToFact | undefined): string {
  switch (fact?.state ?? 'none') {
    case 'recognised': return 'pay-to: a recognised payment link was given';
    case 'test-mode': return 'pay-to: a test-mode payment link was given — no real money moves through it';
    case 'unrecognised': return 'pay-to: a line was given that is not a recognised payment link';
    default: return 'pay-to: none given';
  }
}

// What the close records about paying the solver — every field is a fact the
// tool itself made, not copied text: the link passed the allow-list shape.
export interface PayOutcome {
  /** The pull request the merged solution came back through; null when it
      came back as a returned folder — no description was ever read. */
  readonly pr: number | null;
  readonly solver: string | null;
  readonly link: string | null;
  readonly testMode: boolean;
  /** The account that last edited the description the link was read from,
      when it was not the solver — stated, never hidden. */
  readonly editedBy: string | null;
  /** The description could not be read again at close; the fact recorded at
      collection stands and the message says so. */
  readonly readFailed?: boolean;
}

export function payOutcomeShape(value: unknown): value is PayOutcome {
  if (value === null || typeof value !== 'object') return false;
  const pay = value as Record<string, unknown>;
  return (Number.isSafeInteger(pay['pr']) && (pay['pr'] as number) >= 1 || pay['pr'] === null)
    && (typeof pay['solver'] === 'string' || pay['solver'] === null)
    && (typeof pay['link'] === 'string' && LINK.test(pay['link']) || pay['link'] === null)
    && typeof pay['testMode'] === 'boolean'
    && (typeof pay['editedBy'] === 'string' || pay['editedBy'] === null);
}

export function payToFactShape(value: unknown): value is PayToFact {
  if (value === null || typeof value !== 'object') return false;
  const fact = value as Record<string, unknown>;
  if (fact['state'] === 'none' || fact['state'] === 'unrecognised') return true;
  return (fact['state'] === 'recognised' || fact['state'] === 'test-mode')
    && typeof fact['link'] === 'string' && LINK.test(fact['link']);
}

// The message the closing output carries for the agent to give the owner —
// a statement, not a question: whom to pay, how much, where. The owner block
// opens it, in plain words the agent passes on unchanged; the agent's part
// after it carries the facts (BT13). Everything in it is tool-built or
// allow-listed; the closing output also tells the agent to repeat it at the
// end of its work, and that is all the tool does.
export function payMessageLines(record: { id: string; title: string }, pay: PayOutcome, opts: { repository: string; issueUrl: string | null; merge: string | undefined; amount: number; unasked?: boolean; partial?: readonly string[] }): string[] {
  const prUrl = pay.pr !== null ? `https://github.com/${opts.repository}/pull/${pay.pr}` : null;
  const solver = pay.solver ?? 'an account whose name could not be read';
  const owner = [
    `The bounty "${record.title}" ended with a solution merged into your code — it was written by ${solver}.`,
    `The bounty stated $${opts.amount}, which you pay by hand — the tool never moves money.`
  ];
  if (pay.link !== null) {
    owner.push(`Pay ${solver} at ${pay.link}${pay.testMode ? ' (a test link — no real money moves through it)' : ''}.`);
    owner.push(`Before you pay, check the page asks for $${opts.amount} and that the account name there belongs to ${solver}.`);
  } else {
    owner.push(`The merged solution gave no usable payment link${prUrl !== null ? ` — the change is at ${prUrl}` : ''}.`);
  }
  if (pay.editedBy !== null) owner.push(`The text the payment link was read from was last edited by ${pay.editedBy}, not the solver.`);
  if (pay.readFailed === true) owner.push('The solver\'s text could not be read again at close — this is what was recorded when it came in.');
  if (opts.unasked === true) owner.push('You were not asked before this merge.');
  if (opts.partial !== undefined && opts.partial.length > 0) owner.push(`Of the files the solution changed, the merge left these as they were: ${opts.partial.join(', ')}.`);
  const lines = [
    'for the owner — pass this on in these words:',
    ...owner.map(line => `  ${line}`),
    'for you — the tool does not pay and does not send this; repeat it when your work ends:',
    `  bounty: "${record.title}" — ${record.id}${opts.issueUrl !== null ? `; issue ${opts.issueUrl}` : ''}`,
    `  merged solution: ${prUrl !== null ? `pull request ${prUrl} from` : 'a returned folder collected from'} GitHub account ${solver}`,
    `  merged in: ${opts.merge ?? 'the recorded merge'}`,
    `  reward: $${opts.amount} — the amount from the owner's setting, to be paid by hand; the tool cannot know the amount a link asks for`
  ];
  return lines;
}

// The lines above, assembled from the record alone: present only when a
// GitHub-posted bounty closed on a merged solution with a pay outcome
// recorded — the recorded merge the message names is the closing event's.
// The closing event also carries the facts the message states: whether the
// owner was asked before that merge, and which of the solution's files the
// merge left as they were (BT13).
export function payNotice(record: { id: string; title: string; events: readonly { stage?: string; merge?: string; command?: string; unasked?: boolean; partial?: readonly string[] }[]; github?: { repository: string; issue: { url: string } | null; pay?: PayOutcome } }, amount: number | undefined): string[] | null {
  const pay = record.github?.pay;
  if (pay === undefined || amount === undefined || amount <= 0) return null;
  const merged = [...record.events].reverse().find(event => event.merge !== undefined && ['apply', 'merged'].includes(event.command ?? ''));
  return payMessageLines(record, pay, { repository: record.github!.repository, issueUrl: record.github!.issue?.url ?? null, merge: merged?.merge, amount, ...(merged?.unasked === true ? { unasked: true } : {}), ...(merged?.partial !== undefined ? { partial: merged.partial } : {}) });
}
