"""Sequential native-search replay in owned pinned containers; never runs models."""
import base64,collections,gzip,hashlib,importlib.util,json,pathlib,re,subprocess,sys,time,uuid
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parent;REPO=HERE.parents[3]
sys.path.insert(0,str(ROOT/'gate-3'));from prepare import make,gate1
sys.path.insert(0,str(ROOT/'gate-2'));import measure
from corpus import collect,has_search
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda b:hashlib.sha256(b).hexdigest()
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(json.dumps(v,indent=2,ensure_ascii=True).encode())
def command(argv,input=None,timeout=1800):return subprocess.run(argv,input=input,capture_output=True,timeout=timeout)
def idle():
    p=command(['node',str(REPO/'lab/tools/kitchen-busy.mjs')],timeout=30)
    if p.returncode or not p.stdout.startswith(b'idle '):raise RuntimeError('Kitchen busy; deferred')
def scope_of(ident):
    task,spans=make(ident);sources=read_sources(ident);scope={}
    for p,intervals in spans.items():scope[p]=[row['name'] for row in gate1.functions(sources[p]) if [row['start'],row['end']] in intervals]
    return task,scope

def read_sources(ident):return json.loads(gzip.decompress((ROOT/'gate-1/records'/ident/'sources.json.gz').read_bytes()))
def targets_of(ident):
    source=read_sources(ident);trees={}
    for p,text in source.items():
        try:trees[p]=gate1.functions(text)
        except (SyntaxError,ValueError,RecursionError):pass
    row=next(r for r in read(ROOT/'gate-1/tasks.json') if r['instance_id']==ident)
    targets,files=measure.g1b.targets(row,source,trees)
    return {p:[r['name'] for r in trees[p] if (p,r['start']) in targets] for p in sorted(files)},sorted(files)

ACTIVATE='source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed && '
def create(image,ident,agent,scratch,scope,task,fixture=False):
    idle();name='lab-gate-3b-'+str(uuid.uuid4())
    scopefile=scratch/'scope.json';write(scopefile,scope)
    args=['docker','create','--name',name,'--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','4g','--cpus','2','--pids-limit','128','--env','PYTHONDONTWRITEBYTECODE=1','--env','MPLBACKEND=Agg','--workdir','/testbed','--entrypoint','/bin/bash']
    for p,dest in [(HERE/'search.py','search.py'),(HERE/'shell.sh','shell.sh'),(scopefile,'scope.json')]:args+=['--mount','type=bind,src='+str(p.resolve())+',dst=/lab/'+dest+',readonly']
    args += [image,'-lc','sleep infinity'];p=command(args,timeout=60)
    if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace'))
    try:
        p=command(['docker','start',name],timeout=60);assert p.returncode==0
        head=command(['docker','exec',name,'git','rev-parse','HEAD'],timeout=30).stdout.decode().strip();assert head==task['base_commit']
        if agent=='control' and not fixture:
            patch=scratch/'test.patch';patch.write_bytes(task['test_patch'].encode())
            p=command(['docker','cp',str(patch),name+':/tmp/lab-test.patch'],timeout=60);assert p.returncode==0
            p=command(['docker','exec',name,'git','apply','/tmp/lab-test.patch'],timeout=60);assert p.returncode==0,p.stderr
        return name,{'create_argv':args,'base_head':head,'scope_sha256':sha(scopefile.read_bytes())}
    except Exception:command(['docker','rm','-f',name],timeout=60);raise

def execute(name,text,mode='box'):
    previous=len(logs(name))
    env=['-e','LAB_BOX_SCOPE=/lab/scope.json','-e','LAB_BOX_LOG=/tmp/lab-box-search.jsonl','-e','LAB_BOX_MODE='+mode,'-e','LAB_BOX_ROOT=/testbed']
    shell=ACTIVATE+'source /lab/shell.sh && exec timeout -k 3 30 /bin/bash -c "$1"'
    p=command(['docker','exec','-i']+env+[name,'/bin/bash','-lc',shell,'lab-replay',text],timeout=45)
    shown=p.stdout;marks=set()
    if mode=='box':
        for q in logs(name)[previous:]:
            original=base64.b64decode(q['stdout_b64']).splitlines(keepends=True)
            for loc in q['locations']:
                if loc['priority']:marks.add(original[loc['ordinal']])
        shown=b''.join((b'[BOX] ' if line in marks else b'')+line for line in shown.splitlines(keepends=True))
    return {'exit':p.returncode,'unmarked_stdout_sha256':sha(p.stdout),'stdout_b64':base64.b64encode(shown).decode(),'stderr_b64':base64.b64encode(p.stderr).decode(),'stdout_sha256':sha(shown),'stderr_sha256':sha(p.stderr)}
def logs(name):
    p=command(['docker','exec',name,'cat','/tmp/lab-box-search.jsonl'],timeout=30)
    if p.returncode:return []
    return [json.loads(line) for line in p.stdout.decode('utf-8').splitlines()]
def state(name):
    head=command(['docker','exec',name,'git','rev-parse','HEAD'],timeout=30)
    diff=command(['docker','exec',name,'git','diff','--binary','HEAD'],timeout=30)
    status=command(['docker','exec',name,'git','status','--porcelain'],timeout=30)
    return {'head':head.stdout.decode().strip(),'diff_sha256':sha(diff.stdout),'status':status.stdout.decode(errors='replace')}
def expensive(c):
    shell=__import__('corpus').shell_only(c)
    return bool(re.search(r'\b(pip[23]?|pytest|tox|npm|pnpm|make|sphinx-build)\b|setup\.py|runtests\.py|python(?:[23.]*)?\s+-m\s+(pytest|pip|sphinx|build)|\bpython(?:[23.]*)?\s+[^\n;&|]*test',shell))

def fragments(text):
    # Original spelling and pipe/glob semantics are retained. Used only for
    # search portions of actions whose costly build/test cannot be replayed.
    text=__import__('corpus').shell_only(text);out=[];start=0;quote=None;escape=False;depth=0;i=0
    while i<len(text):
        ch=text[i]
        if escape:escape=False;i+=1;continue
        if ch=='\\' and quote!="'":escape=True;i+=1;continue
        if quote:
            if ch==quote:quote=None
            i+=1;continue
        if ch in ("'",'"','`'):quote=ch;i+=1;continue
        if ch=='(':depth+=1
        if ch==')':depth=max(0,depth-1)
        width=2 if text[i:i+2] in ('&&','||') else 1 if ch in (';','\n') else 0
        if width and not depth:
            piece=text[start:i].strip()
            if piece:out.append(piece)
            i+=width;start=i;continue
        i+=1
    if text[start:].strip():out.append(text[start:].strip())
    return out

def score_query(q,targets,files):
    loc=q['locations'];by={r['ordinal']:r for r in loc};order=q['proof'].get('order',[])
    hits=[r for r in loc if r['is_match'] and r['kind']=='line']
    actual=[r for r in hits if any(n in targets.get(r['path'],[]) for n in r.get('function_names',[]))]
    filehits=[r for r in loc if r['kind']=='file'];fileactual=[r for r in filehits if r['path'] in files]
    # Positions count genuine matches, never a context-only line. Unlocated
    # output is conservatively unknown and cannot become an eligible win.
    def pos(rows,actual,ordering):
        wanted={r['ordinal'] for r in actual};matching={r['ordinal'] for r in rows}
        ranked=[i for i in ordering if i in matching]
        return next((i+1 for i,x in enumerate(ranked) if x in wanted),None)
    raw=base64.b64decode(q['stdout_b64']).splitlines(keepends=True)
    context_only={r['ordinal'] for r in loc if not r['is_match']}
    separators={i for i,line in enumerate(raw) if line.rstrip(b'\r\n')==b'--' and q['proof'].get('context_groups',len(raw))<len(raw)}
    native=[i for i in range(len(raw)) if i not in context_only and i not in separators]
    def content_position(ordering):
        wanted={r['ordinal'] for r in actual};ranked=[i for i in ordering if i in native]
        return next((i+1 for i,x in enumerate(ranked) if x in wanted),None)
    ordinary=content_position(native);box=content_position(order)
    unknown=any(r['kind']=='unlocated' for r in loc) or (q['native_bytes']>0 and not loc) or (bool(actual) and not order)
    return {'line_matches':len(hits),'ordinary_first':ordinary,'box_first':box,'ordinary_before':ordinary-1 if ordinary else None,'box_before':box-1 if box else None,'no_target':not actual,'file_matches':len(filehits),'file_ordinary_first':pos(filehits,fileactual,native),'file_box_first':pos(filehits,fileactual,order),'format_unknown':unknown}

def run_task(ident,trajectories):
    images=read(ROOT/'gate-1/image-digests.json');image=images[ident];existed=command(['docker','image','inspect',image],timeout=30).returncode==0
    receipt={'task':ident,'image':image,'image_preexisted':existed,'trajectories':[],'queries':[]}
    scratch=HERE/'scratch'/ident;scratch.mkdir(parents=True,exist_ok=True)
    try:
        if not existed:
            idle();p=command(['docker','pull',image]);receipt['pull_exit']=p.returncode;receipt['pull_stderr_sha256']=sha(p.stderr)
            if p.returncode:raise RuntimeError('Pinned image pull failed')
        task,scope=scope_of(ident);targets,files=targets_of(ident)
        for traj in trajectories:
            if traj.get('missing'):receipt['trajectories'].append(traj);continue
            name=None;record={'agent':traj['agent'],'record_sha256':traj['sha256'],'actions':[]}
            try:
                name,created=create(image,ident,traj['agent'],scratch,scope,task);record.update(created);count=0;uncertain=[];skips=[];edited=False
                for action in traj['actions']:
                    text=action['command'];mutation=bool(measure.EDIT.search(text) or re.search(r'\bgit\s+(commit|checkout|reset|apply|clean|switch|restore|stash|revert|cherry-pick)\b',text))
                    item={'step':action['step'],'command':text,'search_action':action['search_action'],'source_mutation':mutation}
                    if expensive(text):
                        item.update(status='skipped-expensive',state_risk='source' if mutation else 'environment');skips.append(action['step'])
                        if mutation:uncertain.append(action['step'])
                        # Every search portion is attempted, even when its
                        # generated environment is unknown. Do not fabricate
                        # that environment or count its absence as evidence.
                        cwd='/testbed';extracted=[];total=0
                        for part in fragments(text):
                            words=measure.words(part)
                            if len(words)==2 and words[0]=='cd':
                                cwd=str(pathlib.PurePosixPath(words[1])) if words[1].startswith('/') else str(pathlib.PurePosixPath(cwd)/words[1])
                                continue
                            if not has_search(part):continue
                            snapshot=state(name);piece='cd '+__import__('shlex').quote(cwd)+' && '+part;out=execute(name,piece)
                            allqueries=logs(name);newqueries=allqueries[count:];count=len(allqueries);total+=len(newqueries)
                            for j,q in enumerate(newqueries):
                                q.update(task=ident,agent=traj['agent'],step=action['step'],invocation=total-len(newqueries)+j+1,command=text,replayed_fragment=piece,state_before=snapshot,source_state_unknown=True,environment_state_unknown=True,prior_environment_skips=list(skips),pre_edit=not edited)
                                q['metrics']=score_query(q,targets,files);receipt['queries'].append(q)
                            extracted.append({'fragment':piece,'result':out,'search_invocations':len(newqueries)})
                        item['extracted_searches']=extracted;item['search_invocations']=total
                        record['actions'].append(item);continue
                    if not action['search_action'] and not mutation:
                        item.update(status='skipped-observation');record['actions'].append(item);continue
                    snapshot=state(name);out=execute(name,text);item.update(status='replayed',result=out,state_before=snapshot,source_state_unknown=bool(uncertain),prior_environment_skips=list(skips),pre_edit=not edited)
                    allqueries=logs(name);new=allqueries[count:];count=len(allqueries)
                    for j,q in enumerate(new):
                        q.update(task=ident,agent=traj['agent'],step=action['step'],invocation=j+1,command=text,state_before=snapshot,source_state_unknown=bool(uncertain),environment_state_unknown=not q['cwd'].startswith('/testbed'),prior_environment_skips=list(skips),pre_edit=not edited)
                        q['metrics']=score_query(q,targets,files);receipt['queries'].append(q)
                    item['search_invocations']=len(new)
                    if action['search_action'] and not new:item['query_coverage_unknown']=True
                    if mutation:
                        edited=True
                        if out['exit']!=0:uncertain.append(action['step'])
                    if out['exit'] in (124,137):uncertain.append(action['step'])
                    record['actions'].append(item)
                record['final_state']=state(name)
            except Exception as error:record['error']=repr(error)
            finally:
                if name:record['cleanup_exit']=command(['docker','rm','-f',name],timeout=60).returncode
                receipt['trajectories'].append(record)
    except Exception as error:receipt['error']=repr(error)
    finally:
        if not existed:receipt['image_cleanup_exit']=command(['docker','image','rm',image],timeout=180).returncode
        write(HERE/'raw'/ident/'replay.json',receipt)
    return receipt

if __name__=='__main__':
    corpus=read(HERE/'corpus.json');assert corpus==collect(),'Corpus changed'
    ids=sys.argv[1:] or list(dict.fromkeys(t['task'] for t in corpus['trajectories']))
    for ident in ids:
        if (HERE/'raw'/ident/'replay.json').exists():print(ident,'saved receipt exists; retained',flush=True);continue
        print(ident,'replay starting; no model',flush=True);r=run_task(ident,[t for t in corpus['trajectories'] if t['task']==ident]);print(ident,'queries',len(r['queries']),'error',r.get('error'),flush=True)