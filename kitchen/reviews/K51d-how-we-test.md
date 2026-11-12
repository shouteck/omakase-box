# K51d: how we write tests, against how large projects do

Written by the CTO on 12 November 2026 for [K51d](../../waves/K51d.md), after the owner pointed out that K51 to K51c were measured empirically and that the cause may be the way the tests are written, or what they test, "not just about maximizing coverage". Nothing in `packages/` or `tests/` changed. **Findings are marked as such; everything else is a hypothesis to try, not a conclusion.** Sources are linked; several are preprints or blog posts and are called that.

## 1. What we measured about the shape of our suite

All on the owner's Windows host, bounty suite, 3 workers as in CI, one run (1257 tests, 1253 passed, 4 skipped).

| test duration | tests | share of tests | share of time |
|---|---|---|---|
| under 0.1 s | 295 | 23% | 0.2% |
| 0.1 to 1 s | 298 | 24% | 4% |
| 1 to 3 s | 276 | 22% | 14% |
| 3 to 10 s | 325 | 26% | 57% |
| over 10 s | 63 | 5% | 25% |

- **Finding: 31% of the tests (388) take 82% of the time.** The slowest 167 (13%) take half. The fast tests, the kind large projects have most of, cost nothing and are a quarter of ours.
- **Finding: the hard-stop guard tests are not where the time goes.** The 70 guard tests I could match by title (K51b) took 6.7% of the suite's time. The time is in tests of the product's ordinary behaviour.
- **Finding: the tests are organised by the wave that wrote them.** 116 of 145 files are named after a wave (`bt43`, `pf5`, `k16`...), holding 1002 of 1513 tests; the `bt6b-second`, `bt6b-third`, `bt11b-pass` files are the later passes of earlier waves. Nothing in a test's name or file says which guarantee in CONTRACTS it defends. That is why K51b needed a purpose-written extractor and my own reading to learn what any test defends.
- **Finding: wording is pinned heavily.** 358 of 1513 tests (24%) assert a string of 25 or more characters; 641 of 6199 `expect` calls. Some of that is right (the tool's words are its interface to an agent); `bt61-text` freezes whole outputs.
- **Finding: a property is often tested by driving it through every command, each a spawned process.** `bt43` "...print each name quoted" runs `apply`, `create`, `status`, `status --since`, `post --preview`, `config` and a post in one test to show one formatter quotes a name; `pf5` "T1 and T4 hold" runs every read command through the built tool to show none writes. The second is a real invariant; the first is one function tested at seven doors.
- **Finding (K51c): a command costs 0.8 to 1.4 s on Windows**, 13 to 24 child starts of 25 to 100 ms each; fixtures cost 150 ms. A test is a few commands, so time follows the number of commands a test drives.
- **Finding, in our favour:** every wave is written tests first and the test is seen failing on the old code before the fix (the kitchen's rule; BT55's row 1 was run red on Linux). That is the red/green discipline in the references below, and it blocks the commonest kind of dead test: one that passes both before and after.

## 2. What the references say

- **Size and flakiness (Google).** Tests are classed by what they may use: [small ones are one thread, one process, one machine](https://abseil.io/resources/swe-book/html/ch14.html), larger ones are not restricted. Google measured the cost of size: [0.5% of small, 1.6% of medium and 14% of large tests were flaky](https://testing.googleblog.com/search/label/Jeff%20Listfield?m=0) in a week. A "70/20/10" split is repeated in blogs; I found it only in a secondary source, not in Google's own chapter.
- **Pyramid or trophy.** The trophy argues [integration tests give the best return](https://web.dev/articles/ta-strategies) when bugs live in how parts interact and integration tests run fast; the pyramid when bugs live in isolated logic. Both are criticised as one default shape. Ours is a command-line tool over Git and GitHub; most of its bugs are in interactions, which favours integration tests, but ours are not fast.
- **What a good test is (Kent Beck).** [Test Desiderata](https://medium.com/@kentbeck_7670/test-desiderata-94150638a4b3): tests should be sensitive to behaviour change and insensitive to structure change, and fast, deterministic, predictive. Our black-box tests through the real command are structure-insensitive and predictive and not fast; the wording pins are behaviour-sensitive but also sensitive to rewording.
- **Change-detector tests (Google).** [Tests that restate the code](https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html) add no clarity and block safe refactoring; the cure is to test behaviour. The wording pins are the nearest thing we have to that, and the right ones are those where the words are the contract.
- **Git tests itself the way we do, with its cost handled.** [Git's own suite](https://code.googlesource.com/git/+/HEAD/t/README) is black-box scripts over the real commands, run in parallel, with the temporary directories movable to a RAM disk ("can massively speed up"), a `--stress` mode to find flaky tests and a `--chain-lint` check that no command's failure is hidden. So real commands are not the problem; per-command cost and where the temporary files live are.
- **SQLite uses several independent harnesses** ([How SQLite Is Tested](https://www.sqlite.org/testing.html)), one of them parameterised to about 1.5 million test instances in under five minutes, with fault injection for out-of-memory and I/O errors; its 100% coverage claim is scoped to the core library. Coverage there is a by-product of tests designed against failure modes, not the aim.
- **Running fewer tests per change is standard at scale.** Facebook's [predictive test selection](https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/) ([paper](https://arxiv.org/pdf/1810.05286.pdf)) ran about a third of the tests and caught over 99.9% of faulty changes, a statistical guarantee. A static version (run the files that import what changed) is simpler.
- **Mutation testing, narrowly.** Google runs it [on the lines of a change, shown in code review](https://research.google/pubs/state-of-mutation-testing-at-google/), not on everything. That is the same idea as K51's break-and-red method, made automatic.
- **Agent-written tests (2024 to 2026 research; preprints and blogs, indicative only).** Generated tests tend to [encode what the code does rather than what it should do](https://arxiv.org/html/2412.14137v1); benchmarks are [inflated by weak tests](https://arxiv.org/html/2603.00520v1); agents add tests readily and rarely prune them, and about a fifth of generated tests pass on old and new code alike, per [a secondary write-up](https://preslav.me/2026/08/27/scoped-coverage-ai-test-pruning/). One 2026 preprint finds [Claude-authored tests no weaker than human ones](https://arxiv.org/pdf/2608.15188) on newer models, which I could not check. I could not read the largest study (agent-authored pull requests across 2,807 repositories) first-hand.
- **For agents specifically.** Anthropic's [best-practices page](https://code.claude.com/docs/en/best-practices) says an agent needs a check that returns pass or fail, asks for the command run and its output as evidence rather than "all tests pass", and tells you to put how to run a single test file in the project's instructions. [Simon Willison's agentic patterns](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/): write the test first and watch it fail, since a test that already passes proves nothing. Neither page says anything about test quality, pruning or keeping a suite fast; those are open.
- **Windows file speed.** The runner's old fast D: drive is [reportedly gone on 2025 images](https://ichard26.github.io/blog/2025/03/faster-pip-ci-on-windows-d-drive) and [Dev Drive's gain comes mainly from deferred Defender scans and ReFS](https://www.infoq.com/news/2023/06/windows-dev-drive); results in the wild vary and are anecdotal.

## 2b. What practitioners say (added the same day, at the owner's request: the large-company view misses where agent-era practice is being worked out)

Sources are practitioner posts, preprints and vendor writing from 2025 and 2026, read through search and, where marked, first-hand. I could not read OpenAI's harness-engineering post (the page refused the fetch), so what follows about it is from search summaries.

- **Agents cheat on the tests they can see.** [Andrew Ng on X](https://x.com/AndrewYNg/status/1968710001079501303): his teams hit an agent changing test code to make it pass more easily, and say agentic testing helps but is not enough alone. Kent Beck describes agents [deleting a failing test, or weakening it](https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent), and names cheating by disabling tests as a sign the session has gone wrong (secondary write-ups). [ImpossibleBench](https://x.com/fjzzq2002/status/1981745974700581191) (with Anthropic researchers) makes tasks impossible so any pass is a cheat; a reported summary has about a quarter of "successes" hacked when the grader is reachable and under 1% when it is not (secondhand, unchecked).
- **So keep the grader out of the agent's reach.** StrongDM's software factory, [as Simon Willison reports it after visiting](https://simonwillison.net/2026/Feb/7/software-factory/), keeps end-to-end "scenarios" outside the codebase like a holdout set the coding agents cannot see, and scores a fraction of satisfying runs instead of a green suite; Willison doubts "no human reviews the code". Practitioners on HN suggest [read-only test folders for the coding agent](https://news.ycombinator.com/item?id=47327559). Anthropic's page says the same of rules: [hooks and deny rules are deterministic, CLAUDE.md is advisory](https://code.claude.com/docs/en/best-practices).
- **Behavioural twins of third-party services.** StrongDM built clones of Okta, Jira, Slack and Google services to run thousands of scenarios an hour with no rate limits or live risk, using the services' popular SDK clients as the compatibility target. Our `gh`, board, Stripe and PayPal stand-ins are the same idea; the point to take is that a twin is only as good as its checked fidelity.
- **Backpressure and sensors.** [Lucas Costa](https://www.lucasfcosta.com/blog/backpressure-is-all-you-need) and the [Thoughtworks Radar](https://www.thoughtworks.com/en-sg/radar/techniques/feedback-sensors-for-coding-agents) (Trial) say the human should not be the checker: run lint, types and tests after every patch, inside the agent's edit loop, and do not write the next patch until they pass; offer suites with different time budgets; keep success quiet so only failures reach the agent ([O'Reilly](https://www.oreilly.com/radar/agent-harness-engineering/)). Slow verification cuts the iterations an agent gets. Neither page gives numbers or an output format.
- **Mechanical checks beat documents** ([OpenAI's post, via summaries](https://openai.com/index/harness-engineering/)): custom linters and structural tests, with error messages written as fix instructions to the agent, and "when the agent struggles, find what the harness lacks".
- **Property-based tests are the strong-oracle tool for agents.** [An agent on Claude Code writing Hypothesis tests](https://arxiv.org/pdf/2510.09907) reported 984 likely bugs; of 50 sampled, 28 were real, and fixes were merged into NumPy and others; [PBT-Bench](https://arxiv.org/html/2605.15229) finds the best agent recalls 83% of injected bugs and that the commonest failure is filtering out the bug-triggering inputs with `assume()`. Preprints; the numbers are samples.
- **Watch it fail first, and verify against evidence.** [Willison](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/), the HN [verification-debt thread](https://news.ycombinator.com/item?id=47289406) and Anthropic's page agree: a test you did not see fail proves nothing, and "all tests pass" without the command and its output is weak evidence.

What this adds to section 2: the large-company advice is about a suite humans maintain; the practitioner advice is about a suite an agent both writes and is judged by. The new risks are the agent editing its own judge and a loop slowed by slow checks.

## 3. What this suggests (hypotheses, each with how to test it)

**H1. The cost is the number of doors a property is tested through, not the number of properties.** Test shared logic (name quoting, the failure classifier, the tree-listing parser, rate-limit wording) once as a fast in-process test, and one journey per command family through the real tool. *Try:* take `bt43`'s quoted-names journey and `report`'s numbered-attempt tests; replace the multi-door runs by a unit test plus one door each; prove nothing is lost by breaking the formatter and seeing a test go red; compare time.

**H2. The suite should say what it defends.** Put the CONTRACTS guarantee id (and the hard stop, if any) in the title of every test that proves one, and add the proof map to the checks. *Try:* tag the 85 guards first; no behaviour change.

**H3. Audit the hard stops by breaking them, repeatably.** A script applies one small break per guarantee in a scratch worktree and confirms the named tests go red. It answers "are we testing the right stuff" for the part that must never fail, and settles `authority-arguments`.

**H4. Cost per command is the multiplier.** Fewer Git starts per command speeds every test and every user. The one change that also helps the product.

**H5. Select tests by what changed, run everything where it counts.** The owner's rule (the exact commit green on all three systems) stays; the inner loop and the Windows split change.

**H6. Windows temporary files may be a cheap win.** *Try:* one hosted Windows run with the temporary folder on a ReFS Dev Drive, compare minutes. No code change.

**H7. Prune only by break-and-red,** after H2 and H3 exist.

**H8 (new). A mechanical test-edit gate.** AGENTS.md rule 2 ("never edit a test's expected outcome to make a candidate pass") is a sentence the same agent that writes the code is asked to obey; the practitioners above say the judge must be out of the writer's reach and enforcement must be deterministic. A check that compares a wave's changes to existing tests against master and fails when an existing test is deleted, skipped, or has an assertion removed or changed without the wave file listing it with the reason. *Try:* build it, run it on the last ten merged waves and see what it flags (the answer is also a measure of how often rule 2 was in play).

**H9 (new). A fast inner-loop tier an agent can run after every edit.** The practitioners' loop needs checks in seconds; ours is 15 to 25 minutes. The 593 tests under 1 s (47% of the tests) sum to about 150 s of the suite's 3444 s. *Try:* a named quick set (the platform and kitchen suites and the bounty tests that start no program), measured, with the full suite staying acceptance.

**H10 (new). Check the twins.** Our `gh`, board and payment stand-ins are the tests' view of third-party services; nothing checks that they behave like the real ones, so a test can pass for a reason the real service would not give. *Try:* a small read-only request set run against both the stand-in and the sandbox repository, comparing status, headers and body shape; run it by hand now, schedule later.

**H11 (new). Property-based tests for the pure parsers.** The scan's diff parsing (BT54 needed 13 hand-written cases after a bug in how `++ ` lines were read), the tree-listing parser, the response splitter and the never-ship matcher (look-alike and normalisation cases) are exactly what generated inputs find bugs in, and they run in milliseconds. *Try:* a development dependency (fast-check, no spend) and one property file per parser; see whether it finds anything the hand cases missed; keep what it finds as ordinary cases.

### The order I will take, and why

Chosen by value, cost and what unlocks what; each its own wave with the usual gates, and the owner's go still needed for anything that spends money or touches another repository (none here).

1. **H8**, the test-edit gate: cheap, tools only, no product code, and the one that guards every later wave, including these. The strongest and most consistent evidence in the practitioner sources.
2. **H6**, the Windows Dev Drive run: nearly free and mostly waiting; run it while the next wave is written.
3. **H2**, guarantee ids in titles and the proof-map check: no behaviour change, and it makes H3, H7 and the gate's protection exact instead of by keyword.
4. **H3**, the hard-stop break audit, on top of H2.
5. **H11**, property tests for the parsers: small, fast, and the best chance of finding a real bug rather than moving time around.
6. **H1**, the door-count pilot on `bt43` and `report`, with H9's quick set defined from what it shows.
7. **H10**, twin conformance against the sandbox.
8. **H5**, selection and the Windows split, after H9 says what a quick set is.
9. **H4**, fewer Git starts per command: last because it changes product code, needs a trace first, and is guarded by the start-budget test.
10. **H7**, pruning, only after H2 and H3.

## 4. Not claimed

I did not check whether any of the slow tests is redundant, whether the wording pins would survive a rewording, or how many tests are change-detectors. I did not time the suite on Linux or macOS myself (the hosted runs give about 4 and 8 minutes for the whole verify job). The research is a day-one read of sources, several secondary; where I could not open the primary I said so (OpenAI's harness-engineering post and the largest agent-authored-tests study were not read first-hand). X was reachable through search for single posts, not as a feed; I did not survey X broadly.
