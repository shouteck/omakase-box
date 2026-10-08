"""Freeze actual search-containing actions; no project code or agents run."""
import hashlib,importlib.util,json,pathlib,re,shlex,sys
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parent
sys.path.insert(0,str(ROOT/'gate-2'));import measure
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def shell_only(command):
    # Remove here-document bodies, not shell commands after their terminator.
    out=[];end=None
    for line in command.splitlines():
        if end:
            if line.strip()==end:end=None
            continue
        out.append(line)
        m=re.search(r"<<-?\s*['\"]?([A-Za-z_][\w]*)['\"]?",line)
        if m:end=m.group(1)
    return '\n'.join(out)
def has_search(command):
    try:words=list(shlex.shlex(shell_only(command),posix=True,punctuation_chars=';&|()'))
    except ValueError:return bool(measure.SEARCH.search(shell_only(command)))
    names={'grep','egrep','fgrep','rg','ag','ack','find'};start=True;previous=None
    for w in words:
        if w and set(w)<=set(';&|()'):start=True;previous=None;continue
        if start and w in names:return True
        if previous=='git' and w=='grep':return True
        if start and ('=' in w and re.match(r'^\w+=',w)):continue
        previous=w;start=False
    return False

def collect():
    selections=read(ROOT/'gate-3/selection.json')['tasks'];receipts=read(ROOT/'gate-2/receipts.json');rows=[]
    for selection in selections:
        ident=selection['instance_id'];p=ROOT/'gate-3/records'/ident/'control-0/steps.json'
        steps=read(p);rows.append({'task':ident,'agent':'control','path':str(p.relative_to(ROOT)),'sha256':sha(p),'actions':[{'step':s['step'],'command':s['command'],'search_action':has_search(s['command'])} for s in steps]})
        for agent in receipts['agents']:
            p=ROOT/'gate-2/records'/agent/(ident+'.traj.json')
            if not p.exists():rows.append({'task':ident,'agent':agent,'missing':True});continue
            assert sha(p)==receipts['records'][agent][ident]['sha256']
            steps=measure.steps_of(read(p));rows.append({'task':ident,'agent':agent,'path':str(p.relative_to(ROOT)),'sha256':sha(p),'actions':[{'step':i+1,'command':s['command'],'search_action':has_search(s['command'])} for i,s in enumerate(steps)]})
    return {'selection_sha256':sha(ROOT/'gate-3/selection.json'),'trajectory_count':len(rows),'search_actions':sum(sum(s['search_action'] for s in r.get('actions',[])) for r in rows),'trajectories':rows}
if __name__=='__main__':
    result=collect();(HERE/'corpus.json').write_bytes(json.dumps(result,indent=2).encode());print(json.dumps({k:v for k,v in result.items() if k!='trajectories'}))