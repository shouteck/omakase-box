#!/bin/sh
# Rerun one R3b case end to end. Host side: docker control commands only.
#   sh research/box-delegation/r3b/screen/rerun-case.sh <id> <base-sha> <fix-sha> <out.json>
# Creates image kitchen-r3b-tools and volume kitchen-r3b-src if absent; remove them when done:
#   docker volume rm kitchen-r3b-src && docker image rm kitchen-r3b-tools
# The per-run exit codes are inside <out.json> (.runs.*.exit), taken from each test process.
set -u
here=$(cd "$(dirname "$0")" && pwd)
id=$1; base=$2; fix=$3; out=$4
# Git Bash on Windows rewrites /src into a Windows path unless told not to; docker needs a native context path.
export MSYS_NO_PATHCONV=1
image_dir=$(cygpath -m "$here/../image" 2>/dev/null || echo "$here/../image")
docker image inspect kitchen-r3b-tools >/dev/null 2>&1 || docker build -q -t kitchen-r3b-tools "$image_dir" || exit 10
common="--rm -i --memory 2g --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 --user node -v kitchen-r3b-src:/src"
# Setup: network on, clone/fetch and npm ci --ignore-scripts from the committed lockfile.
docker run $common --name "kitchen-r3b-prepare-$id" kitchen-r3b-tools node - prepare "$base" "$fix" < "$here/screen.mjs" > "$out.prepare.json"
code=$?; [ $code -eq 0 ] || { echo "prepare exit=$code"; exit $code; }
# Tests: no network.
docker run $common --network none --name "kitchen-r3b-run-$id" kitchen-r3b-tools node - run "$id" "$base" "$fix" < "$here/screen.mjs" > "$out"
code=$?; echo "recording exit=$code"; exit $code
