# PF8: the board is live on a free host, reading real GitHub

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF8` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-11-01-real-before-launch, D-2026-10-22-k43-decisions
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written by the CTO on 1 November 2026, taking PF6's deployment items. **The owner approves this production deploy by naming this wave, and takes every account step.** No agent creates an account or sees a secret.

## Outcome

The board runs on Cloudflare Workers Free at a `*.workers.dev` address at $0, reads real GitHub, and every "before any deploy" item in BACKLOG is answered with evidence.

## The change

1. **`packages/box-platform/DEPLOY.md`:** each step the owner takes, in order: Cloudflare account, D1 database, GitHub OAuth app, optional GitHub token for rate limits, each secret and where it goes, the deploy command, each with its cost ($0, or flagged). The README already has the OAuth part.
2. **The owner runs them.** The CTO hands over one step at a time and waits; secrets go straight into Cloudflare.
3. **Answer BACKLOG's list against real GitHub**, in the sandbox, at $0:
   - the search query, `commits?sha=refs/box-bounty/<id>`, `contents/event.json?ref=`;
   - the compare API on a fork's head after a merge;
   - how a private organisation member reads to an unauthenticated request;
   - real OAuth sign-in and sign-out;
   - a hint's look and the rate-limit budget against the real limits.
4. **Measure CPU on Workers Free:** the refresh tick, a hint's look and the `owner_record` filter against the 10 ms limit. If one exceeds it, split or cache it and show the number afterwards.
5. **The CLI's board address:** `BOARD_DEFAULT` becomes the live address in a commit, once the board answers.
6. **Fix what real GitHub breaks,** in this wave if small; otherwise stop and bring one recommendation.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0 on the final commit, with heavy apps closed.
- The live address serves the front page, the board, a sandbox bounty's page, the feed, `/mcp` and RSS. A private repository in the owner's account is absent by direct id and by list.
- Each BACKLOG "before any deploy" line is answered in the Result, with its output, and removed or narrowed.
- Monthly cost stated: $0, or what is not.

## Lenses

- [x] **Security:** no secret in any commit, log or Result; cookies and Origin checks on the real domain; the private rule on real GitHub.
- [x] **User experience:** a fresh agent given only `DEPLOY.md` lists every owner step and its cost without asking; the owner's own steps that confused them are fixed.
- [x] **Measurement fairness:** CPU numbers carry run count and spread, read from Cloudflare, not the local host.

## Notes

- Feature playbook; principles: prove-it-works.
- Cloudflare's free terms forbid collecting card details on free properties; the board collects none, and stays that way.
- K43's static-export trap: `__next.<segment>.__PAGE__.txt` needs its mapping on the real host.

## Plan

Agreed with the owner in plan mode, 1 November 2026.

- **Found while planning, unmeasured:** D1 Free allows 50 queries an invocation; `GitHub.take()` makes up to 5 per read and `storeIssue` 2 per search item, and real search returns 27 sandbox issues. Anonymous reads share Cloudflare's addresses, so recommend a fine-grained, public-only token.
1. `DEPLOY.md`, then a fresh-agent check of it (fresh session in a scratch folder, only that file), before the owner uses it.
2. Owner steps one at a time. After `wrangler login` the CTO may run tail and D1 counts and redeploy fixes in this wave; it never reads wrangler's stored credentials.
3. Measure as-is first: real ticks, CPU, queries, rate limits. Name the CPU source in the Result.
4. Fix what is over, one cause at a time, test first (a counting `Db`, shown failing). The private rule stays ahead of every store.
5. Measure after: tick, hint's look, `owner_record`, at least 10 runs each, median and spread, from Cloudflare. A temporary every-minute cron for the tick, then back to 15.
6. BACKLOG against real GitHub: commits and contents reads; compare on merged and squash-merged fork PRs in public repositories; a private organisation member's association; one real sandbox post, hint and close.
7. Private rule: the CTO creates private `kitchen-PF8-private` with one bounty-shaped issue (owner approved). Absent by list, direct id and after a hint. Close the issue at close; deleting the repository is the owner's step.
8. Real sign-in and sign-out by the owner; the CTO checks session counts only, cookie flags and Origin refusals with curl.
9. Live surfaces in a browser, with the console, including the `__next` trap.
10. `BOARD_DEFAULT` in its own commit; verify; close.

Any cost that is not $0 stops the wave.

---

## Result

- CTO: Claude Code desktop / Claude Opus 5.5.
- Address: https://open-bounty-board.box-platform.workers.dev. Monthly cost: **$0** (Workers Free, D1 Free, no card asked). Live Worker version `322980b0`; no platform source changed after it.
- Commit: `5c0b0ec`, plus kitchen documents and `DEPLOY.md`.
- Verify: `verify 5c0b0ec PASS check=0 build=0 test:box-bounty=0 test:platform=0 test:kitchen=0(selected 18 of 18 kitchen files) db=none 1263s`. Earlier: `d4a9bbd` PASS, but its log showed test traffic reaching the board; `ae7160a` FAIL (k12: a fixed temp path in a new test).
- Checks: the diff does the brief, plus one scope growth stated below. Verify passes on this commit. Wrong implementations were caught: replacing the batches with single calls fails the new test (34 calls against a limit of 10), and the audit and the live log each caught a real defect. Level: ui-verified (real browser, real sign-in by the owner, real sandbox post).
- **Scope that grew:** `boardAddress` and `vitest.config.mjs`, so no test run reaches the live board; bare `config` now states the board, since the default is on.
- **The owner ran** the account, wrangler login, database creation, OAuth app and all three secrets. At the owner's request the CTO ran the schema, build and first deploy. No agent saw a secret.

**CPU, read from `wrangler tail --format json` (`cpuTime`, whole ms). Limit 10 ms. Outcome `ok` on all 301 logged invocations; `exceededCpu` 0.**

| Run | Before | After (`tickReads` 2, closed hourly) |
|---|---|---|
| Refresh tick | n=7: 33-291 ms | n=72: min 2, median 6, max 17; 9 of 72 over 10 ms |
| A hint's look | n=17: min 1, median 10, max 20 (at 3 reads, mixed with refused hints) | n=12: min 8, median 17, max 27; 10 of 12 over |
| `owner_record` filter | n=12: min 4, median 9, max 16 | n=12: min 4, median 9, max 20; 3 of 12 over |
| `find_bounties` over `/mcp` | not measured apart | n=12: min 2, median 5, max 11 |

Not all under 10 ms. Stopped engineering here: the refresh is usually under, a hint is rare, and the owner ranks real coverage above further engineering. The remainder is in BACKLOG, for PF9 to watch. The first run, anonymous, was 51 ms.

**BACKLOG's lines, against real GitHub:**

- Search: `200`, unauthenticated too; 25 issues stored, 2 refused kinds logged (`format-absent` on issues that are not bounties).
- `commits?sha=refs/box-bounty/bt-b4628c0f4a26`: `200`, 3 commits. `contents/event.json?ref=<sha>`: `200`, base64, `type: merged`, `v: 1`.
- Compare on a fork's head: cli/cli merge commits #14854 and #14801 `ahead`; vercel/next.js squash #100961 `diverged`. So a squash reads as not on the default branch: narrowed in BACKLOG.
- Private organisation member: `nusCS2113-AY1819S1/addressbook-level4#25` by the owner reads `NONE` unauthenticated, `MEMBER` signed in. A real hole in the self-dealing rule: narrowed in BACKLOG, no change.
- Anonymous capacity: GitHub cut the board off after 5 reads on Cloudflare's shared addresses, not 60 an hour. The token fixes it; `DEPLOY.md` says so.
- Budget: a busy hour used 123 of 5,000. D1 after about 1.5 hours: 1,979 read queries, 1,303 writes, 22,444 rows read, 1,967 rows written, against 5 million and 100,000 a day.
- The 50-query limit: Cloudflare's D1 page gives 50 per invocation on Free. The first run should have passed it and raised nothing; not enforced as written, or counted otherwise. No longer reached.
- Real OAuth: sign-in made 1 session in D1, `/api/me` answered, sign-out left 0. Owner in their own browser.
- Hint: real `box bounty post` of `bt-57193e563308` was on the board within 2 s; `close` showed `closed-none` within 5 s.

**Live surfaces:** front page, `/board/`, `/b/bt-57193e563308/`, `/me/` read in a browser, no console errors. `/bounties.json`, `/bounties.schema.json`, `/rss.xml` (held the bounty), `/mcp` (`find_bounties`, `get_bounty`, held the bounty). All 44 `*.txt` files of the static export answer 200 on the host, so K43's trap needs no mapping.

- Lenses:
  - **Security:** private `shouteck/kitchen-PF8-private` with a bounty-shaped issue: direct id 404, `repository=` filter 0, no row in D1, name absent from the board, after two hints naming it and many refreshes. `__Host-` cookies with `Secure; HttpOnly; SameSite=Lax` on the real domain. Sign-out with no Origin or a foreign one: 403. No secret in any commit, log or this file; `database_id` is public by design. Found: Cloudflare's logs hold the used, single-use OAuth `code` in the callback URL for 3 days; the local log was deleted.
  - **User experience:** a fresh session given only `DEPLOY.md` found it could not be followed alone (no repository address, a broken "give it to the head chef" option, wrong undo links, and more): fixed. The same session, no longer cold, then listed every step and cost, and seven small gaps: five fixed, wording fixed, one (what a correct page looks like) answered in step 4. The last edits were not read again. The owner saw "Redirect URI" where GitHub's form had said callback: added.
  - **Measurement fairness:** table above: run counts and spread, from Cloudflare. Limits: `cpuTime` is whole milliseconds; the hint sample is closed sandbox bounties, and there is no real traffic yet.
- Method: feature playbook; architect skipped: the design followed from the measurement. **prove-it-works** changed two decisions: deploy unchanged and measure before fixing, which refuted my guess about the query limit and found the real cost; and read the live log during verify, which caught test runs reaching the board when the unit test said they could not.
- Findings and limits:
  - A fork pull request is still unproven through the tool (BT51); PF9.
  - **For PF9:** a seat with its own `BOX_BOUNTY_SETTINGS_DIR` gets no default board. Run `box bounty config set board <address>` there.
  - The owner's real uses now send hints to the live board; `config` says so.
  - No per-tick search resume past about 200 issues (BACKLOG).
- Merged: `57fca30` · Verify cost: `verify: 4 runs, total 3886s` (3 PASS, 1 FAIL; local history) · Resources removed: tail stopped; the live board, database, OAuth app and token stay. Left: `kitchen-PF8-private`, issue closed (the owner deletes it), `%TEMP%\kitchen-PF8-reader` and its session; sandbox issue 58 closed, its bounty ended.
- Reflect: stand-ins hid the host's cost per call and a shared rate limit -> station: a line. A live default reached from tests, an env switch missing fixtures that build their own -> station: a line, and the card trimmed under its size limit (two package names that no longer exist, the export fallback, two sentences of framing). A `cd` in one Bash call moved the session despite the rule -> wave: nothing new, the rule stands.
