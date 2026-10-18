// K32 prototype: a local stand-in for the rail the report recommends — an
// x402 facilitator (the `exact` scheme on an EVM network), the owner's
// signer, and the USDC token contract's one piece of state that matters for
// payments (balances and used EIP-3009 nonces). Written by hand from the
// specifications; nothing is installed, nothing leaves 127.0.0.1, no real
// key, wallet, network or money exists anywhere in it.
//
// Shapes copied (read 19 October 2026):
//   x402 v2 core specification,
//     https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
//     §5.1 PaymentRequirements: { scheme, network, amount, asset, payTo, maxTimeoutSeconds, extra }
//     §5.2 PaymentPayload:      { x402Version, accepted, payload: { signature, authorization }, extensions? }
//          authorization:       { from, to, value, validAfter, validBefore, nonce }
//     §5.3 SettlementResponse:  { success, errorReason?, payer?, transaction, network, amount? }
//     §5.4 VerifyResponse:      { isValid, invalidReason?, payer? }
//     §7.1 POST /verify and §7.2 POST /settle, request { x402Version, paymentPayload, paymentRequirements }
//     §7.3 GET /supported:      { kinds: [{ x402Version, scheme, network }], extensions: [], signers: {} }
//     §9  error codes used here: insufficient_funds, invalid_exact_evm_payload_signature,
//          invalid_exact_evm_payload_recipient_mismatch, invalid_exact_evm_payload_authorization_value_mismatch,
//          invalid_exact_evm_payload_authorization_valid_before, invalid_transaction_state, invalid_payload
//   x402 `exact` on EVM, https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md
//     "the Facilitator cannot modify the amount or destination. They serve only as the transaction broadcaster."
//   ERC-3009 (status: Draft), https://github.com/ethereum/ERCs/blob/master/ERCS/erc-3009.md
//     typed data primaryType "TransferWithAuthorization" with fields from, to, value, validAfter,
//     validBefore, nonce (bytes32); signature requested with JSON-RPC `eth_signTypedData_v4`;
//     `authorizationState(authorizer, nonce)` is true once a nonce is used, and a used nonce never
//     transfers again — the property the design's idempotency rests on.
//
// What is NOT real here, stated so nobody mistakes it:
//   - The "signature" is an HMAC-SHA256 over the typed data with a random
//     per-run secret shared by the stand-in signer and the stand-in
//     facilitator. A real signature is secp256k1 ECDSA over an EIP-712
//     Keccak-256 digest, recovered to `from` by the facilitator. The stand-in
//     keeps the property that matters (only the signer can produce it, and
//     any change to the authorization breaks it), not the cryptography.
//   - "Transactions" are random 32-byte hex ids in memory. No chain.
//   - GET /chain/authorizationState stands in for an `eth_call` to the token
//     contract's `authorizationState(address,bytes32)` view (ERC-3009).

import { createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

export const NETWORK = 'eip155:84532'; // Base Sepolia, the x402 spec's own test network (§11.1)
export const ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC on Base Sepolia (x402 network-and-token-support table)
export const DECIMALS = 6;

const canonical = value => JSON.stringify(value, Object.keys(value).sort());

export async function startStandin({ balances }) {
  const secret = randomBytes(32); // per run; never written anywhere
  const chain = {
    balances: new Map(Object.entries(balances).map(([a, v]) => [a.toLowerCase(), BigInt(v)])),
    used: new Set(),           // `${from}:${nonce}` — ERC-3009 authorizationState
    transactions: [],          // { transaction, from, to, value, nonce }
    calls: { sign: 0, verify: 0, settle: 0 }
  };
  // Lets the scripted run simulate a process dying after the facilitator
  // settled but before the tool recorded it (the crash window).
  const faults = { dropNextSettleResponse: false };

  const signTyped = typed => '0x' + createHmac('sha256', secret).update(canonical(typed.message) + typed.domain.verifyingContract + typed.domain.chainId).digest('hex');

  function check(body) {
    const { paymentPayload: p, paymentRequirements: r } = body ?? {};
    const a = p?.payload?.authorization;
    if (body?.x402Version !== 2 || !p || !r || !a || typeof p.payload.signature !== 'string') return { invalidReason: 'invalid_payload' };
    if (r.scheme !== 'exact' || r.network !== NETWORK || r.asset !== ASSET) return { invalidReason: 'invalid_payment_requirements' };
    const typed = { domain: { verifyingContract: r.asset, chainId: Number(r.network.split(':')[1]) }, message: a };
    if (p.payload.signature !== signTyped(typed)) return { invalidReason: 'invalid_exact_evm_payload_signature' };
    if (a.to.toLowerCase() !== r.payTo.toLowerCase()) return { invalidReason: 'invalid_exact_evm_payload_recipient_mismatch', payer: a.from };
    if (a.value !== r.amount) return { invalidReason: 'invalid_exact_evm_payload_authorization_value_mismatch', payer: a.from };
    if (Number(a.validBefore) <= Math.floor(Date.now() / 1000)) return { invalidReason: 'invalid_exact_evm_payload_authorization_valid_before', payer: a.from };
    if ((chain.balances.get(a.from.toLowerCase()) ?? 0n) < BigInt(a.value)) return { invalidReason: 'insufficient_funds', payer: a.from };
    return { payer: a.from, a };
  }

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 65536) req.destroy(); });
    req.on('end', () => {
      const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
      let body = null;
      try { body = raw === '' ? null : JSON.parse(raw); } catch { return send(400, { error: 'invalid JSON' }); }
      const url = new URL(req.url, 'http://127.0.0.1');

      // The owner's signer: JSON-RPC 2.0, method eth_signTypedData_v4 (ERC-3009 "Use with web3 providers").
      if (req.method === 'POST' && url.pathname === '/signer') {
        if (body?.method !== 'eth_signTypedData_v4') return send(200, { jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32601, message: 'method not found' } });
        chain.calls.sign += 1;
        const typed = JSON.parse(body.params[1]);
        if (typed.primaryType !== 'TransferWithAuthorization' || body.params[0].toLowerCase() !== typed.message.from.toLowerCase()) return send(200, { jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'invalid params' } });
        return send(200, { jsonrpc: '2.0', id: body.id, result: signTyped(typed) });
      }
      // x402 §7.3
      if (req.method === 'GET' && url.pathname === '/supported') return send(200, { kinds: [{ x402Version: 2, scheme: 'exact', network: NETWORK }], extensions: [], signers: {} });
      // x402 §7.1 — read-only: never commits state.
      if (req.method === 'POST' && url.pathname === '/verify') {
        chain.calls.verify += 1;
        const c = check(body);
        if (c.invalidReason) return send(200, { isValid: false, invalidReason: c.invalidReason, ...(c.payer ? { payer: c.payer } : {}) });
        if (chain.used.has(`${c.a.from.toLowerCase()}:${c.a.nonce}`)) return send(200, { isValid: false, invalidReason: 'invalid_transaction_state', payer: c.payer });
        return send(200, { isValid: true, payer: c.payer });
      }
      // x402 §7.2 — the token contract refuses a used nonce (ERC-3009), so a
      // second settle of the same authorization moves nothing.
      if (req.method === 'POST' && url.pathname === '/settle') {
        chain.calls.settle += 1;
        const c = check(body);
        if (c.invalidReason) return send(200, { success: false, errorReason: c.invalidReason, ...(c.payer ? { payer: c.payer } : {}), transaction: '', network: NETWORK });
        const key = `${c.a.from.toLowerCase()}:${c.a.nonce}`;
        if (chain.used.has(key)) return send(200, { success: false, errorReason: 'invalid_transaction_state', payer: c.payer, transaction: '', network: NETWORK });
        const value = BigInt(c.a.value);
        chain.used.add(key);
        chain.balances.set(c.a.from.toLowerCase(), chain.balances.get(c.a.from.toLowerCase()) - value);
        chain.balances.set(c.a.to.toLowerCase(), (chain.balances.get(c.a.to.toLowerCase()) ?? 0n) + value);
        const transaction = '0x' + randomBytes(32).toString('hex');
        chain.transactions.push({ transaction, from: c.a.from, to: c.a.to, value: c.a.value, nonce: c.a.nonce });
        if (faults.dropNextSettleResponse) { faults.dropNextSettleResponse = false; req.socket.destroy(); return; }
        return send(200, { success: true, payer: c.payer, transaction, network: NETWORK, amount: c.a.value });
      }
      // Stand-in for eth_call authorizationState(address,bytes32) on the token contract.
      if (req.method === 'GET' && url.pathname === '/chain/authorizationState') {
        const authorizer = (url.searchParams.get('authorizer') ?? '').toLowerCase();
        const nonce = url.searchParams.get('nonce') ?? '';
        const tx = chain.transactions.find(t => t.from.toLowerCase() === authorizer && t.nonce === nonce);
        return send(200, { used: chain.used.has(`${authorizer}:${nonce}`), ...(tx ? { transaction: tx.transaction } : {}) });
      }
      send(404, { error: 'not found' });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    facilitatorUrl: base,
    signerUrl: `${base}/signer`,
    chainUrl: `${base}/chain`,
    chain,
    faults,
    balanceOf: address => chain.balances.get(address.toLowerCase()) ?? 0n,
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); })
  };
}
