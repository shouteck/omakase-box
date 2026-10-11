#!/bin/sh
# Read-only GitHub query with a command log. Every gh call in wave R3b-2 goes through here.
#   sh research/box-delegation/r3b/wave2/gh-get.sh <out-file> <api-path> [--paginate]
# It runs `gh api <api-path>` with no -X, -f, -F or --input, so the method is always GET,
# and appends the time, the exact command and gh's own exit code to the log.
set -u
here=$(cd "$(dirname "$0")" && pwd)
log="$here/../evidence/wave2/gh-commands.log"
out=$1; path=$2; extra=${3:-}
case "$path" in repos/tj/commander.js/*) ;; *) echo "refused: path outside the project" >&2; exit 64;; esac
case "$extra" in ""|--paginate) ;; *) echo "refused: only --paginate is allowed" >&2; exit 64;; esac
mkdir -p "$(dirname "$log")" "$(dirname "$out")"
started=$(date -u +%FT%TZ)
gh api $extra "$path" > "$out"
code=$?
printf '%s\tgh api %s%s\texit=%s\t-> %s\n' "$started" "${extra:+$extra }" "$path" "$code" "$(basename "$out")" >> "$log"
echo "gh exit=$code"
exit $code
