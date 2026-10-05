#!/bin/sh
set -u
cd /workspace/.d1-r4-reviewer-review-a689979b-attempt5
d=.review-a689979b-attempt5-rerun
mkdir -p "$d"
printf '%s\n' 'timeout 180 node node_modules/vitest/vitest.mjs run tests/box/verification/environment-readiness.test.ts tests/box/verification/relay-lifecycle.test.ts tests/box/auth/fixture-transport.test.ts --config scripts/vitest.config.mjs' > "$d/vitest-attempt5-rerun.command"
start=$(date +%s%N)
timeout 180 node node_modules/vitest/vitest.mjs run tests/box/verification/environment-readiness.test.ts tests/box/verification/relay-lifecycle.test.ts tests/box/auth/fixture-transport.test.ts --config scripts/vitest.config.mjs > "$d/vitest-attempt5-rerun.stdout" 2> "$d/vitest-attempt5-rerun.stderr" &
pid=$!
echo "$pid" > "$d/vitest-attempt5-rerun.pid"
sleep 1
pgid=''
if [ -r "/proc/$pid/stat" ]; then
  awk '{print $5}' "/proc/$pid/stat" > "$d/vitest-attempt5-rerun.pgid"
  pgid=$(cat "$d/vitest-attempt5-rerun.pgid")
fi
if [ -n "$pgid" ]; then
  for p in /proc/[0-9]*/stat; do
    n=${p#/proc/}; n=${n%/stat}
    g=$(awk '{print $5}' "$p" 2>/dev/null || true)
    [ "$g" = "$pgid" ] && echo "$n"
  done > "$d/vitest-attempt5-rerun.pids-live"
fi
wait "$pid"
code=$?
end=$(date +%s%N)
echo "$code" > "$d/vitest-attempt5-rerun.exit"
echo $((end-start)) > "$d/vitest-attempt5-rerun.duration-ns"
if [ -n "$pgid" ]; then
  for p in /proc/[0-9]*/stat; do
    n=${p#/proc/}; n=${n%/stat}
    g=$(awk '{print $5}' "$p" 2>/dev/null || true)
    [ "$g" = "$pgid" ] && echo "$n"
  done > "$d/vitest-attempt5-rerun.pids-after"
fi
exit "$code"