# Logical attacks registered before execution

7 October 2026. Hypothesis under attack: a region consisting of existing code reached by a failing example necessarily contains what future repairs need. These are two purpose-written witnesses, no random sample, no held-out data, no language-wide rate. Node built-ins only; no paid services or third-party execution.

Run from the lab checkout: `node lab/lines/example-slice/attacks.mjs`. It creates only a uniquely named `lab-a-attacks-` temp directory, checks its resolved path before recursive cleanup, runs each base/fix in fresh child processes, and removes the directory in a finally block. It prints JSON. Regions are explicit hand-derived fixture sets, not measured output from a slicer.

## Predictions

1. **New discovered file:** base discovers a folder without the requested JSON record and prints `missing`; adding only that record prints `ready`. None of the existing source files changes. This refutes unrestricted repair-intersection with an existing-code-only region. If it does not run this way, that witness fails. A model including directory state or permission to create files may cover it; no claim against such a model.
2. **Previously unused helper:** base exports an early unsupported response; an existing helper is unimported. The fixed entry imports the helper and gives the expected result. Entry is in the region, helper outside it. Shipping the base region reproduces the same failure; applying the reference fix to it fails to load. This illustrates intersection without workspace sufficiency for that particular patch. It does not prove all solutions require the helper: a local implementation is an alternative.

An unexpected observation is investigated before interpreting either witness. Single deterministic executions suffice to exhibit these particular logical possibilities, not reliability or real-world frequency. A fresh sceptic reruns both and may add attacks.

## Results

Author run: Node v24.11.0, Windows/Codex, 7 October 2026. Command exited 0; every registered assertion passed. The behavioural expectation in both witnesses is output `ready`; `missing` and `unsupported` violate it. The program exits are recorded separately from that output oracle (both base programs exit 0).

| Witness | Full base | Full fixed | Box base | Reference fix in Box |
|---|---|---|---|---|
| New discovered file | exit 0, `missing` | exit 0, `ready`, only `records/wanted.json` added | Not run; witness concerns existing-source intersection | Not run |
| Previously unused helper | exit 0, `unsupported` | exit 0, `ready` | exit 0, `unsupported` | exit 1, `ERR_MODULE_NOT_FOUND` |

Both predictions occurred. No existing source edit was needed in witness 1. Witness 2 preserved the base observation while lacking the helper needed by the reference patch. The outputs establish these possibilities only. Temp cleanup completed through the runner's finally block.

Fresh sceptic reran the command once on the same Node version and matched every observation; [report](sceptic-survey.md). It additionally demonstrated the set-level distinction between every repair intersecting a region and a repair being contained in it, and confirmed the helper's local constant alternative. Its strongest surviving interpretation: directory name-set is influential state, so witness 1 is not a refutation of a state-inclusive region. These reruns are not additional sampled tasks.
