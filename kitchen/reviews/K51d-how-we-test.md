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

## 3. What this suggests (hypotheses, each with how to test it)

**H1. The cost is the number of doors a property is tested through, not the number of properties.** Test shared logic (the name quoting, the failure classifier, the tree-listing parser, the rate-limit wording) once as a fast in-process test, and one journey per command family through the real tool. *Try:* take `bt43`'s quoted-names journey and `report`'s numbered-attempt tests; replace the multi-door runs by a unit test plus one door each; prove nothing is lost by breaking the formatter and seeing a test go red; compare time.

**H2. The suite should say what it defends.** Put the CONTRACTS guarantee id (and the hard stop, if any) in the title of every test that proves one, and add the proof map to the checks. Then "which test defends G12", "which guarantees have no test" and "which tests defend the same thing" are answered by a script instead of by my reading (K51b). *Try:* tag the 85 guards first; it costs no behaviour change.

**H3. Audit the hard stops by breaking them, on a schedule.** The guard set is 85 tests, 14 refusal names and a few behaviours. A script that applies one small break per guarantee in a scratch worktree and confirms the named tests go red is K51's method made repeatable, and it answers "are we testing the right stuff" for the part that must never fail, which coverage cannot. It would also settle `authority-arguments`, which no test names.

**H4. Cost per command is the multiplier.** Fewer Git starts per command (K51c) speeds every test and every user. This is the one change that helps the product too.

**H5. Select tests by what changed, run everything where it counts.** Locally and for a wave's inner loop, run the files that import the changed modules (K45 does this for the kitchen suite); in CI, run the full set on Linux and macOS, split the Windows run. The owner's rule that the exact commit is green on all three systems stays.

**H6. Windows temporary files may be a cheap win.** Git's own suite moves its trash to a RAM disk. *Try:* one hosted Windows run with the temporary folder on a ReFS Dev Drive, same commit, compare the minutes. No code change.

**H7. Pruning needs a tool, not a request.** K51's rule that a new test must be seen failing stops new dead tests. For the existing 1513, the break-and-red method per file is the only safe proof; the map says where to start (the 109 files holding no hard-stop test) and the property/door split (H1) is likelier to pay than deleting.

## 4. Not claimed

I did not check whether any of the slow tests is redundant, whether the wording pins would survive a rewording, or how many tests are change-detectors. I did not time the suite on Linux or macOS myself (the hosted runs give about 4 and 8 minutes for the whole verify job). The research is a day-one read of sources, several secondary; where I could not open the primary I said so.
