grep() { python /lab/capture.py grep "$@"; }
egrep() { python /lab/capture.py egrep "$@"; }
fgrep() { python /lab/capture.py fgrep "$@"; }
rg() { python /lab/capture.py rg "$@"; }
find() { python /lab/capture.py find "$@"; }
git() { if [ "$1" = "grep" ]; then shift; python /lab/capture.py git "$@"; else command git "$@"; fi; }
export -f grep egrep fgrep rg find git
