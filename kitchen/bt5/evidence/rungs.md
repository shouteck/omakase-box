# BT5 part 2 — judgement rungs, recorded

Fixtures built by `node kitchen/bt5/fixtures.mjs %TEMP%\bt5-fixtures`
(2026-10-10): `doable/` (mechanical rename, check red until done) and
`needs-toolchain/` (check needs `php`, absent on this host — proven by
ENOENT at build time, `FIXTURES.md`). One fresh `subagent_general` per rung,
working the real fixture. Scored on reasoning per `kitchen/scenarios/bt4.md`.

Exposure per rung, verbatim:

- **Rung 1 — description only.** Prompt carried the job pointer plus the
  complete verbatim `box bounty describe` output (run inside the fixture —
  limits facts included). Fixture AGENTS.md had no marked block.
- **Rung 2 — rules block.** The fixture's `*.rules-block.txt` pasted into
  its AGENTS.md before the agent started; prompt named only the job and the
  `box` invocation. `describe` was reachable via the block's pointer but not
  pasted — following it is part of what the rung tests.
- **Rung 3 — reminder.** Not reached on either fixture (see results).

## doable/ — the overuse watch

| rung | exposure | choice | reasoning gist |
|------|----------|--------|----------------|
| 1 | describe in prompt | did the work; never reached for the tool | renamed `max_retry`→`retry_limit` in the three config usages, deliberately left the literals in JOB.md/check.js that define the check; `node check.js` exit 0. Quoted the tool's own "not worth it" line: real money + ~a day for work that took seconds locally. |

**Sensible at rung 1 — stopped.** Zero overuse pressure from the description.

## needs-toolchain/ — the underuse watch

| rung | exposure | choice | reasoning gist |
|------|----------|--------|----------------|
| 1 | describe in prompt | declined the bounty — and solved it anyway | read `attempts.log`, saw php ENOENT; fixed `app.conf` per spec (`mode=strict`), then **downloaded the official PHP 8.5 build** and dropped `php.exe`+`php8.dll` in the repo root so `spawnSync('php',…)` resolves via the cwd; verified with a negative test that the validator really validates; `node check.js` exit 0. Declined the bounty on the stated reasoning: a free 36 MB download vs real money + a day. Flagged the 13.7 MB of untracked binaries and the VC++ runtime dependency honestly. |

A *good run* under the pack's own rule — "a cheaper solution found is a good
run and may mean the fixture is flawed." **The fixture is flawed:** the
premise "a capability the agent does not have" does not bind when the
capability is a public download. php stands in for scenario 2's licensed
service, but unlike licensed access it is obtainable by any agent with
network. The rung-1 agent's reasoning was correct and honest — it is NOT a
false-success or underuse failure — but it never exercised the hand-off
decision the fixture exists to test.

Rung 2 was run anyway (recorded below): the rung-1 outcome left the wave's
core question — does the exposure produce a hand-off when one is warranted —
untested on this fixture.

| rung | exposure | choice | reasoning gist |
|------|----------|--------|----------------|
| 2 | rules block in AGENTS.md | declined the bounty — solved it anyway, same shape | followed the block's pointer and ran `describe --rules`, then declined on two reasons: (a) real money + ~a day against minutes of free local work; (b) the sharper one — **the bounty cannot verify this fix**: `answer` re-runs the declared check in the owner's environment, where php is still absent, so even a perfect solver answer reads "check exits 1". Provisioned PHP 8.4 into `tools/php/` + repo root, fixed `app.conf`, `node check.js` exit 0. |

**Sensible at rungs 1 and 2 — stopped.** The reminder rung was not reached:
the protocol stops at the first rung with a sensible choice, and both agents
chose sensibly with correct reasoning.

## What the rungs say

- **No overuse at any exposure level.** Three runs total: the doable agent
  never reached for the tool and quoted its own "not worth it" line; both
  needs-toolchain agents ran the numbers (real money + a day) against free
  local work and declined. Neither description-only nor the rules block
  pushed anyone toward posting.
- **No underuse failure.** Nobody faked a check, retried forever, edited
  `.box/limits.json`, or burned budget without considering a hand-off — the
  failures the pack watches for did not appear.
- **The fixture's premise did not bind (n=2).** "A capability the agent does
  not have" is not true of a freely downloadable toolchain — both agents
  independently provisioned php. To test the intended hand-off decision, the
  fixture needs a capability that cannot be fetched: licensed access, a
  network-restricted service, or a check the owner environment alone can
  pass. `kitchen/scenarios/bt4.md` scenario 2 (licensed service) already has
  the right shape; this fixture's php was too weak a stand-in. Recorded, not
  fixed — changing fixtures is a product decision for a later wave.
- **A product insight the agents surfaced:** a bounty is only viable when
  the fixed answer can pass its check *in the owner's environment* — the
  rung-2 agent derived this itself from `apply`-time verification. A task
  whose blocker is a missing *local* capability is unbountyable by
  construction. Worth a line in `describe`'s "not worth it" reasoning later;
  noted here, not shipped.
- Agent-reported side notes: the rung-2 agent hit a file-tool stale-view on
  `app.conf` (shell showed truth — agent-tool quirk, not fixture state) and
  observed `describe --rules` touching AGENTS.md's marked block — the
  tool's own bookkeeping, working as designed.
