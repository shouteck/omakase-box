#!/bin/sh
# Host side (Git Bash): one export attempt of the product, inside a container, network off.
#   sh research/box-delegation/r3b/wave2/run-export.sh <attempt-number> <agreement.json> [network]
# The agreement is copied into the volume with docker cp (no mount of this repository).
# Writes evidence/wave2/export-attempt-<n>.{stdout,stderr,meta} and prints the product's own exit code.
set -u
here=$(cd "$(dirname "$0")" && pwd)
n=$1; agreement=$2; network=${3:-none}
ev="$here/../evidence/wave2"
export MSYS_NO_PATHCONV=1
stage="${TEMP:-/tmp}/kitchen-r3b-agreement-$n"
rm -rf "$stage"; mkdir -p "$stage"; cp "$agreement" "$stage/agreement.json"
docker rm -f kitchen-r3b-cp >/dev/null 2>&1
docker create --name kitchen-r3b-cp -v kitchen-r3b-src:/src kitchen-r3b-tools true >/dev/null || exit 10
docker cp "$(cygpath -m "$stage")/." "kitchen-r3b-cp:/src/in/attempt-$n/" || exit 11
docker rm kitchen-r3b-cp >/dev/null
rm -rf "$stage"
started=$(date -u +%FT%T.%3NZ)
docker run --rm -i --network "$network" --memory 2g --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 --user node \
  -e TMPDIR=/src/tmp -e npm_config_cache=/src/npm-cache -e npm_config_offline=true -e npm_config_update_notifier=false \
  -v kitchen-r3b-src:/src --name "kitchen-r3b-export-$n" kitchen-r3b-tools \
  sh -c 'mkdir -p "/src/out/attempt-$1" /src/tmp && exec node /src/box-tool/cli.js export "/src/in/attempt-$1/agreement.json" --repo /src/repo --out "/src/out/attempt-$1/box"' sh "$n" \
  > "$ev/export-attempt-$n.stdout" 2> "$ev/export-attempt-$n.stderr"
code=$?
ended=$(date -u +%FT%T.%3NZ)
printf 'attempt=%s\nnetwork=%s\nstarted=%s\nended=%s\nexit=%s\nagreement_sha256=%s\n' "$n" "$network" "$started" "$ended" "$code" "$(sha256sum "$agreement" | cut -d' ' -f1)" > "$ev/export-attempt-$n.meta"
cat "$ev/export-attempt-$n.meta"
exit $code
