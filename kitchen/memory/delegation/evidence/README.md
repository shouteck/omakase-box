# K28 evidence provenance

Raw measurement runs (all `node kitchen/memory/delegation/measure.mjs`, same script):

- **Run 2, pre-fix** (`e5609a3` era, before the import-dispatch correction):
  `measure-console-run2-prefixed.log` — console transcript; its JSON sibling was
  overwritten by run 3 (provenance lesson recorded in the report). Numbers:
  push 156-175 ms, fetch 210-287 ms, push-1000 1890 ms, first-fetch 3159 ms,
  merge+retry 694 ms, restore 578 ms, pack 1.54 MiB, default clone 3 objs/1.34 KiB.
- **Run 3, post-fix** (`a7bedb4`, inside check.mjs on a busier host):
  `measure-report-run3-postfix.json` — authoritative raw record. Console stdout
  was captured by check.mjs, not separately saved. Numbers: push 221-417 ms,
  fetch 446-611 ms, push-1000 2937 ms, first-fetch 5995 ms, merge+retry 832 ms,
  restore 1241 ms, pack 1.54 MiB, default clone 3 objs/1.34 KiB.

**The report's step-4 table cites run 3 (post-fix); run 2 is kept labeled
historical.** Qualitative results identical across all runs; timings vary with
host load — single-host, local `file://` numbers only.

Other files: `prompt-a.txt`, `prompt-b.txt` (verbatim participant prompts),
`truth-key.json` (pre-existing answer key, unchanged), `check-console.log`
(regression check transcript, post-fix).
