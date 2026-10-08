for lab_search_name in grep egrep fgrep rg ag ack find; do
  eval "$lab_search_name() { python /lab/search.py $lab_search_name \"\$@\"; }"
  export -f "$lab_search_name"
done
git() {
  if [ "${1-}" = grep ]; then shift; python /lab/search.py git "$@";
  else command git "$@"; fi
}
export -f git