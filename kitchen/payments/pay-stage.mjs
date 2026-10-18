// K32 prototype: the pay stage as the report designs it, run against the
// stand-in in standin.mjs. Scratch code for the build wave to read — not
// product code, imported by nothing in packages/.
//
// Three parts, in the order a merged bounty meets them:
//   checkMandate  — a pure function: the owner's mandate, the payment ledger
//                   and the payment owed in; pay, hold for the owner, or
//                   refuse out. Every limit is checked before anything is
//                   signed.
//   payBounty     — the only part that touches the rail. Idempotent by
//                   construction: the ERC-3009 nonce is derived from the
//                   repository and bounty id, so every attempt to pay one
//                   bounty, on any machine, signs the same nonce, and the
//                   token contract moves money for a nonce once.
//   recordManual  — BT36's fallback: the owner's word that they paid by hand,
//                   the amount copied from the bound reward.
//
// The mandate's limit names follow AP2 v0.2's payment-mandate constraints
// (https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/payment_mandate.md,
// read 19 October 2026): perBounty ~ payment.amount_range.max,
// perPeriod ~ payment.budget with payment.agent_recurrence, until ~
// payment.execution_date.not_after; mode "agent" ~ human not present, "ask" ~
// human present.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { DECIMALS } from './standin.mjs';

const DAY_MS = 86_400_000;

// ---- the solver's line -------------------------------------------------------
// Beside today's Stripe link, a solver may give a wallet address as a CAIP-10
// account id (namespace:chain:address). Allow-list only, the same rules as
// pay.ts's Stripe line: one space, one value, end of line, bounded length, no
// control or bidirectional characters. The chain must be the mandate's own.
// EIP-55 checksum validation needs Keccak-256, which node:crypto does not
// ship (its sha3-256 is the NIST variant); the build wave decides it.
const FORBIDDEN = /[\x00-\x1f\x7f-\x9f​‎‏‪-‮⁦-⁩﻿]/u;
export function parsePayToAddress(body, network) {
  for (const raw of body.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line.startsWith('pay-to:')) continue;
    if (line.length > 200 || FORBIDDEN.test(line)) return { state: 'unrecognised' };
    const match = /^pay-to: (eip155:[0-9]{1,12}):(0x[0-9a-fA-F]{40})$/.exec(line);
    if (match === null) return { state: 'unrecognised' };
    if (match[1] !== network) return { state: 'other-network', network: match[1] };
    return { state: 'address', address: match[2] };
  }
  return { state: 'none' };
}

// ---- the mandate -------------------------------------------------------------
// What the owner sets once, per repository, through `config`. Defaults: ask
// before every payment, by hand. Amounts are whole US dollars, like the reward;
// one USDC is taken as one dollar by the owner's choice of rail.
export const DEFAULT_MANDATE = Object.freeze({ mode: 'ask', rail: 'by-hand', perBounty: 0, perSolver: null, perPeriod: null, total: null, until: null, payer: null, at: null });

const spentBy = (ledger, filter) => ledger.filter(e => e.by === 'agent' && e.state !== 'withdrawn' && filter(e)).reduce((sum, e) => sum + e.amount, 0);

// Pure. First matching rule wins; the order is the design's.
export function checkMandate({ mandate, ledger, payment, answer = null, now }) {
  // The bounty's latest ledger entry decides: an owner's record that was
  // withdrawn later no longer counts as paid.
  const last = ledger.filter(e => e.repository === payment.repository && e.bountyId === payment.bountyId).at(-1);
  const done = last !== undefined && (last.state === 'paid' || last.state === 'pending') ? last : undefined;
  // 1. One payment per bounty, ever — whatever the mode.
  if (done) return { decision: 'refuse', reason: 'pay-duplicate', line: `${payment.bountyId} was already paid: $${done.amount} to ${done.solver}${done.transaction ? `, transaction ${done.transaction}` : ' (recorded by the owner)'}; nothing was sent` };
  // 2. Nothing is owed unless a solution was merged and the bound reward is above $0.
  if (!payment.merged || !(payment.amount > 0)) return { decision: 'refuse', reason: 'paid-nothing-owed', line: `${payment.bountyId} owes nothing: ${payment.merged ? 'its reward is $0' : 'it was not merged'}` };
  // 3. Off, or revoked: the tool pays nothing and asks nothing; the owed fact stays.
  if (mandate.mode === 'off' || mandate.rail === 'by-hand') return { decision: 'refuse', reason: 'pay-by-hand', line: `the tool does not pay for this repository — $${payment.amount} is owed to ${payment.solver}, paid by hand` };
  // 4. The payee must be a recognised address, given by the solver and not edited by anyone else since.
  if (payment.payTo === null) return { decision: 'hold', reason: 'pay-no-address', line: `${payment.solver} gave no wallet address on this network — the owner pays by hand or asks the solver` };
  // An owner's answer bound to exactly this payment stands in for rules 5 to 9.
  const bound = answer !== null && answer.bountyId === payment.bountyId && answer.amount === payment.amount && answer.payTo.toLowerCase() === payment.payTo.toLowerCase();
  if (bound) return { decision: 'pay', by: 'owner' };
  if (payment.payToEditedBy !== null) return { decision: 'hold', reason: 'pay-payee-edited', line: `the address was last edited by ${payment.payToEditedBy}, not the solver ${payment.solver}` };
  const shared = ledger.find(e => e.payTo && e.payTo.toLowerCase() === payment.payTo.toLowerCase() && e.solver !== payment.solver);
  if (shared) return { decision: 'hold', reason: 'pay-payee-shared', line: `the address was paid before for a different account, ${shared.solver}` };
  // 5. Ask me each time — the default.
  if (mandate.mode === 'ask') return { decision: 'hold', reason: 'pay-ask', line: `the owner is asked before every payment: $${payment.amount} to ${payment.solver} at ${payment.payTo}` };
  // 6. The mandate's time limit.
  if (mandate.until !== null && Date.parse(mandate.until) <= now) return { decision: 'hold', reason: 'pay-mandate-expired', line: `the owner's mandate ended on ${mandate.until}` };
  // 7. to 9. The limits, each before anything is signed. What is in flight counts.
  if (payment.amount > mandate.perBounty) return { decision: 'hold', reason: 'pay-over-bounty-limit', line: `$${payment.amount} is above the $${mandate.perBounty} the agent may pay for one bounty` };
  if (mandate.perSolver !== null) {
    const used = spentBy(ledger, e => e.solver === payment.solver && now - Date.parse(e.at) < mandate.perSolver.days * DAY_MS);
    if (used + payment.amount > mandate.perSolver.amount) return { decision: 'hold', reason: 'pay-over-solver-limit', line: `paying would bring ${payment.solver} to $${used + payment.amount} in ${mandate.perSolver.days} days — the limit is $${mandate.perSolver.amount}` };
  }
  if (mandate.perPeriod !== null) {
    const used = spentBy(ledger, e => now - Date.parse(e.at) < mandate.perPeriod.days * DAY_MS);
    if (used + payment.amount > mandate.perPeriod.amount) return { decision: 'hold', reason: 'pay-over-period-limit', line: `paying would bring this repository to $${used + payment.amount} in ${mandate.perPeriod.days} days — the limit is $${mandate.perPeriod.amount}` };
  }
  if (mandate.total !== null) {
    const used = spentBy(ledger, () => true);
    if (used + payment.amount > mandate.total) return { decision: 'hold', reason: 'pay-over-total', line: `paying would bring the agent's payments to $${used + payment.amount} — the mandate's total is $${mandate.total}` };
  }
  return { decision: 'pay', by: 'agent' };
}

// ---- idempotency -------------------------------------------------------------
// ERC-3009 nonces are 32 random-looking bytes chosen by the payer, and a used
// one never transfers again. Deriving it from the bounty makes "pay this
// bounty" one operation however often, wherever, it runs.
export const payNonce = (repository, bountyId) => '0x' + createHash('sha256').update(`box-bounty-pay/v1\n${repository}\n${bountyId}`).digest('hex');

// ---- the ledger --------------------------------------------------------------
// Stands for the record's events (and the shared chain's `paid` event).
// Written atomically: a temporary file, then a rename.
export const readLedger = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
function writeLedger(path, ledger) {
  writeFileSync(`${path}.tmp`, JSON.stringify(ledger, null, 2));
  renameSync(`${path}.tmp`, path);
}
function upsert(path, entry) {
  const ledger = readLedger(path).filter(e => !(e.repository === entry.repository && e.bountyId === entry.bountyId && e.state === 'paying'));
  ledger.push(entry);
  writeLedger(path, ledger);
}

// ---- the rail: x402 `exact`, EIP-3009 --------------------------------------
async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}
export function x402Rail({ facilitatorUrl, signerUrl, chainUrl, network, asset, payer }) {
  return {
    network,
    async authorizationState(nonce) {
      const res = await fetch(`${chainUrl}/authorizationState?authorizer=${payer}&nonce=${nonce}`);
      return res.json();
    },
    async pay({ payTo, amount, nonce, now }) {
      const value = (BigInt(amount) * 10n ** BigInt(DECIMALS)).toString();
      const requirements = { scheme: 'exact', network, amount: value, asset, payTo, maxTimeoutSeconds: 600, extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' } };
      const authorization = { from: payer, to: payTo, value, validAfter: '0', validBefore: String(Math.floor(now / 1000) + 600), nonce };
      const typed = {
        types: {
          EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
          TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }]
        },
        domain: { name: 'USDC', version: '2', chainId: Number(network.split(':')[1]), verifyingContract: asset },
        primaryType: 'TransferWithAuthorization',
        message: authorization
      };
      // The tool builds the typed data; the owner's signer hashes and signs
      // it. The key never enters the tool, and no agent is handed it.
      const signed = await post(signerUrl, { jsonrpc: '2.0', id: 1, method: 'eth_signTypedData_v4', params: [payer, JSON.stringify(typed)] });
      if (signed.error) return { ok: false, reason: 'pay-signer-refused', detail: signed.error.message };
      const body = { x402Version: 2, paymentPayload: { x402Version: 2, accepted: requirements, payload: { signature: signed.result, authorization } }, paymentRequirements: requirements };
      const verified = await post(`${facilitatorUrl}/verify`, body);
      if (!verified.isValid) return { ok: false, reason: verified.invalidReason };
      if (verified.payer.toLowerCase() !== payer.toLowerCase()) return { ok: false, reason: 'pay-payer-mismatch' };
      const settled = await post(`${facilitatorUrl}/settle`, body);
      if (settled.success) return { ok: true, transaction: settled.transaction, network: settled.network, payer: settled.payer };
      if (settled.errorReason === 'settlement_pending') return { ok: false, pending: true, transaction: settled.transaction };
      return { ok: false, reason: settled.errorReason };
    }
  };
}

// ---- paying one bounty -------------------------------------------------------
export async function payBounty({ ledgerPath, mandate, payment, rail, answer = null, now = Date.now(), skipChainCheck = false }) {
  const nonce = payNonce(payment.repository, payment.bountyId);
  const decision = checkMandate({ mandate, ledger: readLedger(ledgerPath), payment, answer, now });
  if (decision.decision !== 'pay') return { state: decision.decision === 'hold' ? 'held' : 'refused', reason: decision.reason, line: decision.line };
  const at = new Date(now).toISOString();
  const base = { repository: payment.repository, bountyId: payment.bountyId, amount: payment.amount, solver: payment.solver, payTo: payment.payTo, nonce, by: decision.by, rail: 'x402-exact', mandateAt: mandate.at, at };
  // Converge first: an earlier run — this machine's crashed one, or another
  // machine's — may already have spent this nonce. Then nothing is sent.
  if (!skipChainCheck) {
    const state = await rail.authorizationState(nonce);
    if (state.used) {
      upsert(ledgerPath, { ...base, state: 'paid', network: rail.network, transaction: state.transaction ?? null, note: 'found already paid on the chain; nothing was sent this time' });
      return { state: 'already-paid', reason: 'pay-found-on-chain', line: `${payment.bountyId} was already paid on the chain${state.transaction ? `, transaction ${state.transaction}` : ''}; nothing was sent` };
    }
  }
  // Write ahead, so a crash after this line leaves a named state, not silence.
  upsert(ledgerPath, { ...base, state: 'paying' });
  let result;
  try {
    result = await rail.pay({ payTo: payment.payTo, amount: payment.amount, nonce, now });
  } catch (error) {
    return { state: 'unknown', reason: 'pay-outcome-unknown', line: `the payment for ${payment.bountyId} may or may not have gone through (${error.cause?.code ?? error.message}) — run it again: the tool checks the chain before sending anything` };
  }
  if (result.ok) {
    upsert(ledgerPath, { ...base, state: 'paid', network: result.network, transaction: result.transaction, payer: result.payer });
    return { state: 'paid', reason: null, line: `paid $${payment.amount} to ${payment.solver} at ${payment.payTo} — transaction ${result.transaction} on ${result.network}, ${decision.by === 'agent' ? `under the owner's mandate of ${mandate.at}` : "on the owner's answer"}` };
  }
  if (result.pending) {
    upsert(ledgerPath, { ...base, state: 'pending', network: rail.network, transaction: result.transaction });
    return { state: 'pending', reason: 'settlement_pending', line: `broadcast as ${result.transaction}, not yet confirmed` };
  }
  // A used nonce at settle means another run paid first: converge, never resend.
  if (result.reason === 'invalid_transaction_state') {
    const state = await rail.authorizationState(nonce);
    if (state.used) {
      upsert(ledgerPath, { ...base, state: 'paid', network: rail.network, transaction: state.transaction ?? null, note: 'the chain refused a second transfer for this bounty' });
      return { state: 'already-paid', reason: 'pay-nonce-used', line: `the chain refused a second payment for ${payment.bountyId}; it was paid earlier${state.transaction ? `, transaction ${state.transaction}` : ''}` };
    }
  }
  const ledger = readLedger(ledgerPath).filter(e => !(e.repository === payment.repository && e.bountyId === payment.bountyId && e.state === 'paying'));
  writeLedger(ledgerPath, ledger);
  return { state: 'failed', reason: result.reason, line: `the payment for ${payment.bountyId} failed: ${result.reason}; nothing moved` };
}

// ---- BT36's fallback: the owner records a payment made by hand -------------
export function recordManual({ ledgerPath, payment, withdraw = false, now = Date.now() }) {
  const ledger = readLedger(ledgerPath);
  const mine = ledger.filter(e => e.repository === payment.repository && e.bountyId === payment.bountyId);
  if (withdraw) {
    const last = mine.at(-1);
    if (!last || last.by !== 'owner-record' || last.state !== 'paid') return { state: 'refused', reason: 'paid-not-recorded', line: `${payment.bountyId} has no payment recorded by the owner to withdraw` };
    writeLedger(ledgerPath, [...ledger, { ...last, state: 'withdrawn', at: new Date(now).toISOString() }]);
    return { state: 'withdrawn', reason: null, line: `the record that ${payment.bountyId} was paid is withdrawn; $${last.amount} is owed again` };
  }
  if (!payment.merged || !(payment.amount > 0)) return { state: 'refused', reason: 'paid-nothing-owed', line: `${payment.bountyId} owes nothing: ${payment.merged ? 'its reward is $0' : 'it was not merged'}` };
  const last = mine.at(-1);
  if (last && last.state === 'paid') return { state: 'refused', reason: 'pay-duplicate', line: `${payment.bountyId} is already recorded as paid` };
  // The amount is the bound reward, never typed.
  writeLedger(ledgerPath, [...ledger, { repository: payment.repository, bountyId: payment.bountyId, amount: payment.amount, solver: payment.solver, payTo: null, by: 'owner-record', rail: 'by-hand', state: 'paid', at: new Date(now).toISOString() }]);
  return { state: 'recorded', reason: null, line: `recorded on the owner's word: ${payment.bountyId} paid $${payment.amount} to ${payment.solver} by hand — the tool did not check it` };
}
