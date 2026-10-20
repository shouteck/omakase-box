# Station: Evidence

Measurements, comparisons and what the kitchen is allowed to claim. Runs through every milestone. In milestone BT it owns the record of each real bounty (BT5, BT6): every manual step, what left the machine, and what the solver could see.

## What this station knows

- Current outcomes and contracts are in `PLAN.md` and `docs/box-v4/MEMORY-SPEC.md`. The former delegation validation plan is archived with the retired platform; do not use it as the current product's acceptance contract.
- Record for every attempt: owner preparation, recipient onboarding, implementation, owner acceptance, elapsed time, and quality. From D2 on also record the share of owner source disclosed, and for agent recipients the same agent with the Box and with the full repository: success, tokens, time, owner interventions.
- Four conclusions are always reported separately: software capability, measured effort, actual repeat use, commercial commitment. A good result in one says nothing about the next.
- The kitchen's own waves delivered as Boxes are real repeat use by one team. Label them internal; they are not customer evidence.

## Traps

- **Every attempt counts.** Failures, abandoned runs and unsupported requests stay in the denominator.
- **Missing is not zero.** An observation nobody recorded is reported as missing. Code/syscall inference about a Linux failure is not a Linux-observed reproduction; distinguish local acceptance from hosted confirmation.
- **Resolve wave attribution before quoting cost** (BT40): plain `- Commit:` / `- Merged:` SHA fields let stats find the branch bounds; a zero with null merge/empty bounds is unresolved attribution, not observed zero work. Record the SHA fields, rerun the query and inspect the source run IDs.
- **A number without its story is not evidence.** Name run count, spread and limits; one run is an anecdote. For disclosure, distinguish tracked-file and filesystem inventories, list exclusions, and exclude worktree metadata: R1's live 1834-file denominator was only 694 tracked non-excluded files.
- **Unequal sides.** Both routes must carry the same outcome and the same acceptance checks. Differences in access are the thing being tested and are stated, not hidden.
- **A blind taster on this machine is not blind by force.** The recipient is told not to look outside the Box folder, but nothing stops it. Say so with every result, and for results that matter run the recipient where the repository is not present. Same for fresh-agent UX reads: tell the reader exactly what not to open — three BT11c second agents read the tool's source before answering until the instruction named it.
- **An agent is not a human participant**, interest is not demand, and a trial is not revenue.
- **No agent contacts anyone.** Customer conversations are the owner's.
- **A reader of records must not cost per record.** The stats page spawned one `git` per run record: 252 records meant ~470 processes and a 30s test timeout (K11). Anything that walks `.kitchen/runs` reads its Git facts in a fixed, small number of calls. And pin the property by *counting* external processes behind an env-var seam (`KITCHEN_STATS_GIT_TRACE`), never by timing — a counted bound cannot flake on a busy machine.
- **Audit every consumer before gating a shared resource.** K12's DB-on-demand nearly shipped with `check`'s own `*-live` tests uncounted: the DB audit covered named suites only, and `verify --full` caught it. When a resource is made conditional, enumerate both call paths (direct `verify test:<suite>` and indirect through `check`) and pin the set by *derivation from the files* — a restated list goes silently stale (K12's `k12-db-suites.test.ts` is the pattern; `DB_CHECK_SUITES` remains the known restated literal).
- **Parallelize by measuring workers, not cores.** Six cores did not mean six workers: measured runs picked three, and an instrumented run at three still timed out once. Prove files share no state first (temp roots, env in `finally`, per-call `-c safe.directory`) and pin the finding — K12's `k12-bounty-parallel.test.ts`.
- **On this host, load is part of the measurement.** MsMpEng real-time scanning and the host agent can pin the CPU and double a suite's wall time — K23's identical after-tree measured 399–655 s across runs. State CPU load beside any duration, and a run that dies mid-measurement is missing, not slow.
- **Re-measure after any test-structure change; evidence predating a correction is stale.** K24's after-runs predated a split correction the embedded-db verify forced — the pass's own rerun closed the gap. And the cheap fix for a long journey is consecutive `it`s over one shared world (`sharedFixture`/`sharedPostedFixture` in `tests/box/bounty/github-fixture.ts`): K24 cut the bounty suite ~22 % by stopping per-`it` rebuilds. Split legs that need an owner decision must re-arm it — `beforeEach` wipes settings.
- **Pair each measurement summary with raw evidence carrying the same run id.** Never overwrite a prior run's raw file while retaining its table or console log. K28's prototype check pins evidence presence/shape; its pass reconciles the numbers. For Git-transfer measurements, use negotiated transport or `--no-local`: a default local-path clone can hardlink objects the protocol would not fetch.
- **A produced artifact is not evidence of what it claims to show.** K16's first recording passed every recorder check while quietly running a stale pre-BT11b `dist`; only the live issue body's v2 block exposed it. Before a wave records or demos product behaviour, rebuild from the current commit — and the pass checks the artifact against the live thing, not against the run's own claims. A video or log is evidence only when its index and transcript can be audited without watching it.

- **Convention and comparison waves need their own fixture checkout:** a `git init` plus two fake `github.com` remotes exercises repo-dependent commands against scratch settings (`BOX_BOUNTY_SETTINGS_DIR`) without touching the owner's. K20 needed this to see BT16's multi-remote paths. For scale measurements across N records (K25, BT29), record both lines and characters — a joined single line (`ended:`) stays 1 line while growing ~75 chars per record — seed N−1 `asRecord`-valid files plus one real CLI `create` so write-triggered surfaces (`OPEN`, instruction block) run without N process spawns, and include a posted-records mix (`github` + `attempts` populated, instant-fail `gh` shim on PATH) so branches gated on `record.github !== undefined` are measured.

## The pass checks

- Tick the measurement-fairness lens for any wave on this station.
- Recount the denominator from the raw records, not from the summary.
- Re-run at least one measured attempt from a clean directory and compare.
- Read each claim in the report and find the record that supports it; strike any that has none.

## Real bounties (milestone BT)

Learned the hard way in R3b and the lab's live runs. They apply to BT5, BT6 and any wave where a solver works from a bounty.

- **Start the solver in an empty folder outside every checkout.** In R3b the solver's session began inside this repository, where the real fix was one file away; its blindness was by instruction only and the result could not be trusted as blind.
- **Save the solver's own report and its start and end times at hand-off,** before the cook writes any result. In R3b nothing was saved and every statement about what the solver did was unsupported.
- **One real use before many.** A live run of twenty-four attempts found only afterwards that the tool under test had returned nothing on every call. Run one, stop, read the record, then decide.
- **Check the scoring with no solver first:** the known-good change must score as accepted and a do-nothing change as rejected, through the same path the solver's work will take.
- **A brief that says "stop if the product refuses" must say who may approve a workaround.** A cook once worked round a refusal before asking.
- **Clean up by exact name, never by pattern,** when agents share a scratch folder.
- **A stand-in that answers is not one that answers correctly.** Before a stand-in GitHub carries participants, run each command the journey needs and compare with a real-GitHub transcript (`kitchen/demo/bt11b-real-transcript.txt`) — `tests/kitchen/k19-github-standin.test.ts` does exactly that for every committed stand-in. K18's stand-in (copied from `bt11b-replay.mjs`) returned the issue list for one issue and read `page=` out of `per_page=`, so every refresh failed and no pull request was ever listed; one participant run was spent before anyone noticed. And the shim is a `gh` binary, not only an API client: answer `gh version`/`gh auth` before parsing endpoints — K19 lost one verify cycle to a fixture that parsed the endpoint first. On Claude Code the cook cannot start participants: the head chef starts them and saves each own report verbatim at hand-off.
- **Cold fresh-agent journeys reuse the `bt17-measure.mjs` world:** a `NODE_OPTIONS --require` shim routes `gh`→`gh-standin.cjs` and the fake remote URL→a bare repo; each agent gets its own `BOX_BOUNTY_SETTINGS_DIR` and a `box.sh` wrapper baking the env. Two traps from BT17: the fixture repo's `origin` must spell the fake `github.com` URL (cloning from the bare path leaves a local `origin` and the tool correctly refuses `github-remote-required`), and seeded owner settings must have the `said` map deleted or standing explanations never print to the cold agent.
- **Never present unfinished or failed work as complete** — folded from the retired console card: a passing test is not a usable screen, and state that survives only in a page is a bug. The terminal demo under `kitchen/demo/` is demo tooling, not a restored web app.
- **Do not download a browser.** The demo's Chromium lives in `.runtime/browsers` and the suite runner sets the path; if it is missing or will not launch, stop and report.
- **Git output that grows with history needs an explicit buffer.** A test or script that reads `git diff`, `git log` or similar over the repository's history sets `maxBuffer` (Node's default is 1 MiB) and fails by name on a read error; K15's guard crashed with `ENOBUFS` once the wave-file diff passed 1 MiB (K15-ci).

- **A source-delivered environment does not persist across this host's agent tool calls** — each exec gets a fresh shell. K31's gh-logging shims missed several calls; transcript-derived counts were the labelled fallback. Bake env into each command or a wrapper, not a one-time source.

- **Env for measured agents goes in wrappers, not source** — K31's sourced env did not persist across tool calls (missed gh counts); K31b's baked wrapper scripts logged 347/347. Pattern: kitchen/memory/real-use-b/shims/.

- **cpSync ENOENT names the destination, not the vanished source** — a missing file in a copied .git is git housekeeping racing the walk (K38). Fixture repos pin gc.auto=0 and maintenance.auto=false at creation; retries are the documented backstop, not the fix.
