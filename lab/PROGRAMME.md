# Research programme

Owned by the lab lead. This is where the lab says what it is working on and why. Three active lines at most; a line that is not converging is closed, with the reason recorded.

## What the product needs to know

These are needs, stated by the CTO, who may add, reword or withdraw one through the "For the lab" section of `BACKLOG.md` on master. They are not research questions yet, and they carry no view on method. Turning each into a well-posed problem, after reading the field, is the lab's first work.

1. **Sufficient context.** Given a change to make in an existing codebase, what is the least material another developer or agent needs in order to make it correctly and prove it, and how can that material be found automatically? The material need not be a literal subset of the code: it may be a reduced stand-in for the rest of the system, provided there is a stated, checkable sense in which working against the stand-in is the same as working against the original. What kinds of "the same" can be checked by machine, at what cost, and for which kinds of code? Today the kitchen follows TypeScript imports from the files to be edited and ships those files as they are.
2. **Judging what tests cannot.** Some requested outcomes have no mechanical check: how something looks, reads or feels to use. How can a delivered result be judged against what was asked, reliably enough to accept or reject work?
3. **Specifying acceptance cheaply.** Delegating one 8-line change needed about 470 lines of checks written for that request (R1, 6 October 2026). How can what "done" means be stated once, by a non-specialist, and enforced on both sides without writing code per request? The kitchen is trying a direct fix (R2); if that fails this becomes a line.
4. **Whether less context helps.** Does an agent given a small, verified package do better than the same agent given the whole repository, and when?

## Ideas on the table

Offered by the owner and the CTO. They are hypotheses to weigh against the literature, with no special standing; record here what the survey says about each.

- **A leaner equivalent, with a green tick (owner, 6 October 2026).** Instead of handing over a cut-down copy, hand over a much smaller version of the code that can be shown to behave the same as the original where it matters for the task, so that a person or an agent works on the small version and gets a machine verdict that the implementation is correct and behaves as expected. The owner's direction on how far to take it: go as far as can be reduced to an algorithm; where it cannot be, deliver the best available. Whatever level is reached, the tick must say exactly what it guarantees and nothing more.
- **A model as judge (owner, 6 October 2026).** For outcomes no test can check, such as a visual design, use an image-capable model to give the verdict.
- **Type-only stubs (kitchen, D2.1 prototype C).** Replace everything outside the editable files with generated type declarations. Tried once on one fixture and not chosen; see `git show origin/master:waves/D2.1-proto.md`.

## First session

Before any line is opened: survey all four areas at overview depth, enough to learn what each problem is called in the literature, who has worked on it, and how far the field has got. Write `lab/survey.md`. Then decide, and record here with reasons:

- which needs are already answered well enough by existing work to transfer directly;
- which become lines, in what order, and how each is formulated;
- which should not be pursued, and why.

The order above is the product's, not a recommendation. Reorder freely.

## Active lines

None yet.

## Closed lines

None yet.

## Instruments the lab owns

None yet. List each benchmark, labelled set and harness here with its location, size and what it measures.
