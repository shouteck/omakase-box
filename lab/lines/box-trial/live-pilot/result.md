# One silent Box live pilot

9 October 2026. One pair on Sphinx 10614, frozen/pushed plan 95083b1 before either repair start. Existing ChatGPT allowance, GPT-5.6 Luna low effort in both arms, identical prompt/base instructions/tool schema; no Box instruction, badges or facts tool. No repeats or follow-on experiment.

**Observed: silent ordering reached a live agent, and it then opened promoted code. Both repairs failed. This one pair cannot establish which arm is better.**

| Recorded outcome | Control | Box |
|---|---:|---:|
| Completed command steps | 14 | 10 |
| Native search invocations | 8 | 5 |
| Search-containing commands | 8 | 4 |
| Searches actually reordered | 0 | 1 |
| Later explicit opens of promoted code | — | 1 |
| Reported cumulative tokens | 200,832 | 182,429 |
| Agent elapsed, seconds | 79.375 | 56.078 |
| Named failing tests passed | 0 / 1 | 0 / 1 |
| Guards passed | 5 / 5 | 5 / 5 |
| Native scoring | Clean failure | Clean failure |

383,261 reported tokens in all; neither run capped, no ceiling excess. Counts include cached input and reasoning output, as Gate 3; not an invoice or lead/reviewer accounting. Four control and two Box commands return test failure; one no-match search per arm. No native search errors, command rejection, timeout, reroute or host-tool request. Command-step counts do not include bookkeeping/scoring.

## The actual effect

Box step 5's ordinary grep for `def get_relative_uri` finds four definitions. The called `sphinx/builders/__init__.py:144` moves from second to first. Step 6 explicitly reads lines 135–165 of that file. Its complete source hash and unique code start match fresh failing-test evidence. This is an observed subsequent open, not proof that ordering caused it or that the helper is the fix. The bug was not solved.

Every native stdout record survives before the common 16 KB returned-text limit; the wrapper adds zero bytes. Box step 2 was truncated by that shared limit; the promoted search at step 5 was not. Raw native/shown streams, all commands, model events, prompts, usage and actual candidate patches are retained with hashes. Ordering metadata and traces are never sent in the tool response. The captured available shell commands are supported; explicit executable bypasses/arbitrary Python searches are not intercepted, and context/unsupported formats fall back.

## Safeguards actually passed

Gold production fix exported from the prepared test-overlay checkpoint and solved the immutable tests. Empty export failed. Gold plus production guard-breaking mutation failed guards. No expected test outcome changed. Fresh failing-test trace: 1,698 call keys, exact file/code-start/source identity, patched tests excluded.

Replayed 31 real search-containing commands. Final exact-wrapper/native comparison: 34 available search invocations, six reorderings; all exits, stderr bytes and stdout multiplicities match unwrapped execution. One unavailable rg attempt retains the native shell error; missing generated paths/no matches are native prerequisites, not wrapper refusals. Earlier recorder failures—GNU executable prefixes/locale and unavailable-command interception—were found and fixed with zero repair agents, with originals retained. [Preflight](preflight.md), [development](development.json).

The live scope was selected before checks because both published agents failed it and the previous high-effort control used 719,483 tokens. Both pilot repairs failing confirms no success ceiling here; it does not establish task/model representativeness. Control ran first; no repeats/no noise estimate. Smaller Box token/step figures are descriptive observations, not measured benefit.

## Review and stop

A fresh sceptic reread both complete saved records and independently rescored both actual patches: both fail the named test and pass all five guards. It verified actual reordered delivery, subsequent open, source identity, complete-stream conservation, launch receipts and accounting. The narrow integration claim stands. Its only mandatory correction was two definitions to four above; the original reviewed result remains at aeb977e. [Independent review](sceptic.md). [Summary](summary.json), [fixed plan](plan.md), [launch lock](launch-lock.json).

No more pairs. If this integration result stands, the CTO can bring the owner a separately capped comparison plan. No product work or broader trial is started by this pilot.

Closeout: only the exact newly pulled image and two verified empty owned scratch directories were removed. Initial absent-to-pull ownership is preserved in harness-before-context-guard.json; the later cached/preexisted receipt is unchanged. All scientific raw and review records remain locally with hashes. [Cleanup receipt](closeout-cleanup.json). No further run is authorized by this completed session.
