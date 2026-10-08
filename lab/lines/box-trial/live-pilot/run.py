"""Exactly one subscribed-agent pilot pair; no automatic repeats."""
import hashlib,json,pathlib,queue,re,shlex,sys,time
from common import HERE,ROOT,REPO,MODEL,RPC,command,create,execute,capture,evaluate,write,visible
from prepare import make
CAP=400000;PAIR_CAP=800000;EFFORT='low';ident='sphinx-doc__sphinx-10614'
sha=lambda b:hashlib.sha256(b).hexdigest()
task,_=make(ident);image=json.loads((ROOT/'gate-1/image-digests.json').read_bytes())[ident]
BASE='You are a software repair agent. Your only execution tool is run_command, which operates in a separate Linux container. Use it to inspect the complete repository, make the fix and verify it. Never use local host tools.'
PROMPT='Fix the issue in the full repository at /testbed. Use run_command to inspect, edit and test there. Commands run in a prepared Linux container with no network. Do not install packages, browse for answers, alter benchmark tests, or use tools other than run_command. Ordinary searches such as grep are available. Finish with a concise description; your actual production patch will be evaluated independently.\n\nIssue:\n'+task['issue']+'\n\nFailing tests:\n'+'\n'.join(task['fail_names'])+'\n\nRun them with:\n'+shlex.join(['python','/lab/container.py','--child','plain','/tmp/lab-unused.trace.json']+task['failing_argv'])+'\n'
TOOL={'name':'run_command','description':'Run one shell command in the prepared Linux task repository. Command output is returned with its exit status.','inputSchema':{'type':'object','properties':{'command':{'type':'string'}},'required':['command'],'additionalProperties':False}}
def freeze():
 (HERE/'prompt.txt').write_bytes(PROMPT.encode());(HERE/'base-instructions.txt').write_bytes(BASE.encode())
 write(HERE/'settings.json',{'task':ident,'model':MODEL,'effort':EFFORT,'first_arm':'control','token_cap':CAP,'pair_cap':PAIR_CAP,'steps':60,'seconds':900,'command_seconds':300,'returned_bytes':16000,'prompt_sha256':sha(PROMPT.encode()),'base_sha256':sha(BASE.encode()),'tool':TOOL})
def total(record):return (record.get('token_usage') or {}).get('total',{}).get('totalTokens',0)
def run_arm(arm):
 d=HERE/'raw/runs'/arm
 if d.exists():raise RuntimeError('A start already exists; no reroll authorized')
 d.mkdir(parents=True);scratch=HERE/'scratch'/('agent-'+arm);scratch.mkdir(parents=True)
 record={'task':ident,'arm':arm,'model':MODEL,'effort':EFFORT,'status':'started','started_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'token_usage':None,'steps':0,'searches':0,'searches_reordered':0,'prompt_sha256':sha(PROMPT.encode())}
 write(d/'attempt.json',record);name=rpc=None;steps=[];started=time.monotonic();deadline=None
 try:
  name,args=create(image,task,d);record['create_argv']=args
  rpc=RPC();rpc.ask('initialize',{'clientInfo':{'name':'lab_silent_pilot','title':'Lab silent pilot','version':'1.0'},'capabilities':{'experimentalApi':True}});rpc.send({'method':'initialized'})
  result=rpc.ask('thread/start',{'model':MODEL,'cwd':str(scratch.resolve()),'approvalPolicy':'never','sandbox':'read-only','ephemeral':True,'baseInstructions':BASE,'dynamicTools':[TOOL]})
  tid=result['thread']['id'];record['thread_id']=tid;record['reported_model']=result.get('model')
  assert record['reported_model']==MODEL,'Requested model not confirmed'
  result=rpc.ask('turn/start',{'threadId':tid,'effort':EFFORT,'input':[{'type':'text','text':PROMPT}]});turn=result['turn']['id'];record['turn_id']=turn
  deadline=time.monotonic()+900;record['agent_started_monotonic']=time.monotonic()
  def stop(reason):
   record['status']='capped';record['cap_reason']=reason
   rpc.send({'id':900001,'method':'turn/interrupt','params':{'threadId':tid,'turnId':turn}})
  while time.monotonic()<deadline:
   try:v=rpc.receive(timeout=5)
   except queue.Empty:continue
   method=v.get('method');params=v.get('params',{})
   if method=='thread/tokenUsage/updated':
    record['token_usage']=params.get('tokenUsage',params);write(d/'attempt.json',record)
    if total(record)>=CAP:stop('reported token ceiling');break
   elif method=='model/rerouted':raise RuntimeError('Model rerouted; no substitution')
   elif method=='item/tool/call':
    assert params.get('tool')=='run_command','Unexpected tool'
    usage=record.get('token_usage') or {}
    last=usage.get('last',{}).get('inputTokens',0)
    remaining=CAP-total(record)
    if len(steps)>=60 or remaining<=last+8192:
     stop('step ceiling' if len(steps)>=60 else 'conservative next-request token reserve')
     break
    a=params.get('arguments',{});a=json.loads(a) if isinstance(a,str) else a
    text=a['command'];r=execute(name,{'mode':'command','command':text,'arm':arm,'timeout_seconds':min(300,max(1,deadline-time.monotonic()))})
    item={'step':len(steps)+1,'command':text,'result':r,'usage_before':record.get('token_usage'),'elapsed_seconds':time.monotonic()-started}
    steps.append(item);write(d/'steps.json',steps)
    record['steps']=len(steps);record['searches']+=len(r['queries']);record['searches_reordered']+=r['searches_reordered'];write(d/'attempt.json',record)
    if time.monotonic()>=deadline:
     stop('wall-clock ceiling during command');break
    rpc.send({'id':v['id'],'result':{'contentItems':[{'type':'inputText','text':visible(r)}],'success':True}})
    print(arm,'step',len(steps),'tokens',total(record),'searches',record['searches'],'reordered',record['searches_reordered'],flush=True)
   elif 'id' in v and method:
    rpc.send({'id':v['id'],'error':{'code':-32000,'message':'No local host execution authorized; use run_command'}});raise RuntimeError('Unexpected host request')
   elif method=='turn/completed':
    record['completion']=params.get('turn');record['status']='completed' if record['completion'].get('status')=='completed' else 'failed-turn';break
   elif v.get('_eof'):raise RuntimeError('Server exited')
  else:stop('wall-clock ceiling')
  # Drain the interrupted stream briefly to retain final reported usage; no new turn.
  if record['status']=='capped':
   end=time.monotonic()+5
   while time.monotonic()<end:
    try:v=rpc.receive(timeout=min(1,end-time.monotonic()))
    except queue.Empty:continue
    if v.get('method')=='thread/tokenUsage/updated':record['token_usage']=v['params'].get('tokenUsage',v['params'])
    if v.get('method')=='turn/completed':record['completion']=v['params'].get('turn');break
  record['agent_seconds']=time.monotonic()-record['agent_started_monotonic']
  if not steps:raise RuntimeError('No repository command executed')
  patch=capture(name,d);record['patch_sha256']=sha(patch.encode());record['patch_bytes']=len(patch.encode())
  record['work_container_cleanup_exit']=command(['docker','rm','-f',name]).returncode;name=None
  rpc.close();write(d/'model-events.json',rpc.events);rpc=None
  record['evaluation']=evaluate(image,task,patch,d)
 except Exception as error:
  record['error']=str(error);record['status']='unknown' if record['status']=='started' else record['status']
 finally:
  if name:record['container_cleanup_exit']=command(['docker','rm','-f',name]).returncode
  if rpc:
   write(d/'model-events.json',rpc.events);rpc.close()
  record['box_arm_valid']=arm!='box' or record['searches_reordered']>0
  record['token_cap_excess']=max(0,total(record)-CAP);record['seconds']=time.monotonic()-started
  record['artifacts']={p.name:sha(p.read_bytes()) for p in d.iterdir() if p.is_file() and p.name!='attempt.json'}
  write(d/'attempt.json',record)
 return record
def main():
 if sys.argv[1:]==['--freeze']:freeze();return
 assert (HERE/'launch-lock.json').exists(),'Plan must be pushed and launch lock recorded'
 lock=json.loads((HERE/'launch-lock.json').read_bytes())
 assert command(['git','-c','safe.directory='+str(REPO).replace('\\','/'),'rev-parse','HEAD']).stdout.decode().strip()==lock['commit']
 for n,h in lock['files'].items():assert sha((HERE/n).read_bytes())==h,n
 assert json.loads((HERE/'harness.json').read_bytes())['status']=='pass'
 assert json.loads((HERE/'box-check.json').read_bytes())['status']=='pass'
 assert json.loads((HERE/'native-check.json').read_bytes())['status']=='pass'
 first=run_arm('control')
 write(HERE/'progress.json',{'control':first,'pair_tokens':total(first)})
 if first.get('error') or first['evaluation']['status']!='scored':raise RuntimeError('Control protocol/scoring error: stop before second arm')
 if total(first)>CAP:raise RuntimeError('First in-flight cap excess leaves insufficient equal allowance; stop before second arm')
 second=run_arm('box')
 write(HERE/'progress.json',{'control':first,'box':second,'pair_tokens':total(first)+total(second),'pair_cap_excess':max(0,total(first)+total(second)-PAIR_CAP)})
 print('PILOT_PAIR_STOP',flush=True)
if __name__=='__main__':main()
