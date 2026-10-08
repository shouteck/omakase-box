"""Fresh independent exhaustive receipt audit; never runs repair agents."""
import base64,collections,hashlib,json,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parent.parent;REPO=ROOT.parents[2]
HERE=ROOT/sys.argv[1];sys.path.insert(0,str(HERE))
from common import visible,production_patch,command
from adapter import Evidence,present
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_bytes())
git=['git','-c','safe.directory='+REPO.as_posix()]
report={'frozen_candidate':'2e85d53224be31e346df49a149b0606b5875d575','task_folder':HERE.name,'manifests':{},'runs':{}}
assert command(git+['rev-parse','HEAD']).stdout.decode().strip()==report['frozen_candidate']
for filename in ['manifest.json','pre-agent-manifest.json']:
 m=read(HERE/filename)
 for name,entry in m['files'].items():
  b=(HERE/name).read_bytes();assert sha(b)==entry['sha256'] and len(b)==entry['bytes'],name
 for k,name in [('evidence_sha256','evidence.json'),('summary_sha256','summary.json'),('launch_lock_sha256','launch-lock.json'),('native_check_sha256','native-check.json'),('harness_sha256','harness.json')]:
  if k in m:assert sha((HERE/name).read_bytes())==m[k],name
 report['manifests'][filename]=len(m['files'])
lock=read(HERE/'launch-lock.json');report['launch_commit']=lock['commit']
assert command(git+['merge-base','--is-ancestor',lock['commit'],'origin/lab']).returncode==0
report['launch_commit_time']=command(git+['show','-s','--format=%cI',lock['commit']]).stdout.decode().strip()
for name,h in lock['files'].items():
 assert sha((HERE/name).read_bytes())==h,name
 if name=='evidence.json':continue
 rel=(HERE/name).resolve().relative_to(REPO).as_posix()
 r=command(git+['show',lock['commit']+':'+rel]);assert r.returncode==0 and sha(r.stdout)==h,rel
harness=read(HERE/'harness.json');assert harness['status']=='pass'
assert [(s['label'],s.get('evaluation',s)['solved']) for s in harness['stages']]==[('real-fix',True),('empty',False),('broken-guard',False)]
native_check=read(HERE/'native-check.json');assert native_check['status']=='pass'
for action in native_check['actions']:
 receipt=read(HERE/action['receipt']);r=receipt['recorded']
 assert receipt['native_exit']==r['exit']
 assert receipt['native_stdout_b64']==r['native_stdout_b64'] and receipt['native_stderr_b64']==r['native_stderr_b64']
 assert collections.Counter(base64.b64decode(r['native_stdout_b64']).splitlines(keepends=True))==collections.Counter(base64.b64decode(r['shown_stdout_b64']).splitlines(keepends=True))
report['pre_agent_replay']={'actions':len(native_check['actions']),'captures':sum(a['searches'] for a in native_check['actions']),'reordered':sum(a['reordered'] for a in native_check['actions'])}
data=read(HERE/'evidence.json');e=Evidence(data['sources'],data['trace'],data.get('valid',True),data.get('excluded',[]))
report['source_count']=len(data['sources']);report['exact_called_identities']=len(e.called)
transcript=[]
for arm in ['control','box']:
 d=HERE/'raw/runs'/arm;a=read(d/'attempt.json');steps=read(d/'steps.json');events=read(d/'model-events.json')
 for n,h in a['artifacts'].items():assert sha((d/n).read_bytes())==h,n
 settings=[(i,v['params']['threadSettings']) for i,v in enumerate(events) if v.get('method')=='thread/settings/updated']
 assert len(settings)==1 and settings[0][1]['effort']=='low' and settings[0][1]['model']=='gpt-5.6-luna'
 turn_index=next(i for i,v in enumerate(events) if v.get('method')=='turn/started');assert settings[0][0]<turn_index
 users=[v['params']['item'] for v in events if v.get('method')=='item/completed' and v['params']['item']['type']=='userMessage']
 assert len(users)==1 and users[0]['content'][0]['text'].encode()==(HERE/'prompt.txt').read_bytes()
 tools=[v['params']['item'] for v in events if v.get('method')=='item/completed' and v['params']['item']['type']=='dynamicToolCall'];assert len(tools)==len(steps)
 usage=[v['params']['tokenUsage'] for v in events if v.get('method')=='thread/tokenUsage/updated'];assert usage[-1]==a['token_usage']
 assert all(x['total']['totalTokens']<400000 for x in usage)
 assert not any(v.get('method') in ['model/rerouted','error','item/tool/call'] and v.get('params',{}).get('tool','run_command')!='run_command' for v in events)
 changed=[];truncated=[];identities=[]
 transcript.append('\n'+arm+' FULL MODEL EVENTS\n'+json.dumps(events,ensure_ascii=False,indent=2))
 for s,item in zip(steps,tools):
  r=s['result'];assert item['arguments']['command']==s['command'] and item['tool']=='run_command' and item['status']=='completed'
  assert item['contentItems']==[{'type':'inputText','text':visible(r)}] and item['success'] is True
  raw=base64.b64decode(r['native_stdout_b64']);shown=base64.b64decode(r['shown_stdout_b64'])
  assert collections.Counter(raw.splitlines(keepends=True))==collections.Counter(shown.splitlines(keepends=True)) and len(raw)==len(shown) and r['added_bytes']==0
  assert shown==b''.join(raw.splitlines(keepends=True)[i] for i in r['order'])
  assert r['stdout']==shown.decode('utf-8',errors='replace') and r['stderr']==base64.b64decode(r['native_stderr_b64']).decode('utf-8',errors='replace')
  for filename,key in [('execute.py','wrapper_sha256'),('capture.py','capture_sha256'),('adapter.py','adapter_sha256')]:assert r[key]==lock['files'][filename]
  for q in r['queries']:
   qr=base64.b64decode(q['stdout_b64']);assert sha(qr)==q['native_sha256']
   _,proof=present(qr,'grep' if q['tool']=='git' else q['tool'],q['args'],e,q['proof']['locations'],'/testbed',q['cwd'])
   old=[(v['ordinal'],v.get('priority'),v.get('function_start')) for v in q['proof']['locations']]
   new=[(v['ordinal'],v.get('priority'),v.get('function_start')) for v in proof['locations']];assert old==new
   for loc in proof['locations']:
    if loc['priority']:
     assert loc['source_sha256']==e.digests[loc['path']] and (loc['path'],loc['function_start']) in e.called
     identities.append([loc['path'],loc['function_start'],loc['source_sha256']])
  if raw!=shown:changed.append(s['step'])
  if '[output truncated at' in visible(r):truncated.append(s['step'])
  transcript.append('\nSTEP '+str(s['step'])+'\nCOMMAND\n'+s['command']+'\nCOMPLETE NATIVE STDOUT\n'+raw.decode('utf-8',errors='replace')+'\nSTDERR\n'+r['stderr']+'\nDELIVERED\n'+visible(r))
 assert production_patch((d/'all.patch').read_text(encoding='utf-8'))==(d/'candidate.patch').read_text(encoding='utf-8')
 transcript.append('\nACTUAL PATCH\n'+(d/'candidate.patch').read_text(encoding='utf-8'))
 report['runs'][arm]={'events':len(events),'steps':len(steps),'searches':sum(len(s['result']['queries']) for s in steps),'reordered':sum(s['result']['searches_reordered'] for s in steps),'changed_display_steps':changed,'truncated_steps':truncated,'reported_tokens':usage[-1]['total']['totalTokens'],'candidate_sha256':sha((d/'candidate.patch').read_bytes()),'started_utc':a['started_utc'],'settings':settings[0][1],'source_identities':sorted({tuple(x) for x in identities}),'nonzero_steps':[s['step'] for s in steps if s['result']['exit']],'event_methods':dict(collections.Counter(v.get('method','response') for v in events))}
report['pair_tokens']=sum(v['reported_tokens'] for v in report['runs'].values())
# Wrong complete-source hash and code-start/name attacks across every called identity.
for p,start in e.called:
 assert e.locate(p,start,'0'*64) is None
bad=Evidence(data['sources'],{k:[v[0],'__wrong_name__'] for k,v in data['trace'].items()},True,data.get('excluded',[]));assert not bad.called
bad=Evidence(data['sources'],{k.rsplit(':',1)[0]+':'+str(int(k.rsplit(':',1)[1])+1):v for k,v in data['trace'].items()},True,data.get('excluded',[]));assert not bad.called
report['attacks']={'all_called_stale_hash_rejected':len(e.called),'all_wrong_names_rejected':True,'all_code_starts_plus_one_rejected':True}
(ROOT/'live-three'/('review-audit-'+HERE.name+'.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
out=HERE/'raw/review';out.mkdir(exist_ok=True)
(out/'continuation-complete-record-read.txt').write_text('\n'.join(transcript),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='runs'},indent=2))
print(json.dumps({a:{k:v for k,v in r.items() if k not in ['settings','source_identities','event_methods']} for a,r in report['runs'].items()},indent=2))
