#!/bin/sh
# Wrapper for the Box in ./work. Call from Git Bash:  sh run.sh <action>
#   setup            install the dependencies (network on, install scripts disabled)
#   check <name>     run one declared check: box-variadic-outcome | box-options-guard
#   checks           run both declared checks
#   submit           seal the work: writes work/submission.json
# Every action runs in a throwaway container that sees only ./work. Checks and submit
# have no network. The last line printed is "exit=<n>", the command's own exit code,
# and the script returns the same number.
set -u
here=$(cd "$(dirname "$0")" && pwd)
export MSYS_NO_PATHCONV=1
work=$(cygpath -m "$here/work" 2>/dev/null || echo "$here/work")
volume=${R3B_NM_VOLUME:-kitchen-r3b-nm-2615}
limits="--rm -i --memory 2g --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 --user node"
mounts="-v $work:/work -v $volume:/work/node_modules -w /work"
action=${1:-}
case "$action" in
  setup)
    docker run $limits $mounts kitchen-r3b-tools npm ci --ignore-scripts --no-audit --no-fund
    code=$? ;;
  check)
    name=${2:-}
    [ -n "$name" ] || { echo "usage: sh run.sh check <box-variadic-outcome|box-options-guard>"; echo "exit=64"; exit 64; }
    docker run $limits --network none $mounts kitchen-r3b-tools node - "$name" < "$here/run-check.mjs"
    code=$? ;;
  checks)
    docker run $limits --network none $mounts kitchen-r3b-tools node - --all < "$here/run-check.mjs"
    code=$? ;;
  submit)
    docker run $limits --network none $mounts kitchen-r3b-tools node box/submit.mjs
    code=$? ;;
  *)
    echo "usage: sh run.sh setup | check <name> | checks | submit"
    code=64 ;;
esac
echo "exit=$code"
exit $code
