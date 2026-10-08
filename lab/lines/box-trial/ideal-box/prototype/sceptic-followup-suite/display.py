"""Final command completion hook; no change to native pipeline computation."""
import pathlib, subprocess
from adapter import present,parse_locations,sha
def complete(argv,cwd,evidence,tool='rg',search_args=None,marks=False,input=None,root=None):
    p=subprocess.run(argv,cwd=cwd,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    repo=pathlib.Path(root or cwd).resolve()
    locations=parse_locations(p.stdout,evidence,repo,cwd)
    digests={}
    for r in locations:
        path=r['path']
        if path not in digests:
            try:
                target=(repo/path).resolve();target.relative_to(repo)
                digests[path]=sha(target.read_bytes())
            except (OSError,ValueError):digests[path]=None
        r['source_sha256']=digests[path]
    shown,proof=present(p.stdout,tool,search_args if search_args is not None else argv[1:],evidence,locations,repo,cwd)
    if not marks:
        lines=p.stdout.splitlines(keepends=True)
        shown=b''.join(lines[i] for i in proof['order'])
    return {'exit':p.returncode,'stderr':p.stderr,'native':p.stdout,'shown':shown,'proof':proof,'added_bytes':len(shown)-len(p.stdout),'marks_enabled':marks}
