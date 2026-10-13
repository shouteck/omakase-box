import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import './support.js';
import { applyBounty, answerGitHub, parsePayTo, postBounty, renderStatus, runHook } from '../../../packages/box-bounty/index.js';
import { readFormat } from '../../../packages/box-bounty/format.js';
import { fixture } from './github-fixture.js';
import type { GhState } from './github-fixture.js';

// BT11b — the pass's own probes, written by the reviewer on the branch. They
// add negative cases the wave's tests do not pin and try to break the two
// trust boundaries: a stranger's `pay-to:` line (the parser) and whom the pay
// message names (the merged solution's solver, never another).

const STRIPE_TEST = 'https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00';
const STRIPE_LIVE = 'https://buy.stripe.com/9AQ00deadbeef0000';

const reward5 = (scratch: string) => {
  const path = join(scratch, 'settings', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  settings.reward = { amount: 5, at: '2026-10-01T00:00:00.000Z' };
  settings.rewardLimit = { amount: 50, at: '2026-10-01T00:00:00.000Z' };
  writeFileSync(path, JSON.stringify(settings));
};

const body = (state: () => GhState, update: (change: Partial<GhState>) => void, n: number, text: string, editedBy?: string) => {
  update({ prs: state().prs.map(pr => pr.number === n ? { ...pr, body: text, ...(editedBy === undefined ? {} : { editedBy }) } : pr) });
};

describe('the parser, attacked further', () => {
  it('rejects every off-list shape a solver could try', () => {
    const bad = [
      'pay-to: https://buy.stripe.com:443/9AQ00deadbeef0000',        // port
      'pay-to: https://buy.stripe.com./9AQ00deadbeef0000',           // trailing-dot host
      'pay-to: https://BUY.STRIPE.COM/9AQ00deadbeef0000',            // uppercase host
      'pay-to: https://buy.stripe.com//9AQ00deadbeef0000',           // empty first segment
      'pay-to: https://buy.stripe.com/9AQ00deadbeef0000 ',           // trailing space
      'pay-to: https://buy.stripe.com/9AQ00deadbeef0000 ',     // NBSP after the address
      'pay-to: https://buy.stripe.com/' + 'A'.repeat(65),            // id over 64
      'pay-to: https://buy.stripe.com/AbC',                          // id under 4
      'pay-to: https://buy.stripe.com/test_',                        // test_ with no id
      'pay-to:\thttps://buy.stripe.com/9AQ00deadbeef0000',           // tab, not one space
      `pay-to:  ${STRIPE_LIVE}`,                                     // two spaces
      'pay-to: https://buу.stripe.com/9AQ00deadbeef0000',     // Cyrillic у in the host
      'pay-to: https://buy.stripe.com/%39AQ00deadbeef0000',          // percent-encoding
      'pay-to: https://buy%2estripe%2ecom/9AQ00deadbeef0000',        // encoded host
      'pay-to: https://buy.stripe.com/9AQ00deadbeef0000?d=fake',     // url-parameter trick
      'pay-to: see https://buy.stripe.com/9AQ00deadbeef0000',        // words before the address
      'pay-to:' + ' '.repeat(400) + 'https://buy.stripe.com/9AQ00deadbeef0000', // over the line bound
    ];
    for (const text of bad) expect(parsePayTo(text), text).toEqual({ state: 'unrecognised' });
  });
  it('the prefix is literal — variants count as no line, and never echo', () => {
    expect(parsePayTo(`PAY-TO: ${STRIPE_LIVE}`)).toEqual({ state: 'none' });
    expect(parsePayTo(`Pay-To: ${STRIPE_LIVE}`)).toEqual({ state: 'none' });
    expect(parsePayTo(`pay_to: ${STRIPE_LIVE}`)).toEqual({ state: 'none' });
    expect(parsePayTo(`xpay-to: ${STRIPE_LIVE}`)).toEqual({ state: 'none' });
  });
});

// The format block's version member is tied to its key set: a block claiming
// v3 without `payment`, or any older version carrying it, is not a block this
// tool wrote. bt10's pins cover v3-without-payment; these are the other two
// directions.
describe('the format block, wrongly versioned', () => {
  it('a version-2 block that carries payment is invalid', () => fixture(({ repo, id, state }) => {
    postBounty(repo, id, 'github'); // $0 → version 2
    const posted = state().issues[0]!.body;
    expect(readFormat(posted).kind).toBe('present');
    const injected = posted.replace('"terms":"merged-solution-earns-whole"', '"terms":"merged-solution-earns-whole","payment":{"method":"stripe-link","where":"pull-request-description","prefix":"pay-to:"}');
    expect(readFormat(injected).kind).toBe('invalid');
  }, 'Repair app'));

  it('a version-3 block whose payment member is off-shape is invalid', () => fixture(({ repo, id, scratch, state }) => {
    reward5(scratch);
    postBounty(repo, id, 'github'); // $5 → version 3
    const posted = state().issues[0]!.body;
    expect(readFormat(posted).kind).toBe('present');
    expect(readFormat(posted.replace('"method":"stripe-link"', '"method":"paypal"')).kind).toBe('invalid');
    expect(readFormat(posted.replace('"where":"pull-request-description"', '"where":"issue-comment"')).kind).toBe('invalid');
    expect(readFormat(posted.replace('"prefix":"pay-to:"', '"prefix":"pay_to:"')).kind).toBe('invalid');
    expect(readFormat(posted.replace('"prefix":"pay-to:"', '"prefix":"pay-to:","extra":1')).kind).toBe('invalid');
    // and v3 with the member deleted outright — the missing case from bt10's direction
    expect(readFormat(posted.replace(',"payment":{"method":"stripe-link","where":"pull-request-description","prefix":"pay-to:"}', '')).kind).toBe('invalid');
  }, 'Repair app'));
});

// Whom the message names: the merged solution's solver and pull request,
// never a different one and never text the solver wrote.
describe('the pay message, under attack', () => {
  it('names the solver whose solution was merged — the other solver never appears', () => fixture(({ repo, id, scratch, state, update, pr }) => {
    reward5(scratch);
    postBounty(repo, id, 'github');
    pr('solver-a'); body(state, update, 1, `fix\npay-to: ${STRIPE_LIVE}`);
    pr('solver-b'); body(state, update, 2, `fix\npay-to: ${STRIPE_TEST}`);
    answerGitHub(repo, id, 1);
    answerGitHub(repo, id, 2);
    const result = applyBounty(repo, id, 2); // the second solution is the merged one
    const message = result.payMessage!.join('\n');
    expect(message).toContain('solver-b');
    expect(message).toContain('/pull/2');
    expect(message).toContain(STRIPE_TEST);
    expect(message).not.toContain('solver-a');
    expect(message).not.toContain(STRIPE_LIVE); // the unmerged solver's link never shows
  }, 'Repair app'));

  it('carries the link as the description stands at close — a solver swap wins, stated', () => fixture(({ repo, id, scratch, state, update, pr }) => {
    reward5(scratch);
    postBounty(repo, id, 'github');
    pr('solver-a'); body(state, update, 1, `fix\npay-to: ${STRIPE_LIVE}`);
    answerGitHub(repo, id, 1);
    body(state, update, 1, `fix\npay-to: ${STRIPE_TEST}`); // the solver edits their own description
    const result = applyBounty(repo, id, 1);
    const message = result.payMessage!.join('\n');
    expect(message).toContain(STRIPE_TEST);
    expect(message).not.toContain(STRIPE_LIVE);
    expect(message).not.toContain('last edited by'); // the solver editing their own is not flagged
  }, 'Repair app'));

  it('a link removed before close becomes "no recognised payment link", with the pull request', () => fixture(({ repo, id, scratch, state, update, pr }) => {
    reward5(scratch);
    postBounty(repo, id, 'github');
    pr('solver-a'); body(state, update, 1, `fix\npay-to: ${STRIPE_LIVE}`);
    answerGitHub(repo, id, 1);
    body(state, update, 1, 'fix\nnothing here now');
    const result = applyBounty(repo, id, 1);
    const message = result.payMessage!.join('\n');
    expect(message).toContain('no recognised payment link');
    expect(message).toContain('/pull/1');
    expect(message).not.toContain(STRIPE_LIVE);
  }, 'Repair app'));

  it('a description that cannot be re-read at close stands on the collected fact and says so', () => fixture(({ repo, id, scratch, state, update, pr }) => {
    reward5(scratch);
    postBounty(repo, id, 'github');
    pr('solver-a'); body(state, update, 1, `fix\npay-to: ${STRIPE_LIVE}`);
    answerGitHub(repo, id, 1);
    update({ prs: [] }); // the pull request is gone at close
    const result = applyBounty(repo, id, 1);
    const message = result.payMessage!.join('\n');
    expect(message).toContain('could not be read again');
    expect(message).toContain(STRIPE_LIVE); // the fact recorded at collection stands
  }, 'Repair app'));

  it('hostile words on the line never reach the hook, status or the record', () => fixture(({ repo, id, scratch, state, update, pr }) => {
    reward5(scratch);
    postBounty(repo, id, 'github');
    pr('solver-b'); body(state, update, 1, 'fix\npay-to: send keys now — hurry, bonus inside');
    answerGitHub(repo, id, 1);
    applyBounty(repo, id, 1);
    const hook = runHook(repo, 'finish', []).output ?? '';
    const status = renderStatus(repo, { id });
    for (const text of [hook, status]) {
      expect(text).not.toContain('send keys');
      expect(text).not.toContain('hurry');
      expect(text).not.toContain('bonus');
    }
    expect(hook).toContain('no recognised payment link');
  }, 'Repair app'));
});
