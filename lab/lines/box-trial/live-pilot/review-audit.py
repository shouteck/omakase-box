"""Independent saved-record audit. Does not run repair agents or alter original receipts."""
import base64,collections,hashlib,json,pathlib,sys,subprocess,uuid
HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from common import visible,production_patch,create,execute,command
from prepare import make
from adapter import Evidence,present,parse_locations
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_bytes())
review=HERE/'raw/review';review.mkdir(exist_ok=True)
report={'reviewed_commit':'aeb977e07e6e6dfbc8ace85c25509ca9e706772e','manifests':{},'runs':{},'attacks':{}}
for filename in ['manifest.json','pre-agent-manifest.json']:
 m=read(HERE/filename)
 for name,entry in m['files'].items():
  b=(HERE/name).read_bytes();assert sha(b)==entry['sha256'] and len(b)==entry['bytes'],name
 for k,name in [('evidence_sha256','evidence.json'),('summary_sha256','summary.json'),('launch_lock_sha256','launch-lock.json'),('native_check_sha256','native-check.json'),('harness_sha256','harness.json')]:
  if k in m:assert sha((HERE/name).read_bytes())==m[k],name
 report['manifests'][filename]=len(m['files'])
lock=read(HERE/'launch-lock.json')
for name,h in lock['files'].items():assert sha((HERE/name).read_bytes())==h,name
report['launch_lock']=lock['commit']
# Prove the freeze is in the fetched remote history and every source file matches its locked Git blob.
repo=HERE.parents[3];git=['git','-c','safe.directory='+str(repo).replace('\\','/')]
assert command(git+['merge-base','--is-ancestor',lock['commit'],'origin/lab']).returncode==0
for name,h in lock['files'].items():
 if name=='evidence.json':continue # scientifically source-bearing ignored artifact, manifest-locked
 rel=(HERE/name).resolve().relative_to(repo).as_posix()
 r=command(git+['show',lock['commit']+':'+rel]);assert r.returncode==0 and sha(r.stdout)==h,rel
# Verify safeguard arithmetic from the preserved receipts, independently of the prose.
harness=read(HERE/'harness.json');native_check=read(HERE/'native-check.json')
assert harness['status']=='pass' and native_check['status']=='pass'
assert [(s['label'],s['evaluation']['solved']) for s in harness['stages']]==[('real-fix',True),('empty',False),('broken-guard',False)]
for action in native_check['actions']:
 receipt=read(HERE/action['receipt']);r=receipt['recorded']
 assert receipt['native_exit']==r['exit']
 assert receipt['native_stdout_b64']==r['native_stdout_b64'] and receipt['native_stderr_b64']==r['native_stderr_b64']
 assert collections.Counter(base64.b64decode(r['native_stdout_b64']).splitlines(keepends=True))==collections.Counter(base64.b64decode(r['shown_stdout_b64']).splitlines(keepends=True))
report['pre_agent_receipts']={'native_commands':len(native_check['actions']),'captured_searches':sum(a['searches'] for a in native_check['actions']),'reorders':sum(a['reordered'] for a in native_check['actions']),'gold_empty_broken_guard':True}
for arm in ['control','box']:
 d=HERE/'raw/runs'/arm;a=read(d/'attempt.json');steps=read(d/'steps.json');events=read(d/'model-events.json')
 for n,h in a['artifacts'].items():assert sha((d/n).read_bytes())==h,n
 settings=[v['params']['threadSettings'] for v in events if v.get('method')=='thread/settings/updated'];assert len(settings)==1 and settings[0]['effort']=='low' and settings[0]['model']=='gpt-5.6-luna'
 users=[v['params']['item'] for v in events if v.get('method')=='item/completed' and v['params']['item']['type']=='userMessage'];assert len(users)==1 and users[0]['content'][0]['text'].encode()==(HERE/'prompt.txt').read_bytes()
 tools=[v['params']['item'] for v in events if v.get('method')=='item/completed' and v['params']['item']['type']=='dynamicToolCall'];assert len(tools)==len(steps)
 usage=[v['params']['tokenUsage'] for v in events if v.get('method')=='thread/tokenUsage/updated'];assert usage[-1]==a['token_usage'];assert all(x['total']['totalTokens']<=400000 for x in usage)
 assert not any(v.get('method') in ['model/rerouted','error'] for v in events)
 changed=[];truncated=[]
 for s,item in zip(steps,tools):
  r=s['result'];assert item['arguments']['command']==s['command'] and item['tool']=='run_command' and item['status']=='completed'
  assert item['contentItems']==[{'type':'inputText','text':visible(r)}] and item['success'] is True
  raw=base64.b64decode(r['native_stdout_b64']);shown=base64.b64decode(r['shown_stdout_b64'])
  assert collections.Counter(raw.splitlines(keepends=True))==collections.Counter(shown.splitlines(keepends=True)) and len(raw)==len(shown) and r['added_bytes']==0
  assert r['stdout']==shown.decode('utf-8',errors='replace') and r['stderr']==base64.b64decode(r['native_stderr_b64']).decode('utf-8',errors='replace')
  for filename,key in [('execute.py','wrapper_sha256'),('capture.py','capture_sha256'),('adapter.py','adapter_sha256')]:assert r[key]==lock['files'][filename]
  if raw!=shown:changed.append(s['step'])
  if '[output truncated at' in visible(r):truncated.append(s['step'])
 assert production_patch((d/'all.patch').read_text(encoding='utf-8'))==(d/'candidate.patch').read_text(encoding='utf-8')
 assert (d/'candidate.patch').read_bytes()==(review/arm/'candidate.patch').read_bytes()
 result=read(review/arm/'evaluation.json');assert result['status']=='scored' and result['solved'] is False and result['phases']['guards']['matched_passes']==5 and result['cleanup_exit']==0
 report['runs'][arm]={'events':len(events),'steps':len(steps),'searches':sum(len(s['result']['queries']) for s in steps),'changed_display_steps':changed,'truncated_steps':truncated,'reported_tokens':usage[-1]['total']['totalTokens'],'candidate_sha256':sha((d/'candidate.patch').read_bytes()),'evaluation_reproduced':True}
 report['runs'][arm]['settings']=settings[0]
# Exact definition and source tests, using the actual native query's four records.
data=read(HERE/'evidence.json');e=Evidence(data['sources'],data['trace'],data['valid'],data['excluded']);s=read(HERE/'raw/runs/box/steps.json')[4];q=s['result']['queries'][0];raw=base64.b64decode(q['stdout_b64']);loc=parse_locations(raw,e,'/testbed',q['cwd']);_,proof=present(raw,q['tool'],q['args'],e,loc,'/testbed',q['cwd'])
p='sphinx/builders/__init__.py';assert data['trace'][p+':144'][1]=='get_relative_uri'
assert e.locate(p,144,e.digests[p])['called']
for r in loc:r['source_sha256']='0'*64
_,bad=present(raw,q['tool'],q['args'],e,loc,'/testbed',q['cwd']);assert not any(r['priority'] for r in bad['locations'])
wrong=dict(data['trace']);wrong[p+':144']=[0,'other_name'];wrong[p+':145']=[0,'get_relative_uri'];bad_e=Evidence(data['sources'],wrong,True,data['excluded']);assert (p,144) not in bad_e.called and (p,145) not in bad_e.called
report['attacks']={'stale_source_rejected':True,'wrong_name_and_code_start_rejected':True,'actual_match_count':len(raw.splitlines()),'identity':[p,144],'recorded_trace_keys':len(data['trace'])}
# Independently replay the actual changed command and compare it to unwrapped native execution.
d=review/('display-'+str(uuid.uuid4()));d.mkdir(exist_ok=False);task,_=make('sphinx-doc__sphinx-10614');image=read(HERE.parent/'gate-1/image-digests.json')[task['instance_id']];name=None
try:
 name,args=create(image,task,d)
 wrapped=execute(name,{'mode':'command','command':s['command'],'arm':'box'})
 native=command(['docker','exec',name,'/bin/bash','-lc',s['command']])
 assert native.returncode==wrapped['exit']==0 and native.stdout==base64.b64decode(wrapped['native_stdout_b64']) and native.stderr==base64.b64decode(wrapped['native_stderr_b64'])
 assert wrapped['shown_stdout_b64']==s['result']['shown_stdout_b64'] and wrapped['moved_up']==s['result']['moved_up']
 source=command(['docker','exec',name,'sha256sum','/testbed/'+p]);assert source.stdout.decode().split()[0]==e.digests[p]
 (d/'replay.json').write_text(json.dumps({'wrapped':wrapped,'native_stdout_b64':base64.b64encode(native.stdout).decode(),'native_stderr_b64':base64.b64encode(native.stderr).decode(),'source_sha256':e.digests[p]},indent=2),encoding='utf-8')
 report['attacks']['actual_display_reproduced']=True
finally:
 if name:assert command(['docker','rm','-f',name]).returncode==0
report['pair_tokens']=sum(v['reported_tokens'] for v in report['runs'].values());assert report['pair_tokens']==383261
(review/'audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='runs'},indent=2));print('RUNS',json.dumps({a:{k:v for k,v in r.items() if k!='settings'} for a,r in report['runs'].items()},indent=2))
