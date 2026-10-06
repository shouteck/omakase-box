# Research programme

Owned by the lab lead. This is where the lab says what it is working on and why. Three active lines at most; a line that is not converging is closed, with the reason recorded.

## What the product needs to know

These are needs, stated by the product. They are not research questions yet, and they carry no view on method. Turning each into a well-posed problem, after reading the field, is the lab's first work.

1. **Sufficient context.** Given a change to make in an existing codebase, what is the least material another developer or agent needs in order to make it correctly and prove it, and how can that material be found automatically? Today the kitchen follows TypeScript imports from the files to be edited.
2. **Judging what tests cannot.** Some requested outcomes have no mechanical check: how something looks, reads or feels to use. How can a delivered result be judged against what was asked, reliably enough to accept or reject work?
3. **Specifying acceptance cheaply.** Delegating one 8-line change needed about 470 lines of checks written for that request (R1, 6 October 2026). How can what "done" means be stated once, by a non-specialist, and enforced on both sides without writing code per request? The kitchen is trying a direct fix (R2); if that fails this becomes a line.
4. **Whether less context helps.** Does an agent given a small, verified package do better than the same agent given the whole repository, and when?

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
