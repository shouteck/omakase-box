# Take preview

## Brief

Add `omakase-box take <id> --preview`: share take's eligibility checks, read
GitHub account/permissions/branch head, and show the exact prospective draft
without creating a workspace, local record, GitHub artifact or consuming approval.
Human and `box-bounty/take-preview@1` output; help, solver docs and skill agree.

## Plan

- Blocking first steps: inspect take's settings, board and GitHub wrappers for writes.
- Independent workstreams: n/a — eligibility, output and tests share one contract.
- Shared mutable state: preview bypasses the CLI board-hint flush and reuses the existing read-only GitHub helper, without payload folders or probe-cache writes.
- Smallest safe decomposition: one writer for shared eligibility/draft model, CLI document and fixture tests.
- Architect skipped: the owner supplied the settled design; this subagent owns the diff directly.
- Principle model-the-domain: one typed prospective draft builder and one eligibility path for both commands.

## Done when

- `node scripts/workspace.mjs build`.
- Scoped bounty suite: take-preview, pf25, pf32, bt57, bt61-solver, bt61-boundary, bt61-agreement.
- `env HOME=$HOME/kitchen-home node scripts/verify.mjs test:box-bounty`.
- Hosted verify on all three systems for the pushed commit.

## Changed expectations

- `tests/box/bounty/bt61-text.snapshot.json`: usage lines for take gain the advertised `--preview` flag. No existing behavioral assertions change.
- `tests/box/bounty/SURFACE.txt` and its owner map: register the new flag/schema and the fields observed by take-preview.test.ts.
- `tests/box/bounty/bt43.test.ts`: add the tool-composed prospective draft body to NOT_FOREIGN, as the existing post-preview body is; the reading-boundary assertion is unchanged.

## Result

- Build passed (57 modules); scoped requested suite: 7 files / 33 tests passed.
- Surface regenerated from real output: 10 files / 122 tests passed. Only the new flag/schema/fields were added.
- Full verify and hosted run pending. Verify requires a clean committed candidate, so the implementation is committed before that local check.
- Terminal behavior is exercised through the built CLI; no graphical UI changes or live GitHub mutations tested.
- Existing ask-mode approval flow is preserved: preview names the allow command, while real take records the waiting request first.
- First full verify failed: the known github-history WIP-author flake (isolated rerun: 23/23 passed), and the skill exceeded its existing 1200-character budget. The second full run exposed a pinned setup sentence after shortening it; restored that sentence and shortened the skill description instead. Skill/launch-copy checks pass: 2 files / 16 tests, with existing expectations unchanged. The history flake recurred and its second isolated rerun passed 23/23.

## PR review follow-up

- Implementation commit 445eec57 passed hosted run 45054868941 on Linux, macOS and Windows.
- Renamed forks: `target` is a prediction when forking. The human line (also in JSON `lines`) now explicitly says GitHub assigns the name and may reuse an existing fork with a different name. No extra GitHub calls or mutations; a regression test seeds a renamed fork and checks this disclosure and unchanged fork state.
- Legacy settings migration remains unresolved, per the follow-up's scope limit. There is no existing non-writing owner-settings reader: `loadSettings` validates, resolves legacy projects and writes migrated settings/state in one function. Preview reaches it through `solvingOf`, board reads and the draft credit's `boardAddress`; changing only the first call would not prevent writes. Separating those paths needs more than a few lines and is not attempted here.
- The same first-read migration is reachable in other commands: discover calls `solvingOf`; config display calls `loadSettings` directly; status calls `ownerStatusLine`/`readDecision`; post preview calls `repoReward` for an unposted bounty and `boardAddress` while composing the listing. All reach `loadSettings`, whose carried-state and legacy-project branches persist the migration. These are code-path checks, not live legacy-file experiments.
