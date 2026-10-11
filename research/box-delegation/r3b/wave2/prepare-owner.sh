#!/bin/sh
# Runs INSIDE a kitchen-r3b-tools container (reaches it on stdin), network on.
# Builds the owner repository for one replay case in the volume mounted at /src.
#   sh -s <base-sha> <fix-sha> <test-file> < prepare-owner.sh
# Expects /src/in/REQUEST.md and /src/in/cli.js (copied in with docker cp).
# Prints one "step exit=<n>" line per step; exit codes are each command's own.
set -u
base=$1; fix=$2; testfile=$3
step() { name=$1; shift; "$@"; code=$?; echo "STEP $name exit=$code"; [ $code -eq 0 ] || exit $code; }
export npm_config_cache=/src/npm-cache
export npm_config_update_notifier=false

step clone git clone --quiet https://github.com/tj/commander.js.git /src/repo
cd /src/repo
step checkout-base git checkout --quiet -b kitchen-r3b-owner "$base"
echo "TRACKED_FILES_AT_BASE $(git ls-tree -r --name-only "$base" | wc -l)"
echo "TRACKED_BYTES_AT_BASE $(git ls-tree -r -l "$base" | awk '{s+=$4} END {print s}')"
echo "GITATTRIBUTES: $(cat .gitattributes 2>/dev/null | tr '\n' ';')"
test ! -e REQUEST.md; echo "STEP request-name-free exit=$?"

step take-test git checkout "$fix" -- "$testfile"
step commit-test git -c user.name=requester -c user.email=requester@example.invalid commit --quiet -m "Add failing test for the reported behaviour"
echo "OWNER_TEST_COMMIT $(git rev-parse HEAD)"
git show --stat --format='%H%n%s' HEAD

step copy-request cp /src/in/REQUEST.md REQUEST.md
step add-request git add REQUEST.md
step commit-request git -c user.name=requester -c user.email=requester@example.invalid commit --quiet -m "Add the request text"
echo "OWNER_BASE_COMMIT $(git rev-parse HEAD)"
git show --stat --format='%H%n%s' HEAD
echo "STATUS: [$(git status --porcelain)]"

# Warm the npm cache from the committed lockfile, scripts disabled. The install itself is thrown away.
mkdir -p /src/warm && cp package.json package-lock.json /src/warm/ && cd /src/warm
step warm-npm-ci npm ci --ignore-scripts --no-audit --no-fund
rm -rf /src/warm

# The product: the built cli.js plus the packages it imports at run time.
mkdir -p /src/box-tool && cp /src/in/cli.js /src/box-tool/cli.js
echo "CLI_SHA256 $(sha256sum /src/box-tool/cli.js | cut -d' ' -f1)"
cd /src/box-tool
printf '{"name":"kitchen-r3b-box-tool","private":true,"type":"module"}\n' > package.json
step install-zod npm install zod@4.6.5 --ignore-scripts --no-audit --no-fund
echo "NODE $(node --version) NPM $(npm --version) GIT $(git --version)"
