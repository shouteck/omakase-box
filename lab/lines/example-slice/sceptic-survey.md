# Independent sceptic review: Line A survey

7 October 2026. Fresh reviewer of the targeted survey and synthetic witnesses; no real-task replay. Read the repository-root `AGENTS.md`, lab charter, sceptic role, programme's exact assertion, and all seven supplied Line A files. Host: Codex desktop, Windows/PowerShell, local lab checkout on branch `lab`. Model identity available to this session: Codex agent based on GPT-6; exact model slug/version was not supplied, so no model diversity is claimed. Node observed: v24.11.0.

## Standing

**The unconditional assertion does not stand as written.** The survey's separation of observation preservation, repair intersection, repair containment and work sufficiency stands. Its evidence does not show that a useful small Box is impossible, or that this product class fails. There is no coverage, size, solver-success or effort result here. Proceed to formulation and frozen replay, subject to the corrections below; do not transfer a selection guarantee.

The programme says any change making the example pass must touch code inside the influence region. Quantification over unrestricted repairs makes that false for an existing-code-only region: creation of a discovered data file can change the result with no existing code edit. More importantly, even a proved intersection theorem cannot justify shipping only that region. It says where some edit occurs, not where every necessary edit or reading input resides.

## Independent reproduction

Ran `node lab/lines/example-slice/attacks.mjs` once from the lab checkout. Exit 0, all built-in assertions passed, with this output:

```json
{
  "node": "v24.11.0",
  "kind": "synthetic-logical-witnesses",
  "discovery": {
    "base": {"exit": 0, "stdout": "missing", "missingModule": false},
    "fixed": {"exit": 0, "stdout": "ready", "missingModule": false},
    "changedExistingSource": [],
    "added": ["records/wanted.json"]
  },
  "helper": {
    "region": ["entry.mjs"],
    "base": {"exit": 0, "stdout": "unsupported", "missingModule": false},
    "boxBase": {"exit": 0, "stdout": "unsupported", "missingModule": false},
    "fixed": {"exit": 0, "stdout": "ready", "missingModule": false},
    "boxReferenceFix": {"exit": 1, "stdout": "", "missingModule": true},
    "necessaryForEveryRepair": false
  }
}
```

Predictions matched. The fixtures use fresh subprocesses and a temporary directory with guarded cleanup. No installs, external project execution, heavy jobs or spending occurred. These are two constructed witnesses with one run each, not independent sampled tasks; no spread or reliability estimate exists. This reviewer rerun is independent execution of the same specimens, not extra sampled evidence. Hand-written regions mean no actual slicer, import selector or packaging product was measured.

The base processes exit successfully. Their failure is the stipulated output predicate (`ready` wanted), not a failing test process. That is sufficient for the logical examples, but the recorded observations must not be described as defect-red test runs. A loader failure appears only for the boxed reference fix.

The discovery case refutes intersection only if data-file creation is a permitted repair and the region means existing code locations. A model that includes directory state, absent paths and creation permissions can represent it. Under the strongest interpretation, `readdirSync` reads the directory's name-set, so adding the record changes an influential state location already in the region; intersection then holds and this witness is no counterexample. It forces an explicit state/path model, not rejection of that model. It does not establish that every solution needs the new record.

The helper case proves that the specific import-based reference fix fails without the helper. It does not refute existence of an acceptable local repair: changing `wanted()` to return `ready` meets this fixture's entire stated oracle. Omitting a historical patch file is therefore not proof of task impossibility. The author explicitly records that limit; preserve it in subsequent scoring.

I also ran this cheap set-level attack, independently of the fixtures:

```js
const region = ['entry.mjs'];
const permittedRepairs = [['entry.mjs', 'helper.mjs']];
console.log({
  everyRepairIntersects: permittedRepairs.every(p => p.some(f => region.includes(f))),
  someRepairContained: permittedRepairs.some(p => p.every(f => region.includes(f)))
});
```

Observed `everyRepairIntersects: true`, `someRepairContained: false`. This is a logical countermodel to the inference, not evidence that these are the only possible software repairs. A separate inline evaluation of the local constant alternative printed `ready`.

## Primary-source rechecks

- **CONBAS:** reopened full publisher HTML, especially introduction, related work and definitions 4–6/Algorithm 1. Nonexecution is explicitly a dynamic-slicing fault-localisation problem. However, its potential edges connect executed condition/test nodes to later executed uses, using variables defined in the unexecuted branch. Algorithm 1 traverses the execution-trace graph; it does not simply add all skipped statements to the slice. The model omits arrays/pointers, and the introduction excludes exploration of alternative paths from the implemented core. Correct the survey's loose phrase about adding dependencies “from code” to state this distinction. This supports rejection of execution-only localisation, not a general future-repair theorem. [CONBAS](https://onlinelibrary.wiley.com/doi/10.1155/2012/628571).
- **WALA:** reopened official Slicer wiki. Its executable-slice caveat and dependence-option tradeoffs support the survey. A closure result requires extra work before an executable artifact is obtained. This says nothing by itself about whether a whole-file packaging implementation is executable. [WALA documentation](https://github.com/wala/WALA/wiki/Slicer).
- **Jelly:** reopened author PDF, abstract, evaluation and validity discussion. The stated 75.9% to 88.1% average recall on 36 projects matches, with dynamic references produced by test suites. These are call-edge measurements; neither repair coverage nor a success probability follows. Benchmark/tool generalisation is explicitly limited. [PLDI paper](https://www.cs.au.dk/~amoeller/papers/approx/paper.pdf).
- **PyCG:** reopened full HTML, III-C and V-C/Table IV. Five macro projects, manually generated reference graphs, 99.2% mean precision and 69.9% mean recall match. Unsupported code generation, built-in effects and unavailable source are explicit. The survey properly avoids cross-language rankings and Box probability estimates. [ICSE paper](https://arxiv.org/html/2103.00587).
- **Trailmark:** reopened official README and packet skill, including delegation/expansion steps. It documents bounded graph-informed patch proposals, excludes exploration-dominated and dynamic-dominated work, and limits workers to proposals. One focused replacement-packet expansion is explicitly permitted, and the bundled Claude agent receives startup context; only an external adapter can guarantee task-and-packet-only prompts. Thus neither strict isolation nor first-packet sufficiency is demonstrated. README's TypeScript dynamic mechanisms are best-effort. This is useful adjacent prior work, not a tested portable executable Box baseline. The author added the expansion/startup qualifications during review; I re-read the revised survey and they now match. [Skill](https://github.com/trailofbits/skills/blob/main/plugins/trailmark/skills/slicing-code-context/SKILL.md), [README](https://github.com/trailofbits/trailmark).

These key sources were accessible during this review. I did not independently reopen every foundation or newer abstract in the register; S1/S3/S5 access limitations and abstract-only S11/S14–S19 remain limits, not upgraded evidence. Published numerical evaluations were re-read, not reproduced.

## Corrections and missing comparisons

1. Make the CONBAS edge/statement distinction explicit. Do not conflate relevant slicing with including the code of every nonexecuted helper or branch.
2. Trailmark's one-expansion allowance and host-context qualification were initially missing and have now been corrected by the author; preserve them in later summaries.
3. The author filled attack-results during review; I checked that they match my rerun and distinguish output-oracle failure from successful process exit. The notebook results section remains pending and must record execution/review. The author also added S21 as a primary spectrum-ranking citation; I have not independently reopened S21. I leave author files untouched by assignment.
4. Keep “unconditional guarantee does not stand” explicitly scoped to the programme's unrestricted quantifier and the existing-code-only interpretation. The illustrations do not disprove a formal restricted repair theorem or an existential useful-package guarantee.
5. There is a relevant comparison missing from the proposed method menu: predicate-switching/implicit-dependence slicing, identified by CONBAS itself as an alternative to relevant slicing. Trace it to its primary paper before choosing a sophisticated localisation baseline. This review has not read that underlying paper, so effectiveness is not imported. Automated repair's fault-localisation plus restricted mutation-space framing also deserves explicit comparison during formulation; a repair-language restriction changes what can be guaranteed.

## Strongest surviving interpretation

For a fixed supported language and environment, a sound dependence model and a restricted repair language may establish that changing a specified failed observation requires changing at least one modelled influential location. This requires a counterfactual/semantic argument, including effects of changed predicates, edits outside the old executed path, inputs, directory state and harness restrictions; ordinary current-execution preservation is not that proof. Unsupported constructs must be accounted for rather than silently dropped.

A separate theorem or empirical trial must establish existence of an acceptable repair within permitted paths and sufficiency of build/runtime/reading context. Passing one example establishes only that example unless the request is defined to be exactly its complete oracle. The strongest useful product proposition still available is empirical coverage and isolated solver success for a predeclared class at a useful size; none is measured in this session.

Pstack principles read and applied: **Model the Domain** kept the four propositions and quantifiers separate; **Prove It Works** required the independent rerun and source reopens instead of accepting author summaries.

## Disposition after author corrections

7 October 2026. Re-read the revised CONBAS paragraph and survey Standing. The required CONBAS edge/statement correction is satisfied: it now identifies executed test-to-use edges, traversal of the execution-trace graph, and the limit on including skipped statements. Predicate-switching/implicit-dependence slicing is now named with its unread-primary-paper limit. Standing now confines rejection to unrestricted repairs and an existing-code-only region, explicitly preserves the state/directory-inclusive and restricted-repair alternatives, and retains unknown empirical outcomes. These wording corrections satisfy the review; the survey is reviewed and formulation may proceed. No selection guarantee or real-task replay result is approved. No examples were rerun and no additional sources were searched in this disposition.
