"""Zero-agent failing-trace and real-command wrapper checks, after harness pass."""
import base64,collections,gzip,json,pathlib,re,shlex,sys
from common import HERE,ROOT,command,create,execute,idle,write,ACTIVATE
from prepare import make
ident='sphinx-doc__sphinx-10614'
assert json.loads((HERE/'harness.json').read_bytes())['status']=='pass'
image=json.loads((ROOT/'gate-1/image-digests.json').read_bytes())[ident];task,_=make(ident)
out=HERE/'raw/box-check-v2';out.mkdir(parents=True,exist_ok=True)
name=None;record={'task':ident,'status':'started','actions':[]}
try:
 d=out/'trace';d.mkdir(exist_ok=True);name,args=create(image,task,d)
 tracecmd=shlex.join(['python','/lab/container.py','--child','trace','/tmp/lab-pilot.trace.json']+task['failing_argv'])
 r=execute(name,{'mode':'command','command':tracecmd});write(d/'result.json',r)
 assert r['exit']==1 and not r['timed_out'],r
 p=command(['docker','exec',name,'cat','/tmp/lab-pilot.trace.json']);assert p.returncode==0
 (d/'failing.trace.json').write_bytes(p.stdout);trace=json.loads(p.stdout)
 source=json.loads(gzip.decompress((ROOT/'gate-1/records'/ident/'sources.json.gz').read_bytes()))
 excluded=re.findall(r'^\+\+\+ b/(.+)$',task['test_patch'],re.M)
 evidence={'sources':source,'trace':trace,'valid':True,'excluded':excluded}
 (HERE/'evidence.json').write_bytes(json.dumps(evidence).encode())
 record['trace_keys']=len(trace);record['excluded']=excluded
 command(['docker','rm','-f',name]);name=None
 corpus=json.loads((ROOT/'gate-3b/corpus.json').read_bytes())
 trajectories=[t for t in corpus['trajectories'] if t['task']==ident and not t.get('missing')]
 for trajectory in trajectories:
  agent=trajectory['agent'];d=out/agent;d.mkdir(exist_ok=True)
  name,args=create(image,task,d)
  for action in trajectory['actions']:
   if not action['search_action']:continue
   text=action['command']
   # Replay exact search-containing command, never introduce a new command spelling.
   ordinary=execute(name,{'mode':'command','command':text,'arm':'control'})
   boxed=execute(name,{'mode':'command','command':text,'arm':'box'})
   raw=base64.b64decode(boxed['native_stdout_b64']);shown=base64.b64decode(boxed['shown_stdout_b64'])
   assert collections.Counter(raw.splitlines(keepends=True))==collections.Counter(shown.splitlines(keepends=True))
   assert boxed['added_bytes']==0 and boxed['all_records_preserved']
   row={'agent':agent,'step':action['step'],'command':text,'ordinary':ordinary,'box':boxed}
   file=d/('%03d.json'%action['step']);write(file,row)
   record['actions'].append({'agent':agent,'step':action['step'],'receipt':str(file.relative_to(HERE)),'searches':len(boxed['queries']),
    'reordered':boxed['searches_reordered'],'exit':boxed['exit'],'ordinary_exit':ordinary['exit'],'native_error':boxed['exit']!=0,
    'same_exit':boxed['exit']==ordinary['exit'],'same_native_records':collections.Counter(base64.b64decode(ordinary['native_stdout_b64']).splitlines(keepends=True))==collections.Counter(raw.splitlines(keepends=True))})
   print(agent,action['step'],'searches',len(boxed['queries']),'reordered',boxed['searches_reordered'],flush=True)
  command(['docker','rm','-f',name]);name=None
 record['searches']=sum(a['searches'] for a in record['actions'])
 record['reordered']=sum(a['reordered'] for a in record['actions'])
 assert record['reordered']>0,'No real recorded command changed order'
 assert all(a['same_exit'] for a in record['actions']),'Instrument comparison exit differs'
 record['status']='pass'
finally:
 if name:record['cleanup_exit']=command(['docker','rm','-f',name]).returncode
 write(HERE/'box-check.json',record)
print(json.dumps({k:v for k,v in record.items() if k!='actions'}))
