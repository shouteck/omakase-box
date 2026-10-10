# Cook's scaffold proof (recorded before any run)

The head chef's run evidence lands next to this file; this one only proves the
scaffolding itself, on the cook's commit.

## The check fails today — `node kitchen/bt5/check.mjs` on un-fixed code

    ok   describe exits 0
    ok   describe prints the destinations line
    FAIL the destinations line is not dangling — "  where post --to may deliver: only inside "
    ok   the destinations line prints no empty parens
    ok   an empty list is not claimed to mean any local folder
    ok   a bounty drafts and confirms in the scratch repo
    ok   post --to is refused destination-not-allowed
    FAIL the refusal prints no empty parens — bounty post refused
         (destination-not-allowed): --to <scratch>\deliver resolves to
         <scratch>\deliver, which is not inside the owner's allowedDestinations
         () — deliver inside one of them, or the owner widens the list in
         .box/limits.json
    ok   control: a listed destination is named on the line
    ok   control: --to outside the list is refused
    ok   control: the refusal names the allowed directory
    check: 2 failed — exit 1

Both recorded BT4 nit symptoms reproduce: the dangling `only inside ` line
(trailing space included) and the refusal's empty `()`. The non-empty-list
control passes, so the check pins the bug, not the feature.

## The fixture builder — `node kitchen/bt5/fixtures.mjs <scratch>`

    toolchain probe: php could not be executed (ENOENT)
      doable/           node check.js → exit 1 (old key still present)
      needs-toolchain/  node check.js → exit 1, naming php (ENOENT)

php's absence is proven by execution (spawn fails with ENOENT), then proven
end-to-end by running the fixture's own check — never assumed. Rung
materials (`*.rules-block.txt`, `*.reminder.txt`) were captured through the
built cli's `describe --rules` / `remind` against each fixture.

`--probe` mode: `php` → absent (ENOENT); `node`/`process.execPath` → present;
a made-up program name → absent. Exercised by tests/box/bounty/bt5.test.ts.

## Notes for the record

- A stray 54-byte file named `nul` (a Windows "could not find files" INFO
  line — the redirect trap the worker role warns about) sat untracked at the
  repo root before this wave's work began; removed so the tree is clean.
