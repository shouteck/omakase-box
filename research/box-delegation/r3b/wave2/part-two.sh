#!/bin/sh
# Runs INSIDE a kitchen-r3b-tools container (fed on stdin), network off, volume at /src.
#   sh -s <phase> < part-two.sh        phase: trees | suite-solver | suite-fix | negative-seal
# Each phase prints its own results; test exit codes are the test process's own.
set -u
base=ae60352af7d216595055ef744111788b97f7416b
fix=a9f06ddfe1a97c932579370a1b4e727f7fa511a7
owner=5841f7a4ac0b4a5eea364300b1f43775513b2dab
export npm_config_cache=/src/npm-cache npm_config_offline=true npm_config_update_notifier=false
phase=$1
cd /src/repo

case "$phase" in
trees)
  # Three trees for the probe and the comparison: owner base, owner base + solver, the fix commit.
  rm -rf /src/p2 && mkdir -p /src/p2
  git worktree prune
  git worktree add --quiet --detach /src/p2/owner-base "$owner"; echo "STEP worktree-owner-base exit=$?"
  git worktree add --quiet --detach /src/p2/solver "$owner"; echo "STEP worktree-solver exit=$?"
  git worktree add --quiet --detach /src/p2/fix "$fix"; echo "STEP worktree-fix exit=$?"
  git worktree add --quiet --detach /src/p2/fix-tests-solver-lib "$fix"; echo "STEP worktree-fix-tests exit=$?"
  # The solver's change, taken from the sealed submission (not from the solver's folder).
  node -e '
    const fs = require("fs");
    const s = JSON.parse(fs.readFileSync("/src/in/submission-2615/submission.json", "utf8"));
    for (const f of s.files) if (f.sha256 !== f.baselineSha256) {
      for (const tree of ["solver", "fix-tests-solver-lib"]) fs.writeFileSync("/src/p2/" + tree + "/" + f.owner, f.content);
      console.log("APPLIED " + f.owner);
    }'
  echo "STEP apply exit=$?"
  echo "=== SOLVER DIFF (owner base -> submission)"
  git -C /src/p2/solver diff
  echo "=== MAINTAINERS DIFF (base -> fix), lib only"
  git diff "$base" "$fix" -- lib
  echo "=== FILES THE FIX CHANGED"
  git diff --stat "$base" "$fix"
  echo "=== fix-tests-solver-lib differs from the fix commit in"
  git -C /src/p2/fix-tests-solver-lib status --porcelain
  echo "=== lib at owner base vs project base (expect no output)"
  git diff "$base" "$owner" -- lib index.js
  ;;
suite-solver|suite-fix)
  tree=/src/p2/fix-tests-solver-lib; [ "$phase" = suite-fix ] && tree=/src/p2/fix
  cd "$tree"
  echo "HEAD $(git rev-parse HEAD)"; echo "STATUS [$(git status --porcelain | tr '\n' ';')]"
  if [ ! -d node_modules ]; then npm ci --ignore-scripts --no-audit --no-fund; echo "STEP npm-ci exit=$?"; fi
  echo "TEST FILES $(git ls-files tests | grep -cE '\.test\.(js|cjs|mjs)$')"
  node --test > /src/p2/$phase.out 2>&1
  code=$?
  tail -12 /src/p2/$phase.out
  echo "STEP node-test exit=$code"
  exit $code
  ;;
negative-seal)
  rm -rf /src/p2/noop && mkdir -p /src/p2/noop && cp -a /src/pristine/box-2615 /src/p2/noop/box
  cd /src/p2/noop/box
  node box/submit.mjs
  echo "STEP seal exit=$?"
  ;;
*) echo "unknown phase"; exit 64 ;;
esac
