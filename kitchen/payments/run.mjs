// K32 prototype: the scripted run. `node kitchen/payments/run.mjs`
// Starts the stand-in on 127.0.0.1, plays the brief's step-4 outcomes and the
// design's failure cases against it, prints one line per expected outcome, and
// exits 1 if any outcome differs. Writes only inside one fresh folder it
// creates under the system temp directory and removes that folder at the end.
// No real network, wallet, key or money.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSET, NETWORK, startStandin } from './standin.mjs';
import { DEFAULT_MANDATE, checkMandate, parsePayToAddress, payBounty, payNonce, readLedger, recordManual, x402Rail } from './pay-stage.mjs';

const OWNER = '0x1111111111111111111111111111111111111111';
const OCTO = '0x2222222222222222222222222222222222222222';
const HUBOT = '0x3333333333333333333333333333333333333333';
const MONA = '0x4444444444444444444444444444444444444444';
const USDC = n => BigInt(n) * 1_000_000n;
const REPO = 'example/sandbox';
const NOW = Date.parse('2026-10-19T12:00:00Z');

const scratch = mkdtempSync(join(tmpdir(), 'k32-payments-'));
const standin = await startStandin({ balances: { [OWNER]: USDC(1000) } });
const rail = x402Rail({ facilitatorUrl: standin.facilitatorUrl, signerUrl: standin.signerUrl, chainUrl: standin.chainUrl, network: NETWORK, asset: ASSET, payer: OWNER });
const MANDATE = { mode: 'agent', rail: 'x402-exact', perBounty: 20, perSolver: { amount: 20, days: 30 }, perPeriod: { amount: 50, days: 30 }, total: 100, until: '2027-01-01T00:00:00Z', payer: OWNER, at: '2026-10-19T09:00:00Z' };
const owed = (bountyId, amount, solver, payTo, extra = {}) => ({ repository: REPO, bountyId, merged: true, amount, solver, payTo, payToEditedBy: null, ...extra });

let failures = 0;
let checks = 0;
function expect(name, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `\n     ${detail}` : ''}`);
}
const snapshot = () => ({ owner: standin.balanceOf(OWNER), octo: standin.balanceOf(OCTO), signs: standin.chain.calls.sign, settles: standin.chain.calls.settle });

try {
  const ledger = join(scratch, 'ledger.json');

  // 1. A merged bounty with a $5 reward under a $20 mandate is paid once.
  let before = snapshot();
  let r = await payBounty({ ledgerPath: ledger, mandate: MANDATE, payment: owed('b1', 5, 'octo', OCTO), rail, now: NOW });
  let after = snapshot();
  expect('1 a $5 reward under a $20 mandate is paid', r.state === 'paid' && before.owner - after.owner === USDC(5) && after.octo - before.octo === USDC(5) && after.settles - before.settles === 1, r.line);

  // 2. A second payment for the same bounty is refused as a duplicate.
  before = snapshot();
  r = await payBounty({ ledgerPath: ledger, mandate: MANDATE, payment: owed('b1', 5, 'octo', OCTO), rail, now: NOW + 1000 });
  after = snapshot();
  expect('2 a second payment for the same bounty is refused as a duplicate', r.state === 'refused' && r.reason === 'pay-duplicate' && after.owner === before.owner && after.signs === before.signs, r.line);

  // 2a. The same, from a second machine whose ledger never saw the first payment:
  //     the derived nonce is already spent, so the chain check finds it and nothing is signed.
  const ledger2 = join(scratch, 'ledger-second-machine.json');
  before = snapshot();
  r = await payBounty({ ledgerPath: ledger2, mandate: MANDATE, payment: owed('b1', 5, 'octo', OCTO), rail, now: NOW + 2000 });
  after = snapshot();
  expect('2a a second machine with no record of the payment pays nothing', r.state === 'already-paid' && after.owner === before.owner && after.signs === before.signs && readLedger(ledger2).at(-1)?.state === 'paid', r.line);

  // 2b. The second lock on its own: skip the chain check, so the payment is signed
  //     again with the same nonce — the stand-in token contract refuses to move money twice.
  const ledger3 = join(scratch, 'ledger-third-machine.json');
  before = snapshot();
  r = await payBounty({ ledgerPath: ledger3, mandate: MANDATE, payment: owed('b1', 5, 'octo', OCTO), rail, now: NOW + 3000, skipChainCheck: true });
  after = snapshot();
  expect('2b with the tool\'s own checks bypassed, the reused nonce still moves nothing', r.state === 'already-paid' && r.reason === 'pay-nonce-used' && after.owner === before.owner && after.signs === before.signs + 1, r.line);

  // 3. A $25 reward exceeds the mandate and is held for the owner — nothing signed.
  before = snapshot();
  r = await payBounty({ ledgerPath: ledger, mandate: MANDATE, payment: owed('b2', 25, 'octo', OCTO), rail, now: NOW });
  after = snapshot();
  expect('3 a $25 reward above the $20 mandate is held for the owner', r.state === 'held' && r.reason === 'pay-over-bounty-limit' && after.signs === before.signs && after.owner === before.owner, r.line);

  // 4. A revoked mandate refuses — nothing signed, the payment stays owed by hand.
  before = snapshot();
  r = await payBounty({ ledgerPath: ledger, mandate: { ...MANDATE, mode: 'off' }, payment: owed('b3', 5, 'hubot', HUBOT), rail, now: NOW });
  after = snapshot();
  expect('4 a revoked mandate refuses', r.state === 'refused' && r.reason === 'pay-by-hand' && after.signs === before.signs, r.line);

  // 4a. An expired mandate holds for the owner instead of paying.
  r = await payBounty({ ledgerPath: ledger, mandate: { ...MANDATE, until: '2026-10-01T00:00:00Z' }, payment: owed('b3', 5, 'hubot', HUBOT), rail, now: NOW });
  expect('4a a mandate past its time limit holds for the owner', r.state === 'held' && r.reason === 'pay-mandate-expired', r.line);

  // 5. The proof is recorded: what was paid, to whom, under which mandate, with the rail's reference.
  const proof = readLedger(ledger).find(e => e.bountyId === 'b1');
  const proofOk = proof?.state === 'paid' && /^0x[0-9a-f]{64}$/.test(proof.transaction ?? '') && proof.network === NETWORK && proof.payer === OWNER && proof.payTo === OCTO && proof.amount === 5 && proof.nonce === payNonce(REPO, 'b1') && proof.mandateAt === MANDATE.at && proof.by === 'agent';
  expect('5 the proof is recorded', proofOk, proof ? `paid ${proof.amount} by ${proof.by} to ${proof.solver} ${proof.payTo}, ${proof.network} transaction ${proof.transaction}, nonce ${proof.nonce.slice(0, 18)}..., mandate of ${proof.mandateAt}` : 'no entry');

  // Beyond the brief's five: the design's failure and safety cases.

  // 6. Ask me each time (the default mode) holds; the owner's answer bound to exactly this payment pays it; a drifted answer does not.
  const ask = { ...MANDATE, mode: 'ask' };
  r = await payBounty({ ledgerPath: ledger, mandate: ask, payment: owed('b4', 5, 'hubot', HUBOT), rail, now: NOW });
  expect('6 ask me each time holds the payment for the owner', r.state === 'held' && r.reason === 'pay-ask', r.line);
  r = await payBounty({ ledgerPath: ledger, mandate: ask, payment: owed('b4', 5, 'hubot', HUBOT), rail, now: NOW, answer: { bountyId: 'b4', amount: 5, payTo: OCTO } });
  expect('6a an answer bound to a different address does not pay', r.state === 'held' && r.reason === 'pay-ask', r.line);
  r = await payBounty({ ledgerPath: ledger, mandate: ask, payment: owed('b4', 5, 'hubot', HUBOT), rail, now: NOW, answer: { bountyId: 'b4', amount: 5, payTo: HUBOT } });
  expect('6b the owner\'s answer bound to this payment pays it, recorded as the owner\'s', r.state === 'paid' && readLedger(ledger).find(e => e.bountyId === 'b4')?.by === 'owner', r.line);

  // 7. A payment failing midway: the facilitator settles, then the connection dies before the tool hears back.
  before = snapshot();
  standin.faults.dropNextSettleResponse = true;
  r = await payBounty({ ledgerPath: ledger, mandate: MANDATE, payment: owed('b5', 5, 'octo', OCTO), rail, now: NOW });
  const mid = readLedger(ledger).find(e => e.bountyId === 'b5');
  expect('7 a crash after settling leaves a named state, not silence', r.state === 'unknown' && mid?.state === 'paying', r.line);
  r = await payBounty({ ledgerPath: ledger, mandate: MANDATE, payment: owed('b5', 5, 'octo', OCTO), rail, now: NOW + 5000 });
  after = snapshot();
  expect('7a the rerun converges: recorded as paid, money moved exactly once', r.state === 'already-paid' && before.owner - after.owner === USDC(5) && readLedger(ledger).filter(e => e.bountyId === 'b5').length === 1, r.line);

  // 8. A forged payee: the description holding the address was last edited by someone else.
  r = await payBounty({ ledgerPath: ledger, mandate: MANDATE, payment: owed('b6', 5, 'octo', MONA, { payToEditedBy: 'mallory' }), rail, now: NOW });
  expect('8 an address edited by someone other than the solver is held', r.state === 'held' && r.reason === 'pay-payee-edited', r.line);
  r = await payBounty({ ledgerPath: ledger, mandate: MANDATE, payment: owed('b7', 5, 'mona', OCTO), rail, now: NOW });
  expect('8a an address already paid for a different account is held', r.state === 'held' && r.reason === 'pay-payee-shared', r.line);
  const lines = {
    valid: parsePayToAddress(`fixed the bug\npay-to: ${NETWORK}:${OCTO}\n`, NETWORK).state === 'address',
    short: parsePayToAddress(`pay-to: ${NETWORK}:0x1234`, NETWORK).state === 'unrecognised',
    twoSpaces: parsePayToAddress(`pay-to:  ${NETWORK}:${OCTO}`, NETWORK).state === 'unrecognised',
    trailing: parsePayToAddress(`pay-to: ${NETWORK}:${OCTO} thanks`, NETWORK).state === 'unrecognised',
    bidi: parsePayToAddress(`pay-to: ${NETWORK}:${OCTO}‮`, NETWORK).state === 'unrecognised',
    otherNetwork: parsePayToAddress(`pay-to: eip155:1:${OCTO}`, NETWORK).state === 'other-network',
    stripeLink: parsePayToAddress('pay-to: https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00', NETWORK).state === 'unrecognised'
  };
  expect('8b the address line is an allow-list', Object.values(lines).every(Boolean), Object.entries(lines).map(([k, v]) => `${k}:${v ? 'ok' : 'WRONG'}`).join(' '));

  // 9. A mandate exhausted: the per-solver and per-period limits count what was already paid.
  const ledgerP = join(scratch, 'ledger-period.json');
  const tight = { ...MANDATE, perPeriod: { amount: 20, days: 30 } };
  const p1 = await payBounty({ ledgerPath: ledgerP, mandate: tight, payment: owed('c1', 10, 'octo', OCTO), rail, now: NOW });
  const p2 = await payBounty({ ledgerPath: ledgerP, mandate: tight, payment: owed('c2', 10, 'hubot', HUBOT), rail, now: NOW });
  const p3 = await payBounty({ ledgerPath: ledgerP, mandate: tight, payment: owed('c3', 5, 'mona', MONA), rail, now: NOW });
  expect('9 a period limit, once spent, holds the next payment', p1.state === 'paid' && p2.state === 'paid' && p3.state === 'held' && p3.reason === 'pay-over-period-limit', p3.line);
  const p4 = await payBounty({ ledgerPath: ledgerP, mandate: { ...MANDATE, perPeriod: null }, payment: owed('c4', 15, 'octo', OCTO), rail, now: NOW });
  expect('9a a per-solver limit counts that solver\'s earlier payments', p4.state === 'held' && p4.reason === 'pay-over-solver-limit', p4.line);
  const p5 = await payBounty({ ledgerPath: ledgerP, mandate: tight, payment: owed('c5', 5, 'mona', MONA), rail, now: NOW + 31 * 86_400_000 });
  expect('9b the period rolls: 31 days later the same payment goes through', p5.state === 'paid', p5.line);

  // 10. BT36's fallback: the owner records a payment made by hand.
  const ledgerM = join(scratch, 'ledger-manual.json');
  const m1 = recordManual({ ledgerPath: ledgerM, payment: owed('d1', 5, 'octo', null), now: NOW });
  const m2 = recordManual({ ledgerPath: ledgerM, payment: owed('d1', 5, 'octo', null), now: NOW });
  const m3 = recordManual({ ledgerPath: ledgerM, payment: owed('d1', 5, 'octo', null), withdraw: true, now: NOW });
  const afterWithdraw = checkMandate({ mandate: DEFAULT_MANDATE, ledger: readLedger(ledgerM), payment: owed('d1', 5, 'octo', null), now: NOW });
  const m4 = recordManual({ ledgerPath: ledgerM, payment: owed('d2', 0, 'octo', null), now: NOW });
  const m5 = recordManual({ ledgerPath: ledgerM, payment: { ...owed('d3', 5, 'octo', null), merged: false }, now: NOW });
  const entry = readLedger(ledgerM).find(e => e.bountyId === 'd1');
  expect('10 the owner records a payment made by hand; the amount is the bound reward', m1.state === 'recorded' && entry.amount === 5 && entry.by === 'owner-record', m1.line);
  expect('10a recording it twice is refused; withdrawing makes it owed again', m2.reason === 'pay-duplicate' && m3.state === 'withdrawn' && afterWithdraw.reason !== 'pay-duplicate', `${m2.line} / ${m3.line}`);
  expect('10b nothing owed refuses by name: $0, or not merged', m4.reason === 'paid-nothing-owed' && m5.reason === 'paid-nothing-owed', `${m4.line} / ${m5.line}`);
  expect('10c the default mandate (ask, by hand) pays nothing itself', checkMandate({ mandate: DEFAULT_MANDATE, ledger: [], payment: owed('d4', 5, 'octo', OCTO), now: NOW }).reason === 'pay-by-hand');

  // The stand-in's whole money movement, reconciled against the ledgers.
  const moved = standin.chain.transactions.reduce((sum, t) => sum + BigInt(t.value), 0n);
  expect('11 the stand-in moved exactly what the ledgers say was paid by the rail', moved === USDC(5 + 5 + 5 + 10 + 10 + 5) && standin.balanceOf(OWNER) === USDC(1000) - moved, `${standin.chain.transactions.length} transfers, ${Number(moved) / 1e6} USDC; calls: ${JSON.stringify(standin.chain.calls)}`);
} catch (error) {
  failures += 1;
  console.log(`FAIL the run stopped: ${error.stack}`);
} finally {
  await standin.close();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`K32 prototype: ${checks - failures}/${checks} outcomes as expected${failures === 0 ? '' : ` — ${failures} differ`}`);
process.exitCode = failures === 0 ? 0 : 1;
