# PF2: solver agents find bounties: the feed, the MCP server and RSS

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF2` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-platform-v1, D-2026-10-21-gtm-thesis, D-2026-10-21-k44-decisions
Owner context: D-2026-10-21-platform-v1 (feature 2); D-2026-10-21-gtm-thesis (agents first); D-2026-10-21-k44-decisions (decision 5: machine channels first); spend no money
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026. Before starting, the CTO reconciles it with K43's machine-interface design in `PLATFORM-UX.md` (schema, tool names, bounds) and corrects names only. **After PF1.**

**Reconciled with K43 and PF1 (names only, 31 October 2026).** Addresses: `/bounties.json`, `/bounties/<id>.json`, `/bounties.schema.json`, `/rss.xml`, `/mcp`. `state`, `approved_by`, `solutions` and `limit` (default 10, at most 25) are K43's. `owner_record` and `owner.record` wait for PF4, as in PF1; the record is `null`, not zeros, because zeros would state a fact the board has not read. Write paths the Done when needs: `packages/box-platform/`, `tests/platform/`, root `package.json`, `pnpm-lock.yaml`, `waves/PF2.md`.

## Plan

Agreed with the owner in plan mode, 31 October 2026. Read before code: feature playbook, Prove It Works. `architect` skipped: K43 settled the design.

1. No SDK in the Worker: `src/mcp.ts` is a small stateless JSON-RPC handler (initialize, ping, tools/list, tools/call). The SDK is a dev dependency only, so its real client proves the server.
2. One builder (`src/feed.ts`) for the feed, the detail file, MCP and RSS. Filters and the read-with-recheck are lifted out of `api.ts` and shared.
3. Keyset cursor, opaque; ETag is the body's SHA-256, `cache-control: no-cache`, so no cache outlives the private rule.
4. Poster text only under `poster_says`; descriptions are constants; task capped at 4,000 characters; bounds tested on maximum-size bounties.
5. Hosts: only `/mcp` takes POST; `local.ts` passes headers and body; `wrangler.toml` routes the new addresses to the Worker.
6. Steps: refactor; feed and schema; RSS; MCP with the SDK client; pages and README; bites; verify; one workerd run; fresh-agent check; CTO's own run; close.

## Outcome

A solver agent with no web browser can find bounties that match its skills, read one fully and know exactly how to answer, through a JSON feed or an MCP server. A person can follow the board by RSS. All read-only, bounded and free.

## What it does

1. **`/bounties.json`:**
   - K43's schema, with filters (language, repository, minimum stated reward, state, age), paging and a stated maximum page size;
   - each entry's fields in the order that decides a solver, ending with how to answer;
   - cacheable (ETag), so an agent polling cheaply costs little.
2. **The MCP server:**
   - Served by the platform over the MCP remote transport (Streamable HTTP), read-only, no sign-in.
   - Tools:
     - `find_bounties`: filters in, a bounded list out, with a cursor;
     - `get_bounty`: id in; out: the task marked as the poster's words, how to answer, solutions so far, the owner's payment facts once PF4 exists, and the stated reward with "the owner pays directly".
   - Tool descriptions say what the platform is and is not: it lists public GitHub bounties, carries no money, and judges nothing.
3. **RSS** of new bounties, filterable by language.
4. **Unasked text stays small** (K25 rule): a list entry is a few lines; the full task only on `get_bounty`.

## Tests (`test:platform`)

| Case | Expected |
|---|---|
| Feed schema | Validates against the published JSON schema; field order as designed |
| Bounds | No response exceeds the stated size; paging walks a 120-bounty stand-in exactly once |
| MCP | An MCP SDK client lists the tools and calls each against the local server; the outputs match the feed |
| Private repository | Never in the feed, the MCP output or RSS |
| Untrusted task text | Delivered as data, marked as the poster's words; no instruction-like text is ever placed in a tool description |
| ETag | A repeat request with the tag returns 304 |

**Fresh-agent check** (K44 experiment E3, in miniature). Two fresh sessions in scratch folders, never subagents, each given only the MCP server's address (or only the feed URL) of the local platform with the stand-in. The task: "find a bounty you could do in TypeScript, and say exactly how you would answer it and how you would be paid." Both must succeed. Record their transcripts' key steps.

## Done when

- `node scripts/verify.mjs test:platform test:kitchen` exits 0; hosted CI green after merge.
- The fresh-agent check succeeded.
- `packages/box-platform/README.md` documents the feed and the MCP tools.

## Lenses

- [x] **Security:** no private data; prompt-injection hygiene, meaning poster text never appears in tool descriptions and is always marked.
- [x] **User experience:** the CTO runs the agent task itself through MCP only.
- [x] **Measurement fairness:** the CTO checks the bounds on a stand-in it seeds.

## Notes

- Feature playbook; principles: prove-it-works.
- Downloads (the MCP SDK) on the pre-cook card.
- Do not edit `waves/PF2.md` while a verify runs. Report at the timebox.

## Result

- CTO: Claude Code desktop on Windows / Claude Opus 5.5
- Commit: `8cd800d`.
- Verify: `verify 8cd800d PASS check=0 build=0 test:platform=0 test:kitchen=0(selected 18 of 18 kitchen files) db=none 154s`. The first candidate, `fa24f5b`, also passed; two later commits changed wording found by the CTO's own run and the fresh agents.
- Level: `test-verified`, plus a real SDK client over HTTP, one workerd run and two fresh agents. 38 new tests in `tests/platform/machine.test.ts`.
- Checks:
  - The diff does what the brief says, inside the reconciled write paths. `api.ts` lost its reads to `query.ts`; the only edit to an existing test is an import path.
  - Verify passes on this commit.
  - Bites, each in the working tree and restored, each went red: visibility check always true (4 tests); recheck at render off (1); title outside `poster_says` (5); task cap off (1); 304 off (1); XML escaping off (1); cursor `>=` (10); marker text in a tool description (1); Origin check off (1).
- Done when: verify exits 0; the README documents the feed and the tools; the fresh-agent check succeeded; hosted CI is read after merge (STATUS.md).
- Fresh-agent check: two fresh sessions in empty `%TEMP%\kitchen-PF2-*` folders, run on `1974b9c`; the last commit only changes wording they raised, and they did not see it.
  - **MCP address only:** `initialize` and `tools/list` by curl, `find_bounties` language TypeScript across both pages (34), `get_bounty`. Named the fork, branch, commit and pull-request base; the owner pays $45 directly; the board carries no money.
  - **Feed URL only:** the feed and its legend, a detail, the schema; tried `solutions=0`, was refused, corrected from the error; `language=TypeScript&min_reward=1`. Same bounty, same answer and payment facts.
  - Both noticed `sample_data` and said the bounty cannot really be done. Both treated the hostile title as data.
  - They raised, and I fixed: allowed filter values missing from `about`; `stale` unexplained; "without signing in" ambiguous. Left as stated facts: nothing obliges an owner to pay, and no payment record exists until PF3 and PF4.
- Lenses:
  - **Security:** private repository tested in the feed, detail, RSS and MCP, by list, query and direct id, and after a flip. Every string carrying the marker is walked by path and must sit under `poster_says`. No poster text in descriptions, by test and by bite. Hostile titles, control characters and lone surrogates in RSS. Origin, body size, batches and a bad protocol version refused. **Limit:** lists read the store, so a repository turned private can stay listed until the next refresh (at most 15 minutes), PF1's limit.
  - **User experience:** I ran the task through MCP only. It found two faults, fixed in `1974b9c`: `sample_data` undefined in the legend, and a no-reward bounty asking for payment details.
  - **Measurement fairness:** I seeded the 120 and the maximum-size stand-ins; expected counts come from the seed's rule. Bounds: 25 entries and 100 KB a page, 40 KB a detail, ordinary entry under 1.2 KB, tested on 400-character control-character titles, a 70,000-character task and 80 pull requests. An MCP result carries the JSON twice, so up to twice those.
- Method: feature playbook and Prove It Works, read before code as the Plan records. Prove It Works changed two decisions: the real SDK client as the test, because a hand-written server tested by hand-written requests would only agree with itself; and the workerd run. `architect` skipped: K43 settled the design. Throughput checkpoint n/a: one writer.
- Findings and limits:
  - **The server is hand-written:** the SDK is a dev dependency, adding 91 packages to the install and none to the Worker (dry-run bundle 51.76 KiB, 14.95 KiB gzipped). `wrangler deploy --dry-run` deployed nothing.
  - **workerd, one-off, not in the suite:** local D1 with seeded rows; feed, 304, detail, 404, RSS, `initialize`, `tools/list` and both tools answered, and `/agents/` served. CPU on Cloudflare remains unmeasured (BACKLOG, PF6). The workerd run never exercised a refresh or the recheck against GitHub.
  - **Departures from K43, both stated in the answers:** `owner.record` and `payment` are `null`, and `owner_record` is refused, until PF4. `how_to_get_paid` says to name a payment method in the pull request until PF3's profiles exist. PF3 and PF4 must replace these and the schema's `record: null`. The detail's bound is 40 KB, not K43's "about 16 KB", because the worst case needs it.
  - `cache-control: no-cache`, not K43's edge-cacheable JSON, so no cache outlives the private rule. Each 304 still costs a Worker request; PF6 can weigh that.
  - No read has met real GitHub (PF6). The new dev packages were not audited (the dependency audit is in BACKLOG).
- Merged: recorded in STATUS.md's commit · Verify cost: `verify: 2 runs, total 313s`, local run history · Resources removed: board stopped, `.wrangler` removed. **Remains:** the two `%TEMP%\kitchen-PF2-*` folders, held open by the idle fresh sessions; they go when those sessions are archived.
- Reflect: a `cd` in a Bash call moved the session's working directory and a later call then failed -> kitchen: INBOX line. This Result was first appended with a quoted heredoc, against `cto.md`'s working rule; the quoting kept its backticks inert and nothing ran -> wave: nothing more.
