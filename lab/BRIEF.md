> Gate 3 is now running under the owner/CTO required Box-first correction. Its passive-offer starts are preserved separately and excluded. The active plan was pushed before restarted runs; control, tasks, model and limits stay fixed. No final finding yet. The Gate 2 brief below is historical context pending closeout.

# Research brief for the CTO

**No wave is in flight. Gate 2 has reported. Its answer to your question is: no, there is almost no reading to save before the fix is found; and it turned up a different stretch of reading that the trial was not aimed at. The next decision is yours and the owner's.**

Replaced 8 October 2026 after Gate 2; master through `f47414f`, lab level with it. Plan pushed before any sample record was read (`4f98f3f`). Detail: `lab/lines/box-trial/gate-2-result.md`.

## Gate 2: one table, one sentence

Two published agents (mini-SWE-agent with Gemini 3.5 Flash, September 2026, 26 of the 30 tasks; with GPT 5.2 Codex, February 2026, all 30), given the issue and not the failing test.

| | Gemini | GPT |
|---|---|---|
| Steps in a run, median | 36.5 | 34.5 |
| Steps before first opening or editing the fix, median | 2 | 4 |
| Share of the run before that: steps / text read | 7% / 5% | 15% / 10% |
| Other functions read before that, all tasks; outside the Box | 37; 35 | 144; 119 |
| Steps between finding the fix and first editing, median | 18 | 10.5 |
| Other functions read in that stretch; outside the Box | 220; 65% | 438; 78% |
| Share of all text read that falls in that stretch | 46% | about 39% |
| Failed runs that had found the place | 2 of 2 | 6 of 7 |

**Sentence:** these agents find the place in a few steps and then read widely before changing it, mostly outside what the failing test ran; the Box has almost nothing to save in the finding, and the records cannot say whether the reading after it is waste or need.

The second block of rows is the sceptic's, outside the plan. It reproduced every planned number first.

## What you should weigh

1. **The trial's claim, as written, has no room.** "A Box saves what an agent spends working out where to look": on these tasks that is a few percent of a run. Gate 1c as planned (ranking inside the Box so the fix comes sooner) aims at something already fast. The lab advises against running it in that form.
2. **Eight of nine failed runs had opened the right function.** They failed at understanding or fixing, not at finding.
3. **The open question the records raise:** after finding the fix, agents read 220 and 438 other functions before editing, two thirds to three quarters outside the Box. If that is waste, "what ran and what did not" could prune it. If it is need (callers, siblings, conventions), a Box should stay out of the way. This cannot be settled from records.
4. **Caveats that cut the other way.** These tasks are probably in the models' training data, and one agent named the right file before anything had shown it on 7 or 8 tasks; on private code, finding may be slower. Two agents, thirty tasks, one run each.
5. **The file-level filter again does about as well as the function-level Box.**

## Options, with the lab's view

- **Stop the Box trial here.** Supported: the claim it was built to test has little room, on the evidence the trial itself chose.
- **One cheap further look, no agent runs:** read by hand ten of those between-finding-and-fixing stretches and label each function read as used in the fix, plausibly needed, or irrelevant. An afternoon; it says whether point 3 is worth anything. This is what the lab would do next if anything.
- **Gate 3 as written** would now test the wrong thing (a brief against a Box for locating). Not advised without redesign.

## Other lines

A, B, C, E paused, unchanged. E's session 2 in the redirected area has not run.

## Needed from the kitchen and the owner

Nothing. The lab ran no agent and downloaded only public records.
