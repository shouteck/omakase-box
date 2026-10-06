# A4 stage-2 evidence

Two fresh box-recipient agents worked folder-only on the live Boxes in
`C:\Users\shout\Desktop\a4-boxes\` (each received only the pasted recipient
role and its Box folder; nothing in the environment stopped it reading
elsewhere — instruction-only blindness, stated per evidence station). Recipient
identities as self-reported: npm recipient `f1ce021d` (Windows, Subagent
Default, self-described Windsurf host), Python recipient `e80bc884` (Windows,
Subagent Default). Exact models not known and not invented. Their claimed
effort splits (10/40/50 and 5/35/60 percent) are self-reported, not measured
clock — recorded as claims only.

## Sealed submissions (archived verbatim)

- `npm-cli/submission.json` + `npm-cli/recipient-paint.js`: ANSI table
  `{red:31, green:32, blue:34}`, unknown colors and empty input pass through.
  Recipient noted the request text says non-string text passes through while
  the base returned `''`; the declared checks do not exercise non-string
  input — this uncovered input class is a stated limit, not a gap in the
  loop. No fixture expectation was revised to accommodate the submission.
- `py-tools/submission.json` + `py-tools/recipient-slug.py`:
  `re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')`, non-strings `''`.
  Recipient asked whether non-ASCII transliteration was expected; ASCII-only
  per the declared outcome — no blocking gap.
- `pristine/*.json`: the untouched `box.json` manifests the `--box` flag was
  bound against (baseChecks with the red paired outcome and green guard).

## Owner verifies, pinned to stage-1 base 4f25db6, --box = pristine copies

Per-fixture candidate tally (each in its own log, counts not conflated):

- npm-cli: right (actual recipient submission) PASS (13:06:40–13:06:50Z,
  merge commit 7ac70120); no-op FAIL implementation-failure/command-check;
  empty FAIL; wrong FAIL; deleted — submit refused (recorded file missing);
  tamper (read-only checks/outcome.mjs) — submit refused; alt-right PASS
  (13:08:1xZ, merge commit recorded in case-altright.log).
- py-tools: right PASS (13:06:48–13:06:58Z, merge commit 8386b257); no-op
  FAIL; empty FAIL; wrong FAIL; deleted — submit refused; tamper — submit
  refused; alt-right PASS (13:08:5xZ, commit aabf54b1).

Verify commands were `box verify <submission> --agreement
examples/<fixture>/box-agreements/request.json --repo . --box
<pristine dir> --base 4f25db6188fd08c39325158ce01a6633fade740b`. Each verify
clones the real repository locally and runs the agreement's owner-context
declared commands in a scratch checkout; real history untouched.

## Multi-package slice (a4-multi-pkg)

Covered by `tests/box/package/a4-neutral.test.ts`: byte-identical
package.json/package-lock.json, excluded `packages/internal` absent with no
canary bytes, declared `npm.cmd ci --ignore-scripts --no-audit --no-fund`
setup pass in both contexts and real execution of the installed
picocolors@1.1.1, paired red outcome / green guard, alt-right verify pass,
no-op fail. Installation evidence is in the export's recorded baseChecks,
not asserted from install exit alone — the guard/outcome actually execute
the installed package.

## Clock

Stage-2 resume ~13:06Z; verifies complete by ~13:09Z. Wave dispatch
~12:45–12:49Z, 120-minute deadline ~14:45–14:49Z. Owner manual steps for
this stage: archive copies, six+one case boxes per fixture, one scoped test
run; unmeasured manual minutes are labeled approximate.
