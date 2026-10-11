#!/bin/sh
# Host side (Git Bash): one `box verify` run of the product, inside a container, network off.
#   sh research/box-delegation/r3b/wave2/run-verify.sh <label> <submission path inside the volume>
# Uses the agreement of export attempt 6, the owner repository and the pristine Box, all in
# the kitchen-r3b-src volume. Writes evidence/wave2/verify-<label>.{stdout,stderr,meta} and
# returns the product's own exit code.
set -u
here=$(cd "$(dirname "$0")" && pwd)
label=$1; submission=$2
ev="$here/../evidence/wave2"
export MSYS_NO_PATHCONV=1
started=$(date -u +%FT%T.%3NZ)
docker run --rm -i --network none --memory 2g --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 --user node \
  -e TMPDIR=/src/tmp -e npm_config_cache=/src/npm-cache -e npm_config_offline=true -e npm_config_update_notifier=false \
  -v kitchen-r3b-src:/src --name "kitchen-r3b-verify-$label" kitchen-r3b-tools \
  node /src/box-tool/cli.js verify "$submission" --agreement /src/in/attempt-6/agreement.json --repo /src/repo --box /src/pristine/box-2615 \
  > "$ev/verify-$label.stdout" 2> "$ev/verify-$label.stderr"
code=$?
ended=$(date -u +%FT%T.%3NZ)
printf 'label=%s\nnetwork=none\nsubmission=%s\nstarted=%s\nended=%s\nexit=%s\n' "$label" "$submission" "$started" "$ended" "$code" > "$ev/verify-$label.meta"
cat "$ev/verify-$label.meta"
exit $code
