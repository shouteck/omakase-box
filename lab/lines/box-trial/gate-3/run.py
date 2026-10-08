"""Sequential subscribed-agent trial; third-party execution only in owned containers."""
import hashlib, importlib.util, json, pathlib, queue, re, shlex, subprocess, sys, time, uuid
from preflight import RPC, MODEL
from prepare import make
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parent
REPO=HERE.parents[3]
RECORDS=HERE/'records'
ACTIVATE='source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed && '
def write(path,value):path.write_bytes(json.dumps(value,indent=2,ensure_ascii=False).encode('utf-8'))
def command(argv,input=None,timeout=1800):return subprocess.run(argv,input=input,capture_output=True,timeout=timeout)
def idle():
    r=command(['node',str(REPO/'lab/tools/kitchen-busy.mjs')],timeout=30)
    if r.returncode or not r.stdout.startswith(b'idle '):raise RuntimeError('Kitchen busy; heavy job deferred')
def create(image,task,directory):
    idle();name='lab-gate-3-'+str(uuid.uuid4())
    args=['docker','create','--name',name,'--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','4g','--cpus','2','--pids-limit','128','--env','PYTHONDONTWRITEBYTECODE=1','--env','MPLBACKEND=Agg','--workdir','/testbed','--entrypoint','/bin/bash']
    for src,dst in [(HERE/'execute.py','execute.py'),(ROOT/'gate-1b/container.py','container.py')]:args+=['--mount','type=bind,src='+str(src.resolve())+',dst=/lab/'+dst+',readonly']
    args += [image,'-lc','sleep infinity']
    r=command(args,timeout=60)
    if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace'))
    try:
        r=command(['docker','start',name],timeout=60)
        if r.returncode:raise RuntimeError('Container start failed')
        head=command(['docker','exec',name,'git','rev-parse','HEAD'],timeout=30).stdout.decode().strip()
        if head!=task['base_commit']:raise RuntimeError('Base HEAD mismatch')
        patch=directory/'test.patch';patch.write_bytes(task['test_patch'].encode())
        r=command(['docker','cp',str(patch),name+':/tmp/lab-test.patch'],timeout=60)
        if r.returncode:raise RuntimeError('Test overlay copy failed')
        r=command(['docker','exec',name,'git','apply','/tmp/lab-test.patch'],timeout=60)
        if r.returncode:raise RuntimeError('Test overlay refused')
        r=command(['docker','exec',name,'/bin/bash','-c','git add -A && git write-tree && git reset -q'],timeout=60)
        if r.returncode:raise RuntimeError('Prepared-worktree checkpoint failed')
        tree=r.stdout.decode().strip()
        if not re.fullmatch('[0-9a-f]{40}',tree):raise RuntimeError('Invalid worktree checkpoint')
        write(directory/'baseline-tree.json',{'tree':tree,'meaning':'prepared image worktree plus immutable test overlay; before agent'})
        return name,args
    except Exception:
        command(['docker','rm','-f',name],timeout=60);raise

def execute(name,request):
    idle()
    argv=['docker','exec','-i',name,'/bin/bash','-lc',ACTIVATE+'python /lab/execute.py']
    r=command(argv,input=json.dumps(request).encode('utf-8'),timeout=330)
    if r.returncode:raise RuntimeError('Execution adapter failure: '+r.stderr.decode(errors='replace')[:1000])
    return json.loads(r.stdout)
def dispatch(name,arm,scope,text):
    try:words=shlex.split(text)
    except ValueError:return {'stdout':'','stderr':'Malformed command quoting','exit':2,'timed_out':False,'seconds':0},False
    if words and words[0]=='box-search':
        if arm!='box':return {'stdout':'','stderr':'box-search: command not found','exit':127,'timed_out':False,'seconds':0},False
        request={'mode':'box','scope':scope,'literal':False,'ignore_case':False,'paths':[]}
        i=1
        while i<len(words) and words[i] in ['-n','-F','-i','--']:
            if words[i]=='-F':request['literal']=True
            if words[i]=='-i':request['ignore_case']=True
            if words[i]=='--':i+=1;break
            i+=1
        if i>=len(words) or any(w in ['|','&&',';','>','>>','<'] for w in words):
            return {'stdout':'','stderr':'Usage: box-search [-F] [-i] PATTERN [PATH...]. Call as a standalone command.','exit':2,'timed_out':False,'seconds':0},True
        request['pattern']=words[i];request['paths']=words[i+1:]
        return execute(name,request),True
    if re.search(r'(?<![A-Za-z0-9_-])box-search(?![A-Za-z0-9_-])',text):
        return {'stdout':'','stderr':'Use box-search as one standalone command.','exit':2,'timed_out':False,'seconds':0},False
    return execute(name,{'mode':'command','command':text}),False

def visible(result):
    text='exit='+str(result['exit'])+' timed_out='+str(result['timed_out'])+'\n'+result['stdout']+result['stderr']
    raw=text.encode('utf-8')
    return raw[:16000].decode('utf-8',errors='replace')+('\n[output truncated at 16000 UTF-8 bytes]' if len(raw)>16000 else '')
def production_patch(text):
    blocks=re.split(r'(?=^diff --git )',text,flags=re.M);out=[]
    for block in blocks:
        m=re.search(r'^diff --git a/(.+) b/(.+)$',block,re.M)
        if not m:continue
        path=m.group(2)
        parts=path.split('/')
        if any(p in ['test','tests','docs','examples','benchmarks'] or p.startswith('.') for p in parts) or pathlib.PurePosixPath(path).name.startswith('test_'):continue
        out.append(block)
    return ''.join(out)
def capture(name,directory):
    tree=json.loads((directory/'baseline-tree.json').read_text())['tree']
    execute(name,{'mode':'command','command':'git add -N -- .'})
    r=command(['docker','exec',name,'git','diff','--binary',tree,'--','.'],timeout=60)
    if r.returncode:raise RuntimeError('Candidate diff unavailable')
    allpatch=r.stdout.decode('utf-8');patch=production_patch(allpatch)
    (directory/'all.patch').write_bytes(r.stdout);(directory/'candidate.patch').write_bytes(patch.encode())
    return patch

def test_argv(task,names):
    if task['repo']=='django/django':
        labels=[]
        for name in names:
            m=re.match(r'^(\S+) \((\S+)\)$',name)
            if not m:raise RuntimeError('Unparseable benchmark guard name: '+name)
            method,path=m.groups();labels.append(path if path.endswith('.'+method) else path+'.'+method)
        return ['tests/runtests.py','--verbosity','2','--settings=test_sqlite','--parallel','1']+labels
    if task['repo']=='sympy/sympy':
        files=re.findall(r'^\+\+\+ b/(.+\.py)$',task['test_patch'],re.M)
        return ['sympy',json.dumps({'files':files,'names':names})]
    return ['pytest','-rA','-vv','--tb=short','-p','no:cacheprovider']+names

def passed_names(task,names,log):
    log=re.sub(r'\x1b\[[0-9;]*[A-Za-z]','',log)
    if task['repo']=='django/django':
        return [n for n in names if re.search(r'^'+re.escape(n)+r'(?:[^\n]*\n)?[^\n]*\.\.\. (ok)',log,re.M) or re.search(r'^'+re.escape(n)+r' \.\.\. (ok)',log,re.M)]
    if task['repo']=='sympy/sympy':return [n for n in names if re.search(r'^'+re.escape(n)+r' (ok)\b',log,re.M)]
    return [n for n in names if re.search(r'^'+re.escape(n)+r' (PASSED)( |$)',log,re.M) or re.search(r'^(PASSED) '+re.escape(n)+r'( |$)',log,re.M)]

def evaluate(image,task,patch,directory):
    name=None;result={'status':'unknown','solved':None,'phases':{}}
    try:
        name,args=create(image,task,directory);result['create_argv']=args
        r=command(['docker','cp',str(directory/'candidate.patch'),name+':/tmp/lab-candidate.patch'],timeout=60)
        if r.returncode:raise RuntimeError('Candidate copy failed')
        if patch:
            r=command(['docker','exec',name,'git','apply','/tmp/lab-candidate.patch'],timeout=60)
            if r.returncode:
                (directory/'apply-error.log').write_bytes(r.stderr)
                raise RuntimeError('Candidate production patch does not apply')
        for phase,key in [('failing','fail_names'),('guards','guard_names')]:
            names=task[key]
            if not names:result['phases'][phase]={'vacuous':True,'all_pass':True};continue
            argv=['python','/lab/container.py','--child','plain','/tmp/lab-unused.trace.json']+test_argv(task,names)
            output=execute(name,{'mode':'command','command':shlex.join(argv)})
            (directory/(phase+'.log')).write_bytes((output['stdout']+output['stderr']).encode('utf-8'))
            matched=passed_names(task,names,output['stdout']+output['stderr'])
            result['phases'][phase]={k:v for k,v in output.items() if k not in ['stdout','stderr']}
            result['phases'][phase].update(requested=len(names),matched_passes=len(matched),missing_names=[n for n in names if n not in matched],all_pass=output['exit']==0 and not output['timed_out'] and len(matched)==len(names))
        phases=list(result['phases'].values())
        if any(p.get('timed_out') for p in phases):raise RuntimeError('Benchmark evaluation timed out')
        # Nonzero can mean a legitimate test miss or an environment/setup failure. Preserve unknown unless normal named failure is seen.
        if all(p['all_pass'] for p in phases):result.update(status='scored',solved=True)
        else:
            logs='\n'.join((directory/(phase+'.log')).read_text(encoding='utf-8') for phase in ['failing','guards'] if (directory/(phase+'.log')).exists())
            if re.search(r'(^FAILED | FAILED(?: |$)|^FAIL: |^ERROR: |^test_\S+ (F|E)\b)',logs,re.M):result.update(status='scored',solved=False)
            else:raise RuntimeError('Incomplete result names or setup failure; cannot score')
    except Exception as error:result['error']=str(error)
    finally:
        if name:result['cleanup_exit']=command(['docker','rm','-f',name],timeout=60).returncode
        write(directory/'evaluation.json',result)
    return result

def arm_run(image,task,scope,arm,repeat):
    ident=task['instance_id'];directory=RECORDS/ident/(arm+'-'+str(repeat));directory.mkdir(parents=True,exist_ok=True)
    if (directory/'attempt.json').exists():print(ident,arm,repeat,'retained',flush=True);return
    record={'instance_id':ident,'arm':arm,'repeat':repeat,'model':MODEL,'effort':'high','status':'started','steps':0,'box_calls':0,'token_usage':None,'started_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    name=rpc=None;started=time.monotonic();steps=[];scratch=directory/'empty-agent-cwd';scratch.mkdir(exist_ok=True)
    try:
        name,args=create(image,task,directory);record['create_argv']=args
        prompt='Fix the issue in the full repository at /testbed. Use run_command to inspect, edit and test there. Commands run in a prepared Linux container with no network. Do not install packages, browse for answers, alter benchmark tests, or use tools other than run_command. Ordinary searches such as grep are available. Finish with a concise description; your actual production patch will be evaluated independently.\n\nIssue:\n'+task['issue']+'\n\nFailing tests:\n'+'\n'.join(task['fail_names'])+'\n\nRun them with:\n'+shlex.join(['python','/lab/container.py','--child','plain','/tmp/lab-unused.trace.json']+task['failing_argv'])+'\n'
        if arm=='box':prompt+='Begin by searching with box-search, which searches within the functions the failing test ran; use ordinary search whenever that is not enough, and the full repository remains available.\n'
        (directory/'prompt.txt').write_bytes(prompt.encode());record['prompt_sha256']=hashlib.sha256(prompt.encode()).hexdigest()
        rpc=RPC()
        rpc.ask('initialize',{'clientInfo':{'name':'lab_gate_3','title':'Lab Gate 3','version':'1.0'},'capabilities':{'experimentalApi':True}});rpc.send({'method':'initialized'})
        tool={'name':'run_command','description':'Run one shell command in the prepared Linux task repository. Command output is returned with its exit status.','inputSchema':{'type':'object','properties':{'command':{'type':'string'}},'required':['command'],'additionalProperties':False}}
        result=rpc.ask('thread/start',{'model':MODEL,'cwd':str(scratch.resolve()),'approvalPolicy':'never','sandbox':'read-only','ephemeral':True,'baseInstructions':'You are a software repair agent. Your only execution tool is run_command, which operates in a separate Linux container. Use it to inspect the complete repository, make the fix and verify it. Never use local host tools.','dynamicTools':[tool]})
        tid=result['thread']['id'];record['thread_id']=tid;record['reported_model']=result.get('model')
        result=rpc.ask('turn/start',{'threadId':tid,'effort':'high','input':[{'type':'text','text':prompt}]});turn=result['turn']['id']
        record['turn_id']=turn;deadline=time.monotonic()+900
        while time.monotonic()<deadline:
            try:value=rpc.receive(timeout=5)
            except queue.Empty:continue
            method=value.get('method');params=value.get('params',{})
            if method=='thread/tokenUsage/updated':record['token_usage']=params.get('tokenUsage',params)
            elif method=='model/rerouted':raise RuntimeError('Selected model rerouted')
            elif method=='item/tool/call':
                usage=record['token_usage'] or {};total=usage.get('total',{}).get('totalTokens',0)
                if len(steps)>=60 or total>=1000000 or time.monotonic()>=deadline:
                    record['status']='capped';rpc.send({'id':value['id'],'result':{'contentItems':[{'type':'inputText','text':'Run budget exhausted; stop.'}],'success':False}});rpc.ask('turn/interrupt',{'threadId':tid,'turnId':turn});break
                if params.get('tool')!='run_command':raise RuntimeError('Unexpected dynamic tool')
                args=params.get('arguments',{});args=json.loads(args) if isinstance(args,str) else args
                text=args['command'];output,is_box=dispatch(name,arm,scope,text)
                step={'step':len(steps)+1,'command':text,'box_call':is_box,'result':output,'usage_before':record['token_usage'],'agent_elapsed_seconds':time.monotonic()-started}
                steps.append(step);write(directory/'steps.json',steps)
                record['steps']=len(steps);record['box_calls']+=int(is_box)
                rpc.send({'id':value['id'],'result':{'contentItems':[{'type':'inputText','text':visible(output)}],'success':True}})
                print(ident,arm,repeat,'step',len(steps),'box',record['box_calls'],flush=True)
            elif 'id' in value and method:
                rpc.send({'id':value['id'],'error':{'code':-32000,'message':'No local host execution permitted; use run_command'}})
                raise RuntimeError('Unexpected host/server request')
            elif method=='turn/completed':
                record['completion']=params.get('turn');record['status']='completed' if record['completion'].get('status')=='completed' else 'failed-start-or-turn';break
            elif value.get('_eof'):raise RuntimeError('Server exited')
        else:
            record['status']='capped';rpc.ask('turn/interrupt',{'threadId':tid,'turnId':turn})
        record['agent_seconds']=time.monotonic()-started
        if not steps:raise RuntimeError('No repository command executed')
        patch=capture(name,directory);record['patch_sha256']=hashlib.sha256(patch.encode()).hexdigest();record['patch_bytes']=len(patch.encode())
        command(['docker','rm','-f',name],timeout=60);name=None
        record['evaluation']=evaluate(image,task,patch,directory)
    except Exception as error:record['error']=str(error);record['status']='unknown'
    finally:
        if name:record['container_cleanup_exit']=command(['docker','rm','-f',name],timeout=60).returncode
        if rpc:
            usages=[v.get('params',{}).get('tokenUsage') for v in rpc.events if v.get('method')=='thread/tokenUsage/updated']
            if usages:record['token_usage']=usages[-1]
            write(directory/'model-events.json',rpc.events);rpc.close()
        try:scratch.rmdir()
        except OSError:record['unexpected_host_files']=True
        record['box_arm_valid']=arm!='box' or record['box_calls']>=1
        record['box_first_command']=bool(steps and steps[0]['box_call']) if arm=='box' else None
        record['box_call_followups']=[{'box_step':s['step'],'command':s['command'],'result':s['result'],'following_steps':[{'step':n['step'],'command':n['command'],'exit':n['result']['exit']} for n in steps[i+1:next((j for j in range(i+1,len(steps)) if steps[j]['box_call']),len(steps))]]} for i,s in enumerate(steps) if s['box_call']]
        record['seconds']=time.monotonic()-started
        record['artifacts']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}
        write(directory/'attempt.json',record)
        print(ident,arm,repeat,record['status'],record.get('evaluation',{}).get('solved'),record.get('error',''),flush=True)

def main():
    wanted=set(sys.argv[1:]);selected=json.loads((HERE/'selection.json').read_text())['tasks']
    images=json.loads((ROOT/'gate-1/image-digests.json').read_text());owned=[];held=None
    try:
        for selected_row in selected:
            ident=selected_row['instance_id']
            if wanted and ident not in wanted:continue
            task,scope=make(ident);image=images[ident]
            if command(['docker','image','inspect',image],timeout=30).returncode:
                idle();print(ident,'pulling',flush=True)
                r=command(['docker','pull',image]);
                if r.returncode:raise RuntimeError('Prepared image pull failed')
                owned.append(image)
            if held and held!=image:
                command(['docker','image','rm',held]);owned.remove(held)
            held=image if image in owned else None
            first=selected_row['first_arm']
            for arm in [first,'control' if first=='box' else 'box']:arm_run(image,task,scope,arm,0)
    finally:
        cleanup=[]
        for image in owned:cleanup.append({'image':image,'exit':command(['docker','image','rm',image]).returncode})
        write(HERE/'cleanup.json',cleanup)
if __name__=='__main__':main()
