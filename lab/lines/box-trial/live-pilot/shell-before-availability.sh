grep() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py grep "$@"; }
egrep() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py egrep "$@"; }
fgrep() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py fgrep "$@"; }
rg() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py rg "$@"; }
find() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py find "$@"; }
git() { if [ "$1" = "grep" ]; then shift; PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py git "$@"; else command git "$@"; fi; }
export -f grep egrep fgrep rg find git
