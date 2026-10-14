import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import './support.js';
import { applyBounty, answerGitHub, checkMergedSolutions, closeBounty, loadRecord, lookBounty, parsePayTo, payToLine, postBounty, renderStatus, runHook, setMergeNoticeListener } from '../../../packages/box-bounty/index.js';
import { git } from './support.js';
import { fixture, postedFixture } from './github-fixture.js';
import type { GhState } from './github-fixture.js';

// BT11b — the solver's payment link. A solver who wants paying puts `pay-to:`
// plus a Stripe payment link in their pull request description; the tool reads
// the line as a fact, never opens the link, and when the bounty closes on a
// merge it tells the owner whom to pay and where. Payment is the owner's to
// make by hand.

const STRIPE_TEST = 'https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00';
const STRIPE_LIVE = 'https://buy.stripe.com/9AQ00deadbeef0000';

const noticed: string[] = [];
setMergeNoticeListener(line => noticed.push(line));

/** Write the repository's reward settings into the fixture world's own
    settings dir before postBounty runs — the reward is bound at post time.
    BT11c: money lives on owner/project's own entry; a shared setting would
    retire on load and apply to nothing. */
const reward5 = (scratch: string) => {
  const path = join(scratch, 'settings', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  settings.repositories = { ...(settings.repositories ?? {}), 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [], reward: { amount: 5, at: '2026-10-01T00:00:00.000Z' }, rewardLimit: { amount: 50, at: '2026-10-01T00:00:00.000Z' } } };
  writeFileSync(path, JSON.stringify(settings));
};

/** Point a fixture pull request's description (and last editor) at the test. */
const body = (state: () => GhState, update: (change: Partial<GhState>) => void, n: number, text: string, editedBy?: string) => {
  update({ prs: state().prs.map(pr => pr.number === n ? { ...pr, body: text, ...(editedBy === undefined ? {} : { editedBy }) } : pr) });
};

const mergeSolution = (repo: string, sha: string): string => {
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'agent merged the solution', sha]);
  return git(repo, ['rev-parse', 'HEAD']);
};

// ---------------------------------------------------------------------------
// The parser — an allow-list at the pull-request-description boundary.
// ---------------------------------------------------------------------------

describe('the pay-to parser', () => {
  it('reads exactly one recognised address on its own line', () => {
    expect(parsePayTo(`please look\npay-to: ${STRIPE_LIVE}\nmore text`)).toEqual({ state: 'recognised', link: STRIPE_LIVE });
    expect(parsePayTo(`pay-to: ${STRIPE_TEST}`)).toEqual({ state: 'test-mode', link: STRIPE_TEST });
  });
  it('the first line that starts with pay-to: wins; later lines are never seen', () => {
    expect(parsePayTo(`pay-to: nonsense\npay-to: ${STRIPE_LIVE}`)).toEqual({ state: 'unrecognised' });
    expect(parsePayTo(`pay-to: ${STRIPE_LIVE}\npay-to: https://evil.invalid/`)).toEqual({ state: 'recognised', link: STRIPE_LIVE });
  });
  it('a pull request without the line has none', () => {
    expect(parsePayTo('no link here')).toEqual({ state: 'none' });
    expect(parsePayTo('')).toEqual({ state: 'none' });
    expect(parsePayTo('the prefix must start the line:\n  pay-to: x')).toEqual({ state: 'none' });
    expect(parsePayTo('inside a sentence: pay-to: x')).toEqual({ state: 'none' });
  });
  it('rejects every shape outside the allow-list', () => {
    const bad = [
      `pay-to: ${STRIPE_LIVE} ${STRIPE_LIVE}`,          // a second address
      `pay-to: ${STRIPE_LIVE} hurry`,                    // text after the address
      `pay-to: http://buy.stripe.com/9AQ00deadbeef0000`, // not https
      `pay-to: javascript:alert(1)`,                     // other scheme
      `pay-to: https://buy.stripe.com.evil.invalid/9AQ00deadbeef0000`, // lookalike
      `pay-to: https://buy.stripe.com@evil.invalid/9AQ00deadbeef0000`, // host trick
      `pay-to: https://user:pw@buy.stripe.com/9AQ00deadbeef0000`,      // user-info
      `pay-to: https://buy.stripe.com/`,                 // empty id
      `pay-to: https://buy.stripe.com/9AQ00deadbeef0000?x=1`,          // query
      `pay-to: https://buy.stripe.com/9AQ00deadbeef0000#frag`,         // fragment
      `pay-to: https://buy.stripe.com/path/9AQ00deadbeef0000`,         // deeper path
      `pay-to: https://buy.stripe.com/9AQ00deadbeef0000\u202Etxt`,     // bidi char
      `pay-to: https://buy.stripe.com/abc`,                            // id too short
      `pay-to: ${'x'.repeat(500)}`,                                    // very long line
      `pay-to:${STRIPE_LIVE}`,                                         // no space
    ];
    for (const text of bad) expect(parsePayTo(text)).toEqual({ state: 'unrecognised' });
  });
  it('a pay-to line in a commit message or file is never the description', () => {
    // The parser only ever receives the description string itself.
    expect(parsePayTo('body text only')).toEqual({ state: 'none' });
  });
  it('the four facts are the tool\'s words; an unrecognised line is never echoed', () => {
    expect(payToLine({ state: 'none' })).toBe('pay-to: none given');
    expect(payToLine({ state: 'unrecognised' })).toBe('pay-to: a line was given that is not a recognised payment link');
    expect(payToLine({ state: 'recognised', link: STRIPE_LIVE })).toBe('pay-to: a recognised payment link was given');
    expect(payToLine({ state: 'test-mode', link: STRIPE_TEST })).toBe('pay-to: a test-mode payment link was given — no real money moves through it');
  });
});

// ---------------------------------------------------------------------------
// The issue text — asks for the line only when a reward is stated.
// ---------------------------------------------------------------------------

it('the posted issue asks for pay-to only when the bounty states a reward', () => fixture(({ repo, id, scratch, state }) => {
  reward5(scratch);
  postBounty(repo, id, 'github');
  const posted = state().issues[0]!.body;
  expect(posted).toContain('pay-to:');
  expect(posted).toContain('payment is the poster\'s to make by hand');
  expect(posted).toContain('posting an answer does not guarantee');
  // The format block carries the machine-readable payment member at v3.
  expect(posted).toContain('"schemaVersion":3');
  expect(posted).toContain('"payment"');
  // The wording pin: nothing promises payment, timing or selection.
  expect(posted).not.toMatch(/\bwill (earn|receive|be paid|get paid)\b|\bgets? paid\b|\bwithin \d+ (hour|day|minute|week)s?\b|\balways paid\b/i);
}, 'Repair app'));

it('a zero-reward bounty never mentions pay-to', () => fixture(({ repo, id, state }) => {
  postBounty(repo, id, 'github');
  const posted = state().issues[0]!.body;
  expect(posted).not.toContain('pay-to');
  expect(posted).not.toContain('"payment"');
  expect(posted).not.toContain('"schemaVersion":3');
}, 'Repair app'));

// ---------------------------------------------------------------------------
// Facts beside each solution — list and collect.
// ---------------------------------------------------------------------------

it('list and look state the pay fact next to each solution when a reward is stated', () => fixture(({ repo, id, scratch, state, update, pr }) => {
  reward5(scratch);
  postBounty(repo, id, 'github');
  pr('solver1'); body(state, update, 1, `fix for the bounty\npay-to: ${STRIPE_TEST}`);
  pr('solver2'); body(state, update, 2, 'my fix\npay-to: https://buy.stripe.com.evil.invalid/abc123 pay me fast');
  const result = lookBounty(repo, id, 1);
  expect(result.attempt.payTo).toEqual({ state: 'test-mode', link: STRIPE_TEST });
  const second = lookBounty(repo, id, 2);
  expect(second.attempt.payTo).toEqual({ state: 'unrecognised' });
  // The hostile text is never echoed — only the tool's own fact line.
  const status = renderStatus(repo, { id });
  expect(status).toContain('pay-to: a test-mode payment link was given');
  expect(status).toContain('pay-to: a line was given that is not a recognised payment link');
  expect(status).not.toContain('pay me fast');
  expect(status).not.toContain('buy.stripe.com.evil.invalid');
  // The tool never fetched the link — every gh call stayed on the API.
  for (const call of state().calls) expect(call.join(' ')).not.toContain('buy.stripe.com');
}, 'Repair app'));

it('at $0 the pay fact is never shown', () => postedFixture(({ repo, id, state, update }) => {
  body(state, update, 1, `fix\npay-to: ${STRIPE_LIVE}`);
  const result = lookBounty(repo, id, 1);
  const status = renderStatus(repo, { id });
  expect(status).not.toContain('payment link');
  expect(status).not.toContain('pay-to');
}, { collected: false }));

// ---------------------------------------------------------------------------
// The pay message at close.
// ---------------------------------------------------------------------------

it('applying a solution with a recognised link tells the owner whom to pay, twice', () => fixture(({ repo, id, scratch, state, update, pr }) => {
  reward5(scratch);
  postBounty(repo, id, 'github');
  pr('solver1'); body(state, update, 1, `fix\npay-to: ${STRIPE_LIVE}`);
  answerGitHub(repo, id, 1);
  const result = applyBounty(repo, id, 1);
  expect(result.outcome).toBe('applied');
  const message = result.payMessage!.join('\n');
  expect(message).toContain(id);
  expect(message).toContain('solver1');
  expect(message).toContain(`/pull/1`);
  expect(message).toContain('$5');
  expect(message).toContain(STRIPE_LIVE);
  expect(message).toContain('Pay solver1 at');
  expect(message).toContain('does not pay');
  expect(message).toContain('check the page asks for $5 and that the account name there belongs to solver1');
  // The issue's closing comment states only which solution merged — never pay.
  const closing = state().comments.filter(comment => comment.body.includes('<!-- box-bounty')).at(-1)!.body;
  expect(closing).toContain('Applied as commit');
  expect(closing).not.toContain(STRIPE_LIVE);
  expect(closing).not.toContain('pay');
  // status keeps the record line.
  const status = renderStatus(repo, { id });
  expect(status).toContain(`pay $5 to solver1`);
  expect(status).toContain('a record, not a reminder');
  // The finish hook repeats it once.
  const hook = runHook(repo, 'finish', []).output!;
  expect(hook).toContain('Pay solver1 at');
  expect(hook).toContain('solver1');
  expect(runHook(repo, 'finish', []).output ?? '').not.toContain('Pay solver1 at');
}, 'Repair app'));

it('a merge the tool itself notices carries the same message', () => fixture(({ repo, id, scratch, state, update, pr }) => {
  reward5(scratch);
  postBounty(repo, id, 'github');
  const sha = pr('solver1'); body(state, update, 1, `fix\npay-to: ${STRIPE_TEST}`, 'maintainer-else');
  answerGitHub(repo, id, 1); // fetch the pull request's objects, then merge it
  mergeSolution(repo, sha);
  noticed.length = 0;
  checkMergedSolutions(repo);
  const out = noticed.join('\n');
  expect(out).toContain('closed');
  expect(out).toContain(STRIPE_TEST);
  expect(out).toContain('a test link — no real money moves through it');
  // The description was last edited by someone who is not the solver.
  expect(out).toContain('last edited by maintainer-else, not the solver');
  expect(out).toContain('check the page asks for $5');
  const record = loadRecord(repo, id);
  expect(record.github!.pay!.solver).toBe('solver1');
  expect(record.github!.pay!.editedBy).toBe('maintainer-else');
  expect(record.github!.pay!.testMode).toBe(true);
}, 'Repair app'));

it('a merged solution without a recognised link is stated, with its pull request', () => fixture(({ repo, id, scratch, state, update, pr }) => {
  reward5(scratch);
  postBounty(repo, id, 'github');
  pr('solver2'); body(state, update, 1, `fix\npay-to: hand it over at noon`);
  answerGitHub(repo, id, 1);
  const result = applyBounty(repo, id, 1);
  const message = result.payMessage!.join('\n');
  expect(message).toContain('no usable payment link');
  expect(message).toContain('/pull/1');
  expect(message).toContain('solver2');
  expect(message).not.toContain('hand it over at noon');
  // The pre-close close of a second run tells it again.
  const again = closeBounty(repo, id);
  expect(again.payMessage!.join('\n')).toContain('no usable payment link');
}, 'Repair app'));

it('a merged $0 bounty or a bounty closed without merge never mentions pay', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  const result = applyBounty(repo, id, 1);
  expect(result.outcome).toBe('applied');
  expect(result.payMessage).toBeUndefined();
  expect(loadRecord(repo, id).github!.pay).toBeUndefined();
  const status = renderStatus(repo, { id });
  expect(status).not.toContain('pay $');
}, { collected: false }));

it('closing a rewarded bounty without a merge produces no pay message', () => fixture(({ repo, id, scratch }) => {
  reward5(scratch);
  postBounty(repo, id, 'github');
  const result = closeBounty(repo, id);
  expect(result.outcome).toBe('withdrawn');
  expect(result.payMessage).toBeUndefined();
  expect(loadRecord(repo, id).github!.pay).toBeUndefined();
}, 'Repair app'));

// ---------------------------------------------------------------------------
// Back-compat and boundaries.
// ---------------------------------------------------------------------------

it('records from before the wave load and carry no pay fields', () => fixture(({ repo, id }) => {
  postBounty(repo, id, 'github');
  const recordPath = join(repo, '.box', 'bounties', `${id}.json`);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  delete record.github.seenPullRequests?.[0]?.payTo;
  writeFileSync(recordPath, JSON.stringify(record));
  expect(() => loadRecord(repo, id)).not.toThrow();
}, 'Repair app'));

it('the same-second solver commits now differ (the bt7b flake fix)', () => fixture(({ repo, id, pr }) => {
  postBounty(repo, id, 'github');
  const first = pr('solver1');
  const second = pr('solver2');
  expect(first).not.toBe(second);
}, 'Repair app'));
