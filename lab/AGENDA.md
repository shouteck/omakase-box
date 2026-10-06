# Lab agenda

Owned by the lab lead. The owner has left the choice and order of questions to the lab. Keep it to five open questions at most; each names the product decision it informs and a stop date. Reorder, replace or retire questions as evidence comes in, and say why in the commit message.

These three are the starting candidates, written by the CTO on 6 October 2026. The lab lead's first job is to read around each and decide whether they are the right questions, in the right order, framed the right way.

## Open

### Q1. Can a model judge an outcome that tests cannot?

Some requests have no mechanical check: a layout, a visual design, wording. Can an image- and text-capable model, given the agreement and the result, give a verdict the owner would agree with?

- **Product decision:** whether a Box may carry a judged check alongside tested ones, and whether its verdict can accept work or only pre-screen it for the owner.
- **Start by reading:** work on model-as-judge reliability, rubric versus pairwise comparison, and visual UI evaluation.
- **Needs from the owner:** about fifteen minutes labelling a small set of examples as acceptable or not. Ask once, with everything prepared.
- **Stop date:** 20 October 2026.

### Q2. What does import-following miss when slicing a codebase into a Box?

The kitchen chose compiler-derived closure for TypeScript after the D2.1 prototypes. What does a real change need that this misses: configuration, assets, generated code, dynamic loading, runtime registration, other languages? How often, and what does each fix cost in disclosed source?

- **Product decision:** how far the supported task class can widen, and what a Box must declare instead of discovering.
- **Start by reading:** program slicing, build-graph and dependency analysis, test impact analysis, and the D2.1 prototype result (`git show origin/master:waves/D2.1-proto.md`).
- **Stop date:** 27 October 2026.

### Q3. Does an agent do better with a Box than with the whole repository?

Same agent, same task, same checks: the Box versus the full repository. Success, tokens, steps, wrong turns.

- **Product decision:** whether "smaller verified context" is a real advantage to lead with. This is the comparison D4 needs and has not got.
- **Start by reading:** work on context length, retrieval and agent performance on repository tasks.
- **Constraint:** zero cost limits the number of runs; state the run count and treat small differences as noise.
- **Stop date:** 3 November 2026.

## From the kitchen

- R1 (6 October 2026) found that delegating an 8-line change needed about 470 lines written for that one request. The kitchen is addressing that directly in R2. If R2 does not solve it, "how can a check be specified without writing code per request" becomes a lab question.

## Retired

None yet.
