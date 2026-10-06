# A0 result: the neutral core, prototyped

Throwaway prototype. The code here is not product code and is not meant to be kept; the findings are.

Rerun everything: `node research/box-delegation/a0/run-all.mjs` (add `--details` for every command with its exit code and duration). Two consecutive runs on this machine printed byte-identical output.

Machine: Windows 10, Node 24.11.0, npm 11.6.1, pnpm 10.34.5 (the repository's pinned copy), Python 3.12.10, Git 2.45.1. No network was needed; every install command carried `--offline`.

## Answers

| Question | Answer | Evidence |
|---|---|---|
| Does the neutral loop work on an npm project? | **Yes** | `npm-single` rows 3 to 5: base valid, known-good edit `done`, do-nothing `not-done`. |
| On a Python project? | **Yes** | `python-plain`: same verdicts, with no setup command at all and no JavaScript in the slice. |
| On a multi-package repository under npm? | **Yes**, once the slice holds `a` and `b` | `multi-npm` (ii), (iii), (iv-b). |
| On a multi-package repository under pnpm? | **Yes**, once the slice holds `a` and `b` | `multi-pnpm` (ii), (iii), (iv-b). |
| What is the least a slice must contain to install? | The root dependency files unchanged, plus every workspace package the checks actually load, source included (`a` and `b`). Nothing of `c`, not even its `package.json`. | (ii) works on both managers; (i), (iv-a), (iv-c) do not. |
| Did anything require the core to know the package manager? | **No** for the loop. **Partly** for one thing that is about the operating system, not the package manager: how a declared program name becomes something that can be started without a shell. | `neutral-box.mjs` names no tool except `git apply`. See "Declaring commands". |

"Install" needs one correction before it is used as a criterion: **installing was never the thing that failed.** Both installers exit 0 on a slice that is missing a package the code needs. See finding 1.

## Result table

Each trial runs the loop twice in a fresh folder in the system temp directory: once applying the known-good patch, once applying nothing. Exit codes are the process exit status. `none` means no command was declared. `invalid-base` means the untouched slice did not give "setup 0, guard 0, outcome non-zero", so no verdict about a submission is allowed.

| fixture | candidate | setup exit | guard base | outcome base | after edit guard/outcome | edit verdict | do-nothing verdict | loop worked | files slice/fixture | bytes slice/fixture |
|---|---|---|---|---|---|---|---|---|---|---|
| npm-single | cmd-bare-npm | ENOENT | 0 | 1 | 0/0 | invalid-base | invalid-base | NO | 5/5 | 850/850 |
| npm-single | cmd-npm-dot-cmd | EINVAL | 0 | 1 | 0/0 | invalid-base | invalid-base | NO | 5/5 | 850/850 |
| npm-single | cmd-via-cmd-exe | 0 | 0 | 1 | 0/0 | done | not-done | YES | 5/5 | 850/850 |
| npm-single | cmd-node-plus-cli | 0 | 0 | 1 | 0/0 | done | not-done | YES | 5/5 | 850/850 |
| npm-single | no-setup | none | 0 | 1 | 0/0 | done | not-done | YES | 5/5 | 850/850 |
| python-plain | whole-package | none | 0 | 1 | 0/0 | done | not-done | YES | 4/5 | 569/640 |
| multi-npm | i-a-only | 0 | 1 | 1 | 1/1 | invalid-base | invalid-base | NO | 6/12 | 1651/2371 |
| multi-npm | ii-a-b | 0 | 0 | 1 | 0/0 | done | not-done | YES | 8/12 | 1840/2371 |
| multi-npm | iii-a-b-cmanifest | 0 | 0 | 1 | 0/0 | done | not-done | YES | 9/12 | 1954/2371 |
| multi-npm | iv-a-no-install | none | 1 | 1 | 1/1 | invalid-base | invalid-base | NO | 6/12 | 962/2371 |
| multi-npm | iv-b-no-lockfile-loose-install | 0 | 0 | 1 | 0/0 | done | not-done | YES | 7/12 | 1068/2371 |
| multi-npm | iv-c-b-manifest-only | 0 | 1 | 1 | 1/1 | invalid-base | invalid-base | NO | 7/12 | 1765/2371 |
| multi-pnpm | i-a-only | 0 | 1 | 1 | 1/1 | invalid-base | invalid-base | NO | 7/13 | 1128/1848 |
| multi-pnpm | ii-a-b | 0 | 0 | 1 | 0/0 | done | not-done | YES | 9/13 | 1317/1848 |
| multi-pnpm | iii-a-b-cmanifest | 0 | 0 | 1 | 0/0 | done | not-done | YES | 10/13 | 1431/1848 |
| multi-pnpm | iv-a-no-install | none | 1 | 1 | 1/1 | invalid-base | invalid-base | NO | 6/13 | 968/1848 |
| multi-pnpm | iv-b-no-lockfile-loose-install | 0 | 0 | 1 | 0/0 | done | not-done | YES | 8/13 | 1061/1848 |
| multi-pnpm | iv-c-b-manifest-only | 0 | 1 | 1 | 1/1 | invalid-base | invalid-base | NO | 8/13 | 1242/1848 |

**10 of 18 trials worked.** The 8 that did not are all recorded below; none was repaired by changing `neutral-box.mjs`.

Counting by fixture rather than by trial: on all four fixture variants (npm-single, python-plain, multi-npm, multi-pnpm) at least one honest declaration made the loop work, and in every trial where the base was valid the do-nothing submission was reported `not-done` and the known-good edit `done` (10 of 10).

Fixture totals count every file in the fixture folder (lockfile included, the patch file beside it excluded). `python-plain` ships 4 of 5 files because `README.md` is not needed.

## Findings

### 1. An installer's exit code does not prove the slice. Only the checks do.

Candidate (i), `a` without `b`, on both managers: the frozen install exits 0.

- npm: `npm ci` printed `added 2 packages` and created `node_modules/@fx/b` as a link to `packages/b`, a folder that does not exist.
- pnpm: `pnpm install --frozen-lockfile` printed `Scope: all 2 workspace projects`, `Lockfile is up to date, resolution step is skipped`, and created `packages/a/node_modules/@fx/b` as a link to the same missing folder. The committed lockfile lists four importers; pnpm did not object to two being absent.

(The dangling links were seen in a by-hand probe of the same slice in a temp folder; the trial rows record the exit codes.)

The gap only showed when the guard ran:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@fx/b' imported from ...\kitchen-A0-multi-npm-i-a-only-edit\packages\a\src\index.js
```

Candidate (iv-c), `b`'s `package.json` without its source, is the same story one step later: install 0, link valid, guard fails with

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\node_modules\@fx\b\src\index.js' imported from ...\packages\a\src\index.js
```

So A2's rule "export proves the list by running the checks in a clean folder" is the right one and the only one. "Setup exited 0" must never be reported as proof of a complete slice. The error names the missing package, not the missing files, so a neutral core can only pass the check's own output to the owner; turning it into a file suggestion is helper territory.

### 2. An unrelated workspace package can be left out entirely.

Candidate (ii) has nothing of `c`: no source, no `package.json`. The root files still say `packages/*` and both lockfiles still list `packages/c`. Both frozen installs exit 0 and all checks behave. Candidate (iii), adding `c`'s `package.json`, changes nothing except 114 more bytes. So (iii) is not needed, on either manager, for this fixture.

### 3. Less than (ii) is possible only by giving up the lockfile.

- (iv-a) `a` and `b` with no root files and no install: fails. The link that lets `a` find `@fx/b` by name is created by the install. Guard: `Cannot find package '@fx/b'`.
- (iv-b) `a`, `b`, root `package.json` (and `pnpm-workspace.yaml`), **no lockfile**, with a non-frozen install (`npm install` / `pnpm install --no-frozen-lockfile`): works, and is the smallest working slice (1068 of 2371 bytes on npm, 1061 of 1848 on pnpm). But the install writes a new lockfile inside the Box, and with third-party dependencies it would resolve versions afresh. It contradicts "the project's own dependency files travel unchanged" and is only safe here because there are no third-party dependencies. Recorded, not recommended.
- Without the lockfile the frozen commands refuse, as they should: `npm error code EUSAGE ... The npm ci command can only install with an existing package-lock.json` and `ERR_PNPM_NO_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is absent` (by-hand probe, not a table row).

Least working slice that respects the lockfile: **(ii)**.

### 4. Declaring commands: the one place something beyond "files, commands, exit codes" was needed.

The core starts programs from an argument array with no shell. On Windows `npm` is `npm.cmd`, and:

- declared program `npm`: `ENOENT: spawnSync npm ENOENT`
- declared program `npm.cmd`: `EINVAL: spawnSync npm.cmd EINVAL` (Node refuses to start `.cmd` files without a shell)
- declared program `cmd.exe` with arguments `/d /s /c npm ci ...`: works. The owner has declared a shell explicitly; the declaration is now Windows-only.
- declared program `node` with npm's script path as first argument: works. The path (`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`) is specific to this machine, so the declaration cannot travel to a recipient as written. `run-all.mjs`, playing the owner, computes that path; `neutral-box.mjs` never sees the word npm.

None of this is knowledge of a package manager. It is knowledge of how an operating system finds and starts a program, and A1 has to decide it: either the agreement names bare programs (`npm`, `python`) and the core has one rule for resolving a name on each platform, including what it does with a `.cmd` shim, or the agreement carries machine-specific paths and is rewritten per machine. The first is the only one that lets the same agreement run on the owner's and the recipient's machines.

Also awkward in the same way, seen but not failing here: `python` resolves to 3.12 on this machine, where 3.9 and the Windows Store alias are also on the PATH, and on many Linux machines the program is `python3`.

In the two failing npm-single rows the checks themselves still ran green/red correctly (the package has no dependencies), but the loop reports `invalid-base` because a declared setup command did not exit 0. A command that never started is not counted as a red check.

### 5. A project may need no setup at all, and the format must allow that.

`python-plain` and `npm-single` (row `no-setup`) both work with an empty setup list. For npm-single the install is a no-op; the lockfile travelled but nothing read it.

### 6. Same content, two managers, is not quite the same bytes.

`packages/a/package.json` says `"@fx/b": "1.0.0"` in the npm variant and `"@fx/b": "workspace:*"` in the pnpm variant: npm does not understand `workspace:`, and pnpm 10 does not link a workspace package from a plain version unless configured to. Every other source file is identical and one patch serves both. This did not touch the core.

## What the owner had to declare

A declaration is: the files, the setup commands, the checks with a role each. Nothing else was needed. Tool script paths are shown as `<npm-cli>` and `<pnpm-cli>`; in the runs they were absolute paths on this machine (finding 4).

### npm-single

```json
{
  "files": ["package.json", "package-lock.json", "src/slug.js", "test/guard.test.js", "test/outcome.test.js"],
  "setup": [
    { "program": "node", "args": ["<npm-cli>", "ci", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"], "cwd": "." }
  ],
  "checks": [
    { "name": "guard", "role": "guard", "program": "node", "args": ["--test", "test/guard.test.js"], "cwd": "." },
    { "name": "outcome", "role": "outcome", "program": "node", "args": ["--test", "test/outcome.test.js"], "cwd": "." }
  ]
}
```

Known-good edit: `fixtures/npm-single.known-good.patch`.

### python-plain

```json
{
  "files": ["textstats/__init__.py", "tests/__init__.py", "tests/test_guard.py", "tests/test_outcome.py"],
  "setup": [],
  "checks": [
    { "name": "guard", "role": "guard", "program": "python", "args": ["-m", "unittest", "tests.test_guard"], "cwd": "." },
    { "name": "outcome", "role": "outcome", "program": "python", "args": ["-m", "unittest", "tests.test_outcome"], "cwd": "." }
  ]
}
```

Known-good edit: `fixtures/python-plain.known-good.patch`.

### multi-package, npm variant, candidate (ii)

```json
{
  "files": [
    "package.json", "package-lock.json",
    "packages/a/package.json", "packages/a/src/index.js", "packages/a/test/guard.test.js", "packages/a/test/outcome.test.js",
    "packages/b/package.json", "packages/b/src/index.js"
  ],
  "setup": [
    { "program": "node", "args": ["<npm-cli>", "ci", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"], "cwd": "." }
  ],
  "checks": [
    { "name": "guard", "role": "guard", "program": "node", "args": ["--test", "test/guard.test.js"], "cwd": "packages/a" },
    { "name": "outcome", "role": "outcome", "program": "node", "args": ["--test", "test/outcome.test.js"], "cwd": "packages/a" }
  ]
}
```

### multi-package, pnpm variant, candidate (ii)

```json
{
  "files": [
    "package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml",
    "packages/a/package.json", "packages/a/src/index.js", "packages/a/test/guard.test.js", "packages/a/test/outcome.test.js",
    "packages/b/package.json", "packages/b/src/index.js"
  ],
  "setup": [
    { "program": "node", "args": ["<pnpm-cli>", "install", "--frozen-lockfile", "--ignore-scripts", "--offline"], "cwd": "." }
  ],
  "checks": [
    { "name": "guard", "role": "guard", "program": "node", "args": ["--test", "test/guard.test.js"], "cwd": "packages/a" },
    { "name": "outcome", "role": "outcome", "program": "node", "args": ["--test", "test/outcome.test.js"], "cwd": "packages/a" }
  ]
}
```

Known-good edit for both variants: `fixtures/multi-package/known-good.patch`.

### The other multi-package candidates, as differences from (ii)

| Candidate | Files | Setup |
|---|---|---|
| (i) | (ii) without the two `packages/b` files | as (ii) |
| (iii) | (ii) plus `packages/c/package.json` | as (ii) |
| (iv-a) | (ii) without the root files | none |
| (iv-b) | (ii) without the lockfile | `npm install --ignore-scripts --offline --no-audit --no-fund` / `pnpm install --no-frozen-lockfile --ignore-scripts --offline`, through `node` and the tool script as above |
| (iv-c) | (ii) without `packages/b/src/index.js` | as (ii) |

Excluded from every multi-package slice: `packages/b/test/b.test.js`, all of `packages/c` source and tests.

What was awkward to declare: the program for npm and pnpm (finding 4); knowing that `b` has to be listed, which nothing told the owner until the guard failed (finding 1); and the per-check working directory, which the format must carry because the tests of `a` run from `packages/a`.

## What this means for A1 to A4

- **A1 stands, with one addition.** The format needs files, setup commands, checks with roles, a working directory per command, and an empty setup list must be legal. It must also settle how a declared program name is resolved and started on each platform (finding 4). That rule belongs in the core and is not package-manager knowledge.
- **A2 stands.** The owner's list is proven by guard green and outcome red in a clean folder. Setup exit 0 alone is never proof (finding 1). Root dependency files can travel unchanged while workspace members are missing (finding 2), on both managers, for this fixture.
- **A3 stands.** The core needed no package-manager knowledge in any trial.
- **A4 looks reachable.** npm and plain Python both ran the whole loop here in miniature.

## Limits

- Every fixture has zero third-party dependencies. Nothing here says how a cut-down workspace behaves when the lockfile carries registry packages for the members that were left out, or how either installer behaves when it needs its cache or the network. That is the largest untested gap.
- One machine, Windows only, one version of each tool. The claim that a missing workspace member does not fail a frozen install is observed for npm 11.6.1 and pnpm 10.34.5 and nothing else.
- Each trial was run as two loops (edit, nothing), and the whole set was rerun several times with the same verdicts; that is repeatability on one machine, not spread.
- The "recipient" is the script applying a known patch. No blind recipient, no agent, no owner-side verify in the original repository.
- The patch is applied with `git apply`, so the core as prototyped needs Git on the machine.
- The loop inherits the whole environment and PATH of the process that starts it. Nothing was isolated.
- Not checked: what setup and checks leave behind in the Box folder (`node_modules`, a new lockfile in (iv-b), Python bytecode folders) and how a submit step would keep that out of a patch.
- Python with dependencies (a virtual environment, `pip`) was not tried; it would need the network or a wheel cache.
- npm writes its own run logs under the user's npm cache folder on every invocation. Those were left alone; they are npm's, not the kitchen's.
