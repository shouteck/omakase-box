"""Compare the recorder with unwrapped native execution of the same recorded commands."""
import base64,collections,json,shlex
from common import HERE,ROOT,command,create,execute,write,ACTIVATE,idle
from prepare import make
ident='sphinx-doc__sphinx-10614';task,_=make(ident);image=json.loads((ROOT/'gate-1/image-digests.json').read_bytes())[ident]
corpus=json.loads((ROOT/'gate-3b/corpus.json').read_bytes());out=HERE/'raw/native-check-v2';out.mkdir(exist_ok=True)
rows=[]
for t in corpus['trajectories']:
 if t['task']!=ident or t.get('missing'):continue
 names=[];d=out/t['agent'];d.mkdir(exist_ok=True)
 try:
  a=d/'native';b=d/'recorded';a.mkdir(exist_ok=True);b.mkdir(exist_ok=True)
  n,_=create(image,task,a);names.append(n)
  w,_=create(image,task,b);names.append(w)
  for action in t['actions']:
   if not action['search_action']:continue
   idle();p=command(['docker','exec',n,'/bin/bash','-lc',ACTIVATE+'exec timeout -k 3 300 /bin/bash -c '+shlex.quote(action['command'])],timeout=330)
   q=execute(w,{'mode':'command','arm':'box','command':action['command']})
   assert q['added_bytes']==0 and q['all_records_preserved']
   same={'exit':p.returncode==q['exit'],'stdout':collections.Counter(p.stdout.splitlines(keepends=True))==collections.Counter(base64.b64decode(q['native_stdout_b64']).splitlines(keepends=True)),'stderr':p.stderr==base64.b64decode(q['native_stderr_b64'])}
   receipt={'agent':t['agent'],'step':action['step'],'command':action['command'],'native_exit':p.returncode,'native_stdout_b64':base64.b64encode(p.stdout).decode(),'native_stderr_b64':base64.b64encode(p.stderr).decode(),'recorded':q,'same':same}
   path=d/('%03d.json'%action['step']);write(path,receipt)
   rows.append({'agent':t['agent'],'step':action['step'],'same':same,'searches':len(q['queries']),'reordered':q['searches_reordered'],'receipt':str(path.relative_to(HERE))})
   assert all(same.values()),rows[-1]
 finally:
  for name in names:command(['docker','rm','-f',name])
write(HERE/'native-check.json',{'status':'pass','actions':rows,'count':len(rows),'searches':sum(r['searches'] for r in rows),'reordered':sum(r['reordered'] for r in rows)})
print('NATIVE_MEANING_PASS',len(rows),flush=True)
