if command -v grep >/dev/null 2>&1; then grep() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py grep "$@"; }; export -f grep; fi
if command -v egrep >/dev/null 2>&1; then egrep() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py egrep "$@"; }; export -f egrep; fi
if command -v fgrep >/dev/null 2>&1; then fgrep() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py fgrep "$@"; }; export -f fgrep; fi
if command -v rg >/dev/null 2>&1; then rg() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py rg "$@"; }; export -f rg; fi
if command -v find >/dev/null 2>&1; then find() { PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py find "$@"; }; export -f find; fi
if command -v git >/dev/null 2>&1; then git() { if [ "$1" = "grep" ]; then shift; PYTHONCOERCECLOCALE=0 python -X utf8 /lab/capture.py git "$@"; else command git "$@"; fi; }; export -f git; fi
