# Status

Updated by the CTO on 14 October 2026, at the K19/BT13/BT14 close — the three waves briefed from K18's critique, run in the owner's approved order.

## Now

- **K19 merged and pushed** (`cf3c1fc`; reviewed `c828b30`, PASS test-verified). Every stand-in GitHub now answers like GitHub — one object for `issues/<n>`, `page=` honoured, shared issue/PR numbering — and `tests/kitchen/k19-github-standin.test.ts` drives them through the real transcript's request set and fails on drift. The re-recorded stand-in demo shows the pull-request list.
- **BT13 merged and pushed** (`94a603a`; reviewed `18d9d29`, PASS test-verified). "Ask me each time" now holds merges too: `apply` waits in a named state, `allow <id>` releases exactly the shown state — bound to commit and branch tip, so a moved branch asks again, and nothing an agent writes into the record can mark a merge approved (the answer lives in the owner settings file). Every owner-facing message opens with a plain-language block to pass on — no hashes, no command names, a question not a command. Measured as K18 measured: 15/15 relays carried the block word for word, 15/15 fresh owner reads stated the merge gate matching the mode, and the partial-merge pay message lands ("you were not asked…; the merge left these as they were: app.txt" — the stand-in owner spotted the tension unprompted).
- **BT14 merged and pushed** (`0696b8f`; reviewed `a9553d1`, PASS ui-verified; tip `9978008` adds the pass's negative test). All 8 items: instruction-file edits are named and uncommitted; `create` states file placement and the owner gate; `status` leads with waiting solutions; refresh failures name their reason; the committed-secret advice is honest; bare `config` is short and `config add/remove repositories` refuse by name (the removal the owner's go covered); `box --help` leads with `box bounty`. Two cold fresh-agent runs — one collecting, one posting — ran their journeys end to end with **zero commands not named by earlier output**. Collecting reads shrank (1659→1404 chars, actionable line 5→4); `create` grew by exactly the two lines the brief requires.
- **Owner's settings file:** unchanged; still carries the retired shared `reward $5 / limit $50` from K16 (inert under BT11c). Putting it back is the owner's own command.
- **K18 findings status:** F1–F9 addressed by BT13/BT14; F10 (safe-list "clean" headline) and F11 (partial merge earns whole reward, now stated) addressed by BT13. Remaining open items are in the wave files' findings and kitchen/INBOX.md.
- Off-machine verify on master green at each kickoff; all three merges pushed.

## Next

No wave is named and none is briefed. Ready when wanted: the backlog candidates the passes logged (deriveTitle empty-title edge, permission-line mislabel on rewritten remotes, post-apply stale-index friction, the GitHub-flavored first-use block on held folder posts); publishing the K17 demo where the owner chooses; whatever the owner picks next.
