# Session 3: independent instrument sceptic

7 October 2026. Fresh reviewer, Windows Codex desktop, PowerShell, Node v24.11.0, TypeScript 6.0.3. Model: GPT-6 family as identified by the session system; the exact backend variant is not exposed here. I did not produce the instrument. I changed only this review file, executed only lab-owned scripts and compiler parsing of inert fixture strings, and used no paid service. No third-party project was executed, no production fix or confirmation content was inspected, and no heavy job was run.

## Standing

**The corrected instrument-foundation claim stands, within its declared scope.** Blind development ingestion, deterministic fixture selectors/disclosure/scoring, and the virtual TypeScript parser passed the checks below. This is not admission of any task, an empirical repair result, a complete replay instrument, or a confirmation freeze. Runtime traces, base-tree resolver adapters, source maps, Python AST, failure identity, isolation, packaging closure and independent authority/context verification remain unimplemented or unverified. Confirmation remains closed.

The first version had substantive defects; its passing self-check alone did not validate it. The author corrected those defects during review, and I independently reran the attacks. The parser remains a syntactic heuristic: computed aliases/generated code can evade recognition, and the README now says so. It must not be described as a sound whole-language dependency analysis.

## Reproduction and exact final code identity

Working directory: `C:/Users/shout/Desktop/Projects/private-task-mvp-lab`, branch `lab`.

Command: `node lab/lines/example-slice/instrument/check.mjs`.

I ran it before correction and after correction; both exited zero. The final run independently reproduced E = main/warm, EI = main/types/warm, R = cold/main/types/warm, G = all six registered-root production files including runtime JSON. Repository source disclosure was 2/6 files and 57/254 bytes; registered-root disclosure was 1/5 files and 35/232 bytes; total repository disclosure was 3/10 files and 124/384 bytes. `small` was false. The thirteen supplied primary-screen counterexamples all failed their screen; all 45 confirmation IDs were rejected.

Final measured SHA256 values:

| File | SHA256 |
|---|---|
| core.mjs | d1f959dc5041ea96fc075fa01b87dd9a991bc56b818dedf3efd1901b5fb625d8 |
| typescript-graph.mjs | b88960231a2e198e7cfa4dcd97dc4d3068ef2a709fd0033f85abe80647092fc7 |
| collect-development.mjs | fa1d08c5e570f988689b35c8a9f5b81bf1153f035f143d779d921b4c116c4d94 |
| check.mjs | a890a56fa59ea1d67e48a8129d61f69f5d93e061e15cea71f18a07041d7ebe13 |

These are deterministic calibration runs, not repeated stochastic research observations. No empirical task rate or interval is justified.

## Adversarial findings and disposition

1. **Accepted-commit provenance was not established by the original collector.** It fetched PR-head changed-test blobs, then attributed them to the accepted commit without comparing its actual first-parent change. Merge-time changes could therefore produce the wrong overlay. This was a code-inspection finding, not an observed mismatch on a real case. The author switched to the accepted first-parent comparison, refuses its 300-file truncation boundary, and preserved original ky823/click3186 snapshots rather than rewriting them. Independent public rechecks below matched their path/action/blob sets. Test renames now emit delete-old/add-new. Cross-family renames are refused without emitting the previous production pathname.

2. **An invalid root could flip the size result.** My five-file fixture had `source/a.ts` and four `source-sibling/*.ts` files, all one byte. Shipping `source/a.ts` with `root='source/'` produced root denominator 1 and `small=false`; `root='source'` or `root=''` produced denominator 5 and `small=true`. `disclosure` lacked the root validation used by other entry points. The corrected shared validation rejects both invalid roots; the independent attack and added regression checks pass.

3. **Portable path aliases were accepted.** `source/a.ts:stream`, `source/a.ts.`, `source/AUX.ts`, and `source/a.ts ` were initially accepted. These are unsafe/ambiguous for portable Windows materialization even though some are ordinary POSIX names. The corrected validator rejects all four. This verifies lexical rejection, not actual filesystem isolation or symlink-resistant creation.

4. **Ordinary indirect code generation appeared dependency-free.** Direct `eval("import('./b.js')")` was marked dynamic, but `globalThis.eval(...)`, `(0, eval)(...)`, and `new Function("return import('./b.js')")()` initially produced empty dependency lists. The protocol explicitly requires eval-generated imports to stay unresolved. The corrected parser marks these and `globalThis['eval'](...)` dynamic. These strings were parsed, never evaluated. Aliases and arbitrary generated code remain an explicit limitation.

5. **Other parser attacks survived.** Relative `.js` imports resolve to supplied `.ts` files; a supplied `paths`/`baseUrl` alias resolves locally; nonliteral `require` stays dynamic; a cold literal import is traversed. Syntax failure, absent graph rows, absent local targets, zero denominators, unsafe counts, duplicate/case-colliding paths and symlink records are covered by the independently rerun checks. This does not test actual project tsconfigs or package environments.

6. **Trust boundaries remain essential.** `score` accepts upstream classifications, authority, observations, context labels and size summaries. It does not verify that a claimed failure identity, read trace, editable set or replaceability evidence is true. Its supplied-input boundary is now stated in the README. Unknown/essential context, immutable-file misses, forbidden additions, expanded/optional variants and differing/unknown failures do not pass the supplied primary-screen checks. No claim about arbitrary malicious manifests or a fully authenticated instrument is earned here.

Documentation precision raised separately: GitHub `--jq` filters in the client subprocess, after the full HTTP response is received. Evidence supports no production path/patch emitted to the agent or saved snapshot; it does not support saying no production patch was fetched at the transport level. The model remained blind to that response content.

## Independent corrected root/path/parser attack

Run this PowerShell here-string through Node from the working directory above:

```powershell
@'
import assert from 'node:assert/strict';
import {typescriptGraph} from './lab/lines/example-slice/instrument/typescript-graph.mjs';
import {disclosure,safePath} from './lab/lines/example-slice/instrument/core.mjs';
for(const root of ['source',''])assert.throws(()=>disclosure({repo:'sindresorhus/ky',root,manifest:[],shipped:[]}));
for(const p of ['source/a.ts:stream','source/a.ts.','source/AUX.ts','source/a.ts '])assert.throws(()=>safePath(p));
for(const expression of ["eval(\"import('./b.js')\")", "globalThis.eval(\"import('./b.js')\")", "(0, eval)(\"import('./b.js')\")", "new Function(\"return import('./b.js')\")()", "globalThis['eval'](\"import('./b.js')\")"]) {
 const edges=typescriptGraph({'source/a.ts':expression,'source/b.ts':'export const b=1'}).graph['source/a.ts'];
 assert(edges.some(e=>e.kind==='dynamic'));
}
console.log('Independent corrected attacks passed');
'@ | node --input-type=module
```

Observed exit zero and `Independent corrected attacks passed`.

## Collector attacks and saved development evidence

An independent Node process mocked `child_process.spawnSync` and the filesystem mutation methods, synchronized the built-in ESM exports, then imported the actual collector. All 45 confirmation calls to **collect**, not merely authorize, threw with exactly zero subprocess calls. A valid synthetic renamed test produced delete-old/add-new. Four modes—300 returned comparison files, cross-family rename, unsupported change status, and wrong blob byte length—each threw before the mocked snapshot writer ran. No snapshot file was written by that attack. This directly tests control flow; it is not a claim that GitHub will always provide complete metadata.

For real saved development snapshots, I separately recomputed Git blob SHA1 and byte length locally for every nondeleted overlay in all five saved development directories. I also checked that all five IDs are authorized development IDs. I did not print or execute test bodies.

For ky823, zod5595 and click3186, an independent read-only Node script checked each saved receipt SHA256, checked collector overwrite refusal, reran `acceptedTests(repo,baseCommit,acceptedCommit)`, converted accepted statuses to path/action/blob tuples, and compared the exact sorted tuples to the saved overlay. All matched. The first network attempt was sandbox-denied; the identical read-only recheck succeeded after tool escalation was approved. No automatic-review rejection occurred and no artifact was modified.

The newly added documented read-only command was then run for both additional development snapshots:

```
node lab/lines/example-slice/instrument/verify-development.mjs colinhacks/zod 5599 --check
node lab/lines/example-slice/instrument/verify-development.mjs pallets/click 3192 --check
```

Both exited zero, `matched`, `readOnly=true`. Results across independent accepted-comparison rechecks:

| Development case | Overlay entries | Snapshot SHA256 |
|---|---:|---|
| ky823 | 2 | cd236d68f6f67fe6b9b3d6910aa6448cb9c3109b1bee9260e3cd1efae216b990 |
| zod5595 | 0 | 93cad4b0ed19468aa4284dd6f63552b3254766388c2931270c433d896014434a |
| zod5599 | 1 | cad05882a1e43fbac5e1a67bf5f76c41542921ff502a2d6227a509ce34104ada |
| click3186 | 0 | 9e2f2b7c841755afadd614a859f60077ebc6173ee627145ac28e16ef6f885099 |
| click3192 | 0 | 03f85c5f32c4733cab4b8348ca4b53cb770be1ac324fa538b0b58e7ee2ab244a |

Zero changed-test overlays are successful ingestion observations, not runnable cases. The zod5599 positive overlay gives a real check of the repaired test-family filter. No admission or exclusion rate can be calculated from these snapshots.

## Framing, scholarship and principles

No novelty or empirical repair claim is made by this unit, so a literature-baseline experiment is not implied by its fixture checks. I checked the local protocol and parser against the stated mechanics; I did not independently audit every technical documentation link or the earlier survey in this review. The explicit stage limits are appropriate and must remain attached to the results.

Principles read and applied: **Prove It Works** caused independent execution and raw blob checks instead of accepting author receipts; **Sequence Verifiable Units** kept standing confined to ingestion/scoring/parser rather than granting a runtime/confirmation gate; **Model the Domain** motivated the malformed-root attack and checking independent authority/context/observation fields. I do not claim principles whose files were unavailable or unread.

## Final exact-file recheck after path hardening

The author subsequently extended lexical rejection to all seven Windows forbidden characters (`<>:"|?*`) and ASCII control characters 0–31, and added question-mark/newline regression fixtures. I read that change and reran `node lab/lines/example-slice/instrument/check.mjs` independently: exit zero, same selectors/disclosure, thirteen primary counterexamples rejected and all 45 confirmation IDs rejected. A separate inert Node assertion loop over every forbidden character and all 32 controls also exited zero. The instrument README now explicitly distinguishes transient full HTTP response retrieval from model/snapshot blinding; the documentation precision finding above is resolved.

This recheck supersedes the earlier table's core/check hashes. Final measured SHA256 values are:

| File | SHA256 |
|---|---|
| core.mjs | 16166419ee060c901206246ee1daf9b3959b8dd0ae2ea12aa16944dcda4de2c8 |
| typescript-graph.mjs | b88960231a2e198e7cfa4dcd97dc4d3068ef2a709fd0033f85abe80647092fc7 |
| collect-development.mjs | fa1d08c5e570f988689b35c8a9f5b81bf1153f035f143d779d921b4c116c4d94 |
| check.mjs | e20481707d96dac55887d27a12202a01c857f1127ff6b54c481e9dfedbb9f439 |

Standing remains: **the corrected foundation claim stands at these final hashes; runtime and confirmation gates remain closed.** No third-party execution or new content disclosure occurred during this final check.
