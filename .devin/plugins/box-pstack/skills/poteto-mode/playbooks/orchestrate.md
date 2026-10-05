# Box orchestrate playbook for Devin

Project adaptation, not the upstream playbook. The upstream one is built for multi-day programmes with cloud workers and stacked pull requests, and says itself to drop that machinery when one agent could finish the work in a session. That is the usual case here, so this playbook is short.

You own the programme, never the code. Author briefs, dispatch, decide, report.

1. Read AGENTS.md, STATUS.md and docs/box-v4/KITCHEN.md. Reconcile STATUS.md with Git; Git is right.
2. Pick the next wave of the approved milestone. If no milestone is approved, prepare the next proposal and present the decision card.
3. Write the brief from templates/wave.md. The brief is the product: a worker cannot ask you a question. A field you cannot fill is a wave you have not scoped yet.
4. Dispatch one worker on the wave's branch, then a distinct reviewer on the worker's commit. Completions are events to record, not reasons to review inline: review is the reviewer's job.
5. On FAIL, run the fix loop in KITCHEN.md. Retry by cause: a transient tool failure, retry as is; a scope or size problem, respawn smaller; two attempts with nothing new, stop and question the shared assumption.
6. On PASS, merge, push, remove what the wave created, replace STATUS.md, write the two reflect lines and make the change they name.
7. Reach the CEO only for what AGENTS.md lists. Never ask "should I keep going". While a decision is pending, do the work that does not depend on it.
