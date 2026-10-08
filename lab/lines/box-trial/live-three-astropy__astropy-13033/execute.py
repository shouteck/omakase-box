import base64,collections,json,os,pathlib,re,signal,subprocess,sys,time,uuid
from adapter import Evidence,present,parse_locations,relative_path,sha
request=json.load(sys.stdin);started=time.monotonic();os.chdir('/testbed')
log='/tmp/lab-silent-search-'+str(uuid.uuid4())+'.jsonl'
env=dict(os.environ,LAB_CAPTURE_LOG=log,BASH_ENV='/lab/shell.sh');env.pop('PYTHONCOERCECLOCALE',None)
p=subprocess.Popen(['/bin/bash','-c',request['command']],stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,env=env)
timed_out=False
try:out,err=p.communicate(timeout=min(300,max(1,request.get('timeout_seconds',300))))
except subprocess.TimeoutExpired:
 timed_out=True;os.killpg(p.pid,signal.SIGKILL);out,err=p.communicate()
queries=[json.loads(x) for x in pathlib.Path(log).read_text().splitlines()] if pathlib.Path(log).exists() else []
if pathlib.Path(log).exists():pathlib.Path(log).unlink()
data=json.loads(pathlib.Path('/lab/evidence.json').read_text());e=Evidence(data['sources'],data['trace'],data.get('valid',True),data.get('excluded',[]))
candidates={}
for qi,q in enumerate(queries):
 raw=base64.b64decode(q['stdout_b64']);args=q['args'];cwd=q['cwd']
 locations=parse_locations(raw,e,'/testbed',cwd)
 # Native single-file grep often omits the filename.
 explicit={relative_path(a,'/testbed',cwd) for a in args if not a.startswith('-')}
 explicit={a for a in explicit if a in e.sources}
 if not locations and len(explicit)==1:
  path=next(iter(explicit))
  for i,line in enumerate(raw.splitlines(keepends=True)):
   m=re.match(r'^(\d+)([:\-])(.*)$',line.decode('utf-8',errors='replace').rstrip('\r\n'))
   if m:locations.append({'ordinal':i,'path':path,'line':int(m.group(1)),'kind':'line','is_match':m.group(2)==':','source_sha256':e.digests[path]})
 for r in locations:
  try:
   actual=(pathlib.Path('/testbed')/r['path']).resolve();actual.relative_to(pathlib.Path('/testbed'))
   r['source_sha256']=sha(actual.read_bytes())
  except (OSError,ValueError):r['source_sha256']=None
 _,proof=present(raw,'grep' if q['tool']=='git' else q['tool'],args,e,locations,'/testbed',cwd)
 q['proof']=proof;q['native_sha256']=sha(raw)
 lines=raw.splitlines(keepends=True)
 for r in proof['locations']:
  if r.get('priority'):candidates.setdefault(lines[r['ordinal']],[]).append(dict(r,query=qi))
final=out.splitlines(keepends=True);by={}
for i,line in enumerate(final):
 rows=candidates.get(line,[])
 identities={(r['path'],r['line'],r.get('function_start')) for r in rows}
 if len(identities)==1:by[i]=rows[0]
# Context-bearing commands use the entire final output as one unit: safe fallback.
context=any(q['proof'].get('context') or q['proof'].get('format')=='pass-through' for q in queries)
order=list(range(len(final))) if context else sorted(range(len(final)),key=lambda i:i not in by)
ordered=b''.join(final[i] for i in order)
assert collections.Counter(final)==collections.Counter(ordered.splitlines(keepends=True)) and len(ordered)==len(out)
actual_order=order if request.get('arm')=='box' else list(range(len(final)))
shown=ordered if request.get('arm')=='box' else out
moved=[dict(by[i],ordinary_ordinal=i,shown_ordinal=j) for j,i in enumerate(actual_order) if i in by and j<i]
changed_queries=sorted({r['query'] for r in moved})
result={'stdout':shown.decode('utf-8',errors='replace'),'stderr':err.decode('utf-8',errors='replace'),'exit':p.returncode,'timed_out':timed_out,'seconds':time.monotonic()-started,
 'native_stdout_b64':base64.b64encode(out).decode(),'native_stderr_b64':base64.b64encode(err).decode(),'shown_stdout_b64':base64.b64encode(shown).decode(),
 'queries':queries,'order':actual_order,'moved_up':moved,'searches_reordered':len(changed_queries),'reordered_query_indices':changed_queries,'added_bytes':len(shown)-len(out),'all_records_preserved':True,'wrapper_sha256':sha(pathlib.Path(__file__).read_bytes()),'capture_sha256':sha(pathlib.Path('/lab/capture.py').read_bytes()),'adapter_sha256':sha(pathlib.Path('/lab/adapter.py').read_bytes())}
print(json.dumps(result))
