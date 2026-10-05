# D1.1 supported case: private-shop delegation fixture

Wave: W003 revision 2026-10-05-d1.1-r3. Task D1.1 under tasks/box-delegation-task-graph.json.
This document selects exactly one supported fixture and two supported work requests. It is a design record: nothing here was executed, no fixture or package was created, and no example file was modified in this wave.

## Chosen fixture: examples/private-shop

One fixture, already in the repository: `examples/private-shop/`. It is synthetic, modular TypeScript (Fastify 5 + React 19 + zod 4, `package.json` `@private-task/private-shop`), non-sensitive by construction, and was authored with a delegation exercise in mind: `fixture.json` declares `preChangeRevision: "private-shop-before-v1"`, an owner-registration `snapshotPaths` allowlist (protected modules remain owner-side provenance, not recipient export), `plannerExcludedPaths`, `initialCoupling` entries that mark the private modules as protected, and `knownMissingBehaviour` that maps directly onto our two requests. `fixture.json` also records `realBillingOrAuthentication: false`, so no payment/auth gate is exercised.

Baseline for the fixture design: the pre-change tree of `examples/private-shop` as it exists in source at baseline HEAD `021024594c8b08ef7a8b24e08cfb7c8b9e021086` (accepted B1.1 source `a38c1e01cdf139af31a80d816efce8b9e023513a`; verify the per-file manifest in D1.2 at registration time rather than trusting this sentence). The fixture's own revision label is `private-shop-before-v1`, served literally by `src/server.ts` `/health`. When D1.2 registers the fixture, the owner Git baseline is a real commit SHA pinned in an isolated owner clone, not the prose label.

### Proposed source/module graph (actual imports, read-only verified)

- `src/server.ts` — Fastify app factory `createPrivateShopApi()`; imports `selectPlan` from `./selection/api.js` and `applyResponsePolicy`, `loadResponsePolicy` from `./policy/loader.js`; reads `config/response-security.json` at startup; applies the response policy in an `onSend` hook; enforces host/origin in `onRequest`.
- `src/selection/api.ts` — `selectPlan(body, trustedSubject)`; zod-validates `{ selectedId }`; calls `derivePrivateOptions` from `../private/eligibility.js`.
- `src/selection/SelectionPanel.tsx` — React UI; consumes the same eligibility options (fixture `initialCoupling` row).
- `src/ranking/rankPrivateItems.ts` — `rankPrivateItems(items)`; sorts **in place** by `privateScore` imported from `../private/scoring.js`. Both defects are listed in `knownMissingBehaviour`.
- `src/policy/loader.ts` — `ResponsePolicySchema`, `loadResponsePolicy`, `applyResponsePolicy`; parses via `parseStrictJson` from `./strict-json.js`.
- `src/policy/strict-json.ts` — dependency-free strict JSON parser; the shared helper.
- `src/private/eligibility.ts`, `src/private/scoring.ts` — protected owner modules; `fixture.json` `initialCoupling` marks them as the dependencies that must not silently escape into a package.
- `config/response-security.json` — the policy data the loader validates.
- `src/main.tsx`, `index.html`, `vite.config.ts`, `dist/`, `node_modules/`, `reference-solutions/` — out of package scope (`plannerExcludedPaths` covers the last three categories).

External dependencies are request-specific, not dummy requirements: Request A needs `zod` 4.6.5 (declared in the fixture `package.json`); Request B needs no production dependency. The owner-side shared helper included in Request A's package is `src/policy/strict-json.ts`. Neither runnable closure needs Fastify or React type/runtime packages.

## Runnable selected-source closures

The package proof uses two distinct sets of files. The **runnable closure** contains every source file needed to compile and run the scoped checks; it must not include a file that imports excluded owner modules. **Read-only explanatory context** may include only non-protected owner files that explain behavior; those files are not copied into the package compile path and cannot become contribution outputs. The protected excluded modules `src/private/eligibility.ts` and `src/private/scoring.ts` are never exported as raw source, even as explanatory context. A full owner clone can be used to create the owner baseline or to run the ordinary-delegation comparison; it is not proof that a selected-source package is portable.

### Request A runnable closure

| Package member | Source and role |
| --- | --- |
| `src/policy/loader.ts` | copied from `examples/private-shop/src/policy/loader.ts`; editable only if the approved agreement explicitly permits it, otherwise read-only package source. |
| `src/policy/strict-json.ts` | copied from `examples/private-shop/src/policy/strict-json.ts`; shared helper, read-only package source. |
| `src/config/response-security.json` | copied from `examples/private-shop/config/response-security.json`; the only editable contribution file for Request A. The owner patch maps it back to `config/response-security.json`. |
| `package.json`, `tsconfig.json` | generated package scaffold. Runtime dependency `zod: 4.6.5`; declared toolchain `node >=24.11.0 <25`, `pnpm 10.34.5`, `typescript 6.0.3`, `vitest 5.0.1`. No React dependency is included because no UI file is runnable in this package. |
| `evaluator/request-a.test.ts` plus evaluator config | evaluator-owned checks that call `loadResponsePolicy` and `applyResponsePolicy` directly. Not contribution source and not an owner patch candidate. |

Check entrypoints for the exported package are `pnpm exec tsc --noEmit` and `pnpm exec vitest run evaluator/request-a.test.ts`. The package source mapping is `src/policy/* -> src/policy/*` and `src/config/response-security.json -> config/response-security.json`.

Safe explanatory context for Request A is limited to the non-protected owner files `src/server.ts` and `src/selection/api.ts`. Non-protected `src/ranking/rankPrivateItems.ts` belongs only to Request B explanation, and `src/selection/SelectionPanel.tsx` belongs only to the owner-side unsupported-coupling explanation; none is a Request A contribution target. They are outside the runnable closure. `src/server.ts` is deliberately not compiled in the package because it imports `src/selection/api.ts`, which imports protected `src/private/eligibility.ts`. Protected `eligibility.ts` and `scoring.ts` raw source remains owner-only and is not exported.

### Request B runnable closure

| Package member | Source and role |
| --- | --- |
| `src/ranking/rankItems.ts` | a new owner-approved scaffold file that exports `PublicItem`, `InvalidInput`, and `rankItems`; the only editable contribution file. The owner patch maps it to the new owner path `src/ranking/rankItems.ts`. |
| `package.json`, `tsconfig.json` | generated scaffold with the same declared toolchain (`node >=24.11.0 <25`, `pnpm 10.34.5`, `typescript 6.0.3`, `vitest 5.0.1`) and no production dependency unless the approved agreement names one. |
| `evaluator/request-b.test.ts` plus evaluator config | evaluator-owned checks for non-mutation, deterministic tie order, valid output shape, rejected malformed input, and absence of forbidden imports/fields. Not contribution source. |

Check entrypoints are `pnpm exec tsc --noEmit` and `pnpm exec vitest run evaluator/request-b.test.ts`. Public inputs/outputs are the explicit `PublicItem` array contract; the public helper is `rankItems`; the declared evaluator covers non-ASCII IDs, duplicate IDs, non-finite scores, more than 1000 items, input mutation, and absence of the tokens/imports `privateScore`, `../private/scoring`, and `src/private/scoring` from the exported runnable/contribution source.

`src/ranking/rankPrivateItems.ts` and `src/selection/api.ts` are safe explanatory context only. They import protected owner modules, so they remain outside the runnable closure. Explanatory prose may name the original `privateScore` coupling, but the runnable package and contribution source must not contain `privateScore` or any import of `src/private/scoring.ts`.

## Two literal supported requests

### Request A — strengthen the response security policy

Request (as pasted by a PM/owner):
> "Harden the shop's response headers. Set frame-ancestors to 'none', turn on X-Content-Type-Options nosniff, set Referrer-Policy to no-referrer, and enable HSTS with a one-year max-age (no includeSubDomains). Keep /health exempt from all of it."

Editable paths: `config/response-security.json` only.
Read context: `src/policy/loader.ts`, `src/policy/strict-json.ts` (shared helper, included), plus safe non-protected explanatory `src/server.ts` and `src/selection/api.ts` (outside the runnable closure and not contribution targets).
Observable output: `config/response-security.json` contains `frameAncestors: "none"`, `noSniff: true`, `referrerPolicy: "no-referrer"`, and `hsts: {enabled: true, maxAgeSeconds: 31536000, includeSubDomains: false}`. Constraints: the contributor must not change application code, must not add dependencies, and must not make `/health` receive these headers.
Owner validation/integration: owner applies the returned patch to the real repository and verifies both levels truthfully:
- helper level: `applyResponsePolicy` must emit `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security: max-age=31536000` when its input context is `https: true`, `localhost: false`, and a non-`/health` route;
- live local-server level: `src/server.ts` currently calls the policy helper with `localhost: true`, so a local `/selection` response must show the non-HSTS hardening headers and must not show `Strict-Transport-Security`. `/health` must remain exempt from all four policy headers. No live non-localhost HSTS claim is valid without a separately approved fixture/server change.

Literal completion example: after the change, `config/response-security.json` equals
`{"schemaVersion":1,"frameAncestors":"none","noSniff":true,"referrerPolicy":"no-referrer","hsts":{"enabled":true,"maxAgeSeconds":31536000,"includeSubDomains":false}}`
— matching `reference-solutions/response-security.json` in content (its presence supports feasibility; it is not shipped to the recipient).

### Request B — non-mutating, deterministic ranking

Request:
> "Ranking silently reorders the caller's array and resolves ties unpredictably. Give me a ranking function that leaves the input untouched and breaks equal scores by the item's ASCII id, ascending. Reject malformed input — non-ASCII ids, non-finite scores, duplicate ids, more than 1000 items — instead of ranking it."

Editable paths: new file `src/ranking/rankItems.ts` exporting `rankItems(items: readonly PublicItem[]): PublicItem[]` and `InvalidInput`. `rankPrivateItems.ts` and its callers stay unchanged; migrating callers is an owner-side decision, out of this Box.
Read context: `src/ranking/rankPrivateItems.ts` (shows current contract and the `privateScore` coupling), `src/selection/api.ts` (house style for input validation).
Shared-dependency note: Request B needs no private-module source at all — the declared contract deliberately does not call `privateScore`, so `src/private/scoring.ts` stays excluded. That is what makes it a clean portability exercise. `zod` remains the fixture's shared dependency in Request A; Request B's runnable closure has no production dependency. No new dependencies are introduced.
Observable output: a new `src/ranking/rankItems.ts` exports `PublicItem`, `InvalidInput`, and `rankItems`. Constraints apply to runnable/contribution source: no `privateScore`, no import from protected `src/private/scoring.ts`, no edit to `rankPrivateItems.ts` or selection/UI files, no caller migration, and no new production dependency.
Owner validation/integration: owner verifies in the real repo that `rankItems` does not mutate its input array, orders equal scores by ASCII id (`[{id:'b',score:1},{id:'a',score:1}]` -> `['a','b']`), throws `InvalidInput` on `score: NaN`, non-ASCII/duplicate ids, oversized input, and malformed members, and that `rankPrivateItems`/`scoring.ts` behavior is untouched.

Literal completion example:
Input `[{id:'z1',score:2},{id:'a2',score:2},{id:'m',score:5}]` -> output `[{id:'m',score:5},{id:'a2',score:2},{id:'z1',score:2}]`, and the input array retains its original order after the call. `reference-solutions/rankItems.ts` demonstrates this contract exists in the tree; the recipient never sees it.

## Excluded owner modules

For both requests the recipient export never includes protected raw source: `src/private/eligibility.ts` or `src/private/scoring.ts`. The runnable/contribution surface also excludes `src/selection/SelectionPanel.tsx`, `src/main.tsx`, `index.html`, `vite.config.ts`, `dist/`, `node_modules/`, `reference-solutions/`, `.git` history, and every credential/remote. Safe explanatory context may include only actual non-protected files designed for that request (`src/server.ts`, `src/selection/api.ts`, or `src/ranking/rankPrivateItems.ts`); it cannot contain protected module bytes and cannot become a contribution output. The recipient works from the runnable closure plus declared dependencies — Request A declares only `zod`; Request B declares no production dependency — with no dummy dependency or hidden owner fetch. Full clone portability is not claimed and not required (see FIRST-IMPLEMENTATION-BRIEF.md).

## Unsupported coupling case

> "Let customers pick plans that are currently unavailable — surface every option in `/selection` and let the UI select any of them."

Serving this correctly requires changing `derivePrivateOptions` in `src/private/eligibility.ts` and `src/selection/SelectionPanel.tsx`. `eligibility.ts` is the protected module the package must not export, and the UI change sits outside the declared editable surface. This request must be classified a preparation gap (unsupported coupling: required edit touches an excluded protected dependency), not silently "fixed" by shipping the private module or the whole repo.

## Read context / editable paths / owner validation separation

| Layer | Contents |
|---|---|
| Read context (non-editable; source shown for understanding, not copied into the package compile path) | Request A: `src/server.ts`. Request B: `src/ranking/rankPrivateItems.ts`, `src/selection/api.ts`. |
| Runnable package source | Request A: `src/policy/loader.ts`, `src/policy/strict-json.ts`, `src/config/response-security.json`. Request B: `src/ranking/rankItems.ts` scaffold. |
| Editable paths | Request A: package `src/config/response-security.json`, mapped to owner `config/response-security.json`. Request B: package/owner `src/ranking/rankItems.ts` (new). |
| Owner-side validation & integration | Full repository, real `/health` and `/selection` behavior, reviewer, merge authority. Never part of the package. |

Each request is one coherent connected change (single outcome, one editable surface) — not split into per-file or per-sentence Boxes.

## Intake and deterministic floor labels

Primary intake is a direct request or pasted issue. Chat/conversation is optional clarification only and is not required for either request. No live model is required or claimed: the deterministic floor can assemble these drafts from the request text plus the registered fixture manifest.

The deterministic supported-case floor labels are:

- `delegation.private-shop.request-a.response-policy`: the literal header request above, mapped to editable `config/response-security.json`, the policy runnable closure, the helper-level HTTPS/non-localhost HSTS check, and the live-localhost no-HSTS distinction.
- `delegation.private-shop.request-b.public-ranking`: the literal ranking request above, mapped to new editable `src/ranking/rankItems.ts`, the public ranking runnable closure, and the forbidden `privateScore`/protected-scoring checks.
- `delegation.private-shop.unsupported-private-ui-coupling`: the unavailable-plan request below, classified as a preparation gap because it requires protected eligibility and excluded UI edits.

## Predeclared ordinary-delegation comparison

Before any results exist, we declare the baseline: **ordinary issue-plus-contributor delegation** — the same owner writes the same two requests as plain issues, hands them to a contractor it selects, and grants that contractor whatever access the team normally grants (which may include a full repository clone; that difference is part of the test, per VALIDATION-PLAN.md).

Equal obligations on both routes: identical outcome, acceptance criteria, quality bar, and owner verification steps. Compare **total effort**, not just implementation minutes:

- common onboarding (repository/org familiarisation, amortised across tasks and recorded separately from per-Box effort);
- per-task owner preparation (scoping, writing the agreement, context selection, package assembly vs. writing the issue and granting access);
- recipient setup and investigation (time to a usable baseline, dependency/tool/cache differences, prior fixture familiarity — recorded, not assumed equal);
- clarification rounds on both routes;
- owner acceptance, integration and rework, including rejected attempts;
- missing observations stay missing — never filled with zero;
- failed, abandoned and unsupported cases stay in the denominator.

Disclosed asymmetries to record: Box recipient gets selected source only; baseline contractor may get more access, different cache warmth, or existing repo familiarity. No percentage saving is promised in advance. Documented competitive overlap (VALIDATION-PLAN.md): GitStart Ticket Studio (codebase-grounded specs, sliced repos, delivery teams), Algora (contractor management, outcome-based payments), GitHub Copilot cloud agent (delegated tasks returning PRs) and Coder (governed workspaces). These are published capabilities, not benchmarks; self-service and human/agent support are not proven differentiation. No vendor access is procured and no outreach occurs in this wave or under D1.

Commercial limits: a synthetic two-request comparison cannot establish human repeat use, payment, market demand, or novelty. If a comparable authorised baseline run is not possible, that is recorded as a missing-evidence gap with the smallest pilot proposal — never an invented baseline.
