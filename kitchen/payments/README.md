# K32 payments prototype

Scratch code from wave K32: the pay stage's mandate, hold and idempotent payment, run against a hand-written local stand-in of an x402 facilitator, the owner's signer and the USDC token contract. Nothing here is product code, nothing in `packages/` imports it, and it never touches a real network, wallet, key or money. The report it supports is `kitchen/reviews/K32-agent-payments.md`.

## Rerun

From the repository root, with the pinned Node (22.13 or later; recorded on 24.11.0):

```
node kitchen/payments/run.mjs
```

It needs no install, no build and no network beyond 127.0.0.1. It prints one `PASS` or `FAIL` line per expected outcome and ends with `K32 prototype: <n>/<n> outcomes as expected`; the exit code is 0 only when every outcome matches. It writes only inside one fresh folder it creates under the system temp directory (`k32-payments-*`) and removes that folder before it exits. Transaction ids are random per run; every other line should match `evidence/run-2026-10-19.log`.

## Files

| File | What it is |
|---|---|
| `standin.mjs` | The stand-in: `POST /verify`, `POST /settle`, `GET /supported` in x402 v2 shapes; a JSON-RPC `eth_signTypedData_v4` signer; balances and used ERC-3009 nonces. Every shape is quoted from its specification in the header, with what is not real (the signature is an HMAC, not ECDSA). |
| `pay-stage.mjs` | The design under test: `parsePayToAddress` (the solver's address line), `checkMandate` (pure; the owner's limits in order), `payNonce` (the bounty-derived nonce), `payBounty` (chain check, write-ahead, sign, verify, settle, record, converge), `recordManual` (BT36's owner record). |
| `run.mjs` | The scripted run: the brief's step-4 outcomes (1 to 5) and the design's failure cases (6 to 11). |
| `evidence/run-2026-10-19.log` | The run recorded for the report, and the mutation check showing the run can fail. |

## What the outcomes are

1. A merged bounty with a $5 reward under a $20 per-bounty mandate is paid once.
2. A second payment for the same bounty is refused as a duplicate; 2a, the same from a second machine whose ledger never saw the first, pays nothing; 2b, with the tool's own checks bypassed, the reused nonce still moves nothing.
3. A $25 reward exceeds the mandate and is held for the owner; nothing is signed.
4. A revoked mandate refuses; 4a, an expired one holds for the owner.
5. The proof is recorded: amount, solver, address, network, transaction, nonce, the mandate it was paid under.
6. Ask me each time holds; only the owner's answer bound to exactly this payment pays it.
7. A crash after settling leaves a named state; the rerun records it as paid and moves no more money.
8. A payee line edited by someone else, or an address already paid for another account, is held; the line is an allow-list.
9. Per-period and per-solver limits count what was already paid, and roll.
10. The owner's by-hand record (BT36): amount from the bound reward, twice refused, withdrawable, refused when nothing is owed.
11. The stand-in's total money movement equals what the ledgers record.
