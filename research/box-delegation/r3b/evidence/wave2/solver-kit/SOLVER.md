# How to work on this Box

You have this folder and nothing else. The Box is the `work/` folder. Start with `work/box.json` (read `outcome`, `editable`, `commands` and `submission.instructions`) and `work/REQUEST.md`.

## Rules

- Change only the files that `work/box.json` lists under `editable` (the files in `work/lib/`). Every other file in `work/` is read-only; sealing refuses if one of them has changed.
- Do not run the code on this machine directly. Use the wrapper below: it runs each step in a throwaway container that sees only `work/`.
- The deliverable is `work/submission.json`, written by the `submit` action.

## Commands (from Git Bash, in this folder)

    sh run.sh setup                          # install dependencies; needs the network; run once first
    sh run.sh check box-variadic-outcome     # the outcome check: fails now, must pass when you are done
    sh run.sh check box-options-guard        # the guard check: passes now, must still pass
    sh run.sh checks                         # both
    sh run.sh submit                         # seal your work into work/submission.json

Each prints `exit=<n>` as its last line; 0 means the step passed.

## Things to know

- The outcome check prints nothing: it only gives an exit code. The test it runs is `work/tests/options.variadic.test.js`, which you can read. `work/box.json` also records, under `baseChecks`, what that test printed before any change.
- The guard check prints one dot per passing test and details for any failure.
- Checks and `submit` run with no network.
- An empty `work/node_modules` folder appears on this machine after `setup`; the installed packages live inside the container side only. Leave it alone.
