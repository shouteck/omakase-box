# Overnight runs

Read this only when started with `START.md overnight`. Everything in [AGENTS.md](../../AGENTS.md) and [KITCHEN.md](KITCHEN.md) still applies.

The owner says `START.md overnight` and goes to sleep. The head chef runs waves back to back and reports once, in the morning. This is pstack's autonomous run: state the exit condition, drive to it, checkpoint as you go, never relax the condition to declare victory. Read `.devin/plugins/box-pstack/skills/poteto-mode/playbooks/autonomous-run.md` and `pause-safely.md` first.

**Before the first wave**, write `waves/night-<date>.md` with:

- the exit condition as something checkable ("D1.2 merged to master", "K2 and K3 merged");
- the scope: milestones already approved in STATUS.md, plus any the owner named in the overnight message. Naming a milestone there is its approval. Nothing else is in scope;
- the limits the owner gave (a stop time, a number of waves). If none, stop when the exit condition is met or nothing in scope is left;
- the queue: the "Night queue" in STATUS.md, cut down to what is in scope. Keep that queue stocked in the day so a night never runs dry: when a wave closes, the head chef adds the next product waves and any kitchen cleanup that is ready.

**During the night:**

- Every wave runs exactly as in the day: brief, cook, the pass, merge on PASS. Nothing reaches master without the pass. A night run never skips review, weakens a test or lowers a verdict level to keep moving.
- Never stop to ask. When a question comes up that only the owner can answer, park it in the night file with the options and the default you would choose, then move to the next wave in the queue that does not depend on it. Kitchen cleanup waves are there for exactly this.
- A wave that stalls (two attempts with nothing new, or three times its timebox) is parked: leave its branch as it is, write down what was tried and what you would try next, move on. Two parked waves in a row means something shared is wrong: stop the run.
- After every wave, merged or parked: replace STATUS.md, push master, add a line to the night file. If the session dies, at most the wave in flight is lost.
- One heavy job at a time, and five minutes between full verify runs.

**Not at night, whatever the reason:**

- anything on the owner-only list in AGENTS.md: spending, new remote destinations, external messages, deleting anything not disposable;
- starting a milestone the owner did not approve or name, or anything past the end of the night queue;
- starting D4 or any wave whose result is a recommendation to the owner;
- changing the rules: AGENTS.md, this file, role files and `scripts/verify.mjs` are read-only overnight. Note the change you want in the night file instead;
- adding or upgrading a dependency, or downloading anything;
- force-pushing, rewriting history, or pushing an unreviewed branch.

**Stop when** the exit condition is met, the owner's limit is reached, nothing in scope is left, two waves in a row were parked, or the host reports that usage is running out. On any stop, pause safely: no half-written files, every branch committed, every resource the run created removed, STATUS.md current.

**The morning card** goes at the top of the night file and is what the owner sees first:

> **Overnight - met / partly met / stopped early**
> **Merged:** up to three outcomes, with their verdict levels.
> **Parked:** each wave left on a branch, and why, in a line.
> **Waiting for you:** each parked question with the default taken, or "nothing".
> **Next:** what a bare START.md will do now.

Under 200 words. Counts come from Git and the wave files, not from memory. The owner keeping the machine awake overnight is the owner's setting; the kitchen does not change it.
