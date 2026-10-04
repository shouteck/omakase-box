# Routine kitchen Git checkpoints

## Standing CEO direction

On 4 October 2026, after discussing commits and pushes for finished waves, the CEO said: "It should be part of the kitchen activities isnt it". Treat routine saving of reviewed project work as a standing kitchen responsibility, without a separate commit/push approval every wave.

Authorized destination: the existing private GitHub repository `shouteck/omakase-box`, remote `origin` at `https://github.com/shouteck/omakase-box.git`, checkpoint branch `master`. These values were read from the current checkout. This standing order authorizes ordinary local commits and non-force pushes of accepted project work to `origin/master`. It does not approve a new product wave, spending, publication elsewhere, releases/deployment, repository visibility changes, PRs or unrelated shared-branch merges.

This also covers the outstanding reviewed S001/W001 work and the CEO-requested kitchen-instruction updates after their current candidate is verified. Historical S001/W001 briefs remain immutable: their earlier exclusion of commits/pushes was accurate. Record the later checkpoint as an operation under this new standing authority, not as an action authorized by the historical wave.

## When and who

After required checks and independent review, the CTO coordinates a checkpoint before presenting the finished report. An available integration worker owns product/Git integration under the approved wave and its leases; the CTO may checkpoint governance-only changes directly. Do not make the CEO manage staging, commit messages or routine pushing. New product implementation still waits for wave approval.

On START.md, reconcile a missing checkpoint for previously accepted work and complete it under this standing order when it is safe and no hold/revocation applies. The instruction entrypoint alone does not approve new implementation. The standing order, rather than the next wave's "Approve", provides authority to save already reviewed work.

## Checkpoint procedure

1. Reconcile active writers/leases, worktree, branch, actual remote URL, repository visibility and current local/remote history. Before upload, confirm the destination remains the authorized private repository. If visibility/access cannot be verified, report the checkpoint blocked; do not upload somewhere else or seek repeated approval for the same authorized destination.
2. Select only accepted wave outputs, their necessary governance/evidence and independently checked instruction changes. Inspect the exact staged diff. Preserve unrelated or unfinished work unstaged; do not blanket-stage the checkout. Exclude actual credentials, .env/.runtime material, ignored files and raw machine-specific session exports. Use metadata/diff and authorized sources; do not read secret paths to perform this check.
3. Confirm the selected bytes match current review/check evidence. Changed accepted documents or product files require affected revalidation. Preserve earlier manifests/verdicts as history rather than rewriting them to manufacture a pass. Obtain independent review of unreviewed instruction changes before checkpointing them.
4. Commit with a concise message identifying the wave or governance checkpoint. Record the actual commit and included scope. If the work is already committed, verify it and avoid duplicate commits.
5. Push the reviewed checkpoint to `origin/master` without force. If local HEAD contains other unreviewed/unrelated outgoing commits, or the remote has advanced incompatibly, stop and reconcile within existing authority; do not push them, rewrite history, reset the checkout or overwrite the remote. Material integration changes require their own checks and existing wave authority. Never push a branch just because its tip is convenient.
6. Confirm the authorized remote contains the checkpoint commit. Record the real destination/result and distinguish an accepted deliverable, a local commit and a confirmed remote checkpoint. Checkpoint bookkeeping added afterward can be saved in a subsequent scoped governance commit; do not claim that a receipt is inside the same commit whose hash it records.

Authentication/network failure or a genuine integration conflict is a blocker, not a request to renew standing permission. Preserve the local commit and report the practical problem. Respect tool approval controls; do not bypass them. A CEO hold stops new commit/push operations until resumed; ordinary historical approval cannot override a hold.

## CEO presentation

Briefings may say once: "Reviewed work is committed and pushed using the kitchen's standing Git policy." Keep the exact destination/authority in the full brief; do not ask for a separate routine commit/push approval.

Finished reports contain one short line:

> **Saved:** committed and pushed to GitHub.

If incomplete, say exactly what happened, for example:

> **Saved:** committed locally; GitHub push blocked by sign-in.

The "Approve" reply after a finished report remains approval of the proposed next wave. Saving the completed wave is already the kitchen's responsibility. A different repository/destination or excluded operation needs a concrete new proposal; routine checkpoints to this authorized destination do not.
