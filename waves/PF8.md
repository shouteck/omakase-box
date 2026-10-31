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

---

## Result

- CTO: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line>`
- Checks: the three questions answered · Level: ui-verified | test-verified | typecheck-only
- Lenses: <what was tried and what was found>
- Method: <playbook; each principle that changed a decision and what it changed>
- Findings and limits:
- Merged: `<merge SHA>` · Verify cost: `<line from node scripts/kitchen-stats.mjs --wave=PF8>` · Resources removed: yes | <what remains and why>
- Reflect: <what went wrong> -> <wave | station | kitchen>: <what it became, or "nothing">
