"""Sequential subscribed-agent trial; third-party execution only in owned containers."""
import hashlib, importlib.util, json, pathlib, queue, re, shlex, subprocess, sys, time, uuid
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent.parent/'gate-3'))
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
    idle();name='lab-silent-pilot-'+str(uuid.uuid4())
    args=['docker','create','--name',name,'--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','4g','--cpus','2','--pids-limit','128','--env','PYTHONDONTWRITEBYTECODE=1','--env','MPLBACKEND=Agg','--workdir','/testbed','--entrypoint','/bin/bash']
    for src,dst in [(HERE/'execute.py','execute.py'),(ROOT/'gate-1b/container.py','container.py'),(HERE/'capture.py','capture.py'),(HERE/'shell.sh','shell.sh'),(HERE/'adapter.py','adapter.py'),(HERE/'evidence.json','evidence.json')]:args+=['--mount','type=bind,src='+str(src.resolve())+',dst=/lab/'+dst+',readonly']
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
            if not m:
                import ast,gzip
                source=json.loads(gzip.decompress((ROOT/'gate-1/records'/task['instance_id']/'sources.json.gz').read_bytes()))
                modules={match.group(2).rsplit('.',1)[0] for n in names if (match:=re.match(r'^(\S+) \((\S+)\)$',n))}
                found=[]
                for module in sorted(modules):
                    path='tests/'+module.replace('.','/')+'.py'
                    for cls in ast.walk(ast.parse(source[path])):
                        if isinstance(cls,ast.ClassDef):
                            for fn in cls.body:
                                if isinstance(fn,(ast.FunctionDef,ast.AsyncFunctionDef)):
                                    doc=ast.get_docstring(fn)
                                    if doc and doc.splitlines()[0]==name:found.append(module+'.'+cls.name+'.'+fn.name)
                if len(found)!=1:raise RuntimeError('Ambiguous/unmapped benchmark guard description: '+name)
                labels.append(found[0]);continue
            method,path=m.groups();labels.append(path if path.endswith('.'+method) else path+'.'+method)
        return ['tests/runtests.py','--verbosity','2','--settings=test_sqlite','--parallel','1']+labels
    if task['repo']=='sympy/sympy':
        files=re.findall(r'^\+\+\+ b/(.+\.py)$',task['test_patch'],re.M)
        return ['sympy',json.dumps({'files':files,'names':names})]
    return ['pytest','-rA','-vv','--tb=short','-p','no:cacheprovider']+[task.get('_native_test_ids',{}).get(n,n) for n in names]

def passed_names(task,names,log):
    log=re.sub(r'\x1b\[[0-9;]*[A-Za-z]','',log)
    if task['repo']=='django/django':
        return [n for n in names if re.search(r'^'+re.escape(n)+r'(?:[^\n]*\n)?[^\n]*\.\.\. (ok)',log,re.M) or re.search(r'^'+re.escape(n)+r' \.\.\. (ok)',log,re.M)]
    if task['repo']=='sympy/sympy':return [n for n in names if re.search(r'^'+re.escape(n)+r' (ok)\b',log,re.M)]
    return [n for n in names if re.search(r'^'+re.escape(n)+r' (PASSED)( |$)',log,re.M) or re.search(r'^(PASSED) '+re.escape(n)+r'( |$)',log,re.M)]

def evaluate(image,task,patch,directory):
    task=dict(task)
    name=None;result={'status':'unknown','solved':None,'phases':{}}
    try:
        name,args=create(image,task,directory);result['create_argv']=args
        truncated=[n for n in task['guard_names']+task['fail_names'] if '[' in n and not n.endswith(']')]
        if truncated:
            selectors=sorted({n.split('[',1)[0] for n in truncated})
            code='import pytest,json\nclass Collector:\n def pytest_collection_finish(self,session): print("LAB_NODE_IDS="+json.dumps([i.nodeid for i in session.items]))\nraise SystemExit(pytest.main('+repr(['--collect-only','-q','-s','-p','no:cacheprovider']+selectors)+',plugins=[Collector()]))'
            output=execute(name,{'mode':'command','command':shlex.join(['python','-c',code])})
            (directory/'guard-collection.log').write_bytes((output['stdout']+output['stderr']).encode())
            marker=next((line[len('LAB_NODE_IDS='):] for line in output['stdout'].splitlines() if line.startswith('LAB_NODE_IDS=')),None)
            if output['exit']!=0 or marker is None:raise RuntimeError('Lossless native test collection failed')
            nodes=json.loads(marker);mapping={}
            for n in truncated:
                matches=[node for node in nodes if node.startswith(n)]
                if len(matches)!=1:raise RuntimeError('Ambiguous truncated benchmark identifier: '+n)
                mapping[n]=matches[0]
            task['_native_test_ids']=mapping;write(directory/'guard-node-map.json',mapping)
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
            result['phases'][phase].update(argv=argv,requested=len(names),matched_passes=len(matched),missing_names=[n for n in names if n not in matched],all_pass=output['exit']==0 and not output['timed_out'] and len(matched)==len(names))
        phases=list(result['phases'].values())
        if any(p.get('timed_out') for p in phases):raise RuntimeError('Benchmark evaluation timed out')
        # Nonzero can mean a legitimate test miss or an environment/setup failure. Preserve unknown unless normal named failure is seen.
        if all(p['all_pass'] for p in phases):result.update(status='scored',solved=True)
        else:
            logs='\n'.join((directory/(phase+'.log')).read_text(encoding='utf-8') for phase in ['failing','guards'] if (directory/(phase+'.log')).exists())
            requested=task['fail_names']+task['guard_names']
            named_failure=any(re.search(r'(^FAILED '+re.escape(n)+r'( |$)|^'+re.escape(n)+r' FAILED( |$)|^FAIL: '+re.escape(n)+r'( |$)|^ERROR: '+re.escape(n)+r'( |$)|^'+re.escape(n)+r' (F|E)\b)',logs,re.M) for n in requested)
            if named_failure:result.update(status='scored',solved=False)
            else:raise RuntimeError('Incomplete result names or setup failure; cannot score')
    except Exception as error:result['error']=str(error)
    finally:
        if name:result['cleanup_exit']=command(['docker','rm','-f',name],timeout=60).returncode
        write(directory/'evaluation.json',result)
    return result

