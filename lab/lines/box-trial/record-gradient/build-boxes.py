"""Prepared-image failing-test capture; one owned image and container at a time."""
import pathlib,json,subprocess,importlib.util,hashlib,uuid,gzip,shutil,time,sys
HERE=pathlib.Path(__file__).resolve().parent; ROOT=HERE.parent; REPO=HERE.parents[3]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
old=load('lab_g1b_runner',ROOT/'gate-1b/run.py')
rows=json.loads((HERE/'tasks.json').read_bytes());oldrows={r['instance_id']:r for r in json.loads((ROOT/'gate-1/tasks.json').read_bytes())}
boxes=HERE/'boxes';boxes.mkdir(exist_ok=True)
def cmd(args,timeout=1200):return subprocess.run(args,capture_output=True,timeout=timeout)
def write(path,value):path.write_bytes(json.dumps(value,indent=1).encode())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def idle():
 r=cmd(['node',str(REPO/'lab/tools/kitchen-busy.mjs')],30)
 if r.returncode or not r.stdout.startswith(b'idle '):raise RuntimeError('kitchen busy; defer heavy work')
def capture(row):
 ident=row['instance_id'];d=boxes/ident;d.mkdir(exist_ok=True)
 if (d/'attempt.json').exists():return json.loads((d/'attempt.json').read_bytes())
 record=dict(instance_id=ident,repo=row['repo'],base_commit=row['base_commit'],status='started',started=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
 previous=oldrows.get(ident)
 if previous and previous['base_commit']==row['base_commit'] and previous['test_patch']==row['test_patch']:
  src=ROOT/'gate-1/records'/ident/'sources.json.gz';trace=ROOT/'gate-1b/records'/ident/'failing.trace.json';execution=ROOT/'gate-1b/records'/ident/'execution.json'
  if src.exists() and trace.exists() and execution.exists():
   record.update(status='reused',source_path=str(src.relative_to(REPO)),trace_path=str(trace.relative_to(REPO)),execution_path=str(execution.relative_to(REPO)),source_sha256=sha(src),trace_sha256=sha(trace),execution_sha256=sha(execution))
   write(d/'attempt.json',record);return record
 image='ghcr.io/epoch-research/swe-bench.eval.x86_64.'+ident+':latest';name='lab-record-gradient-'+str(uuid.uuid4());created=False;owned=False
 record['image']=image
 try:
  if shutil.disk_usage(REPO).free<60*1024**3:raise RuntimeError('disk floor reached')
  task=old.prepare(row);task['neighbour_argv']=None;write(d/'task.json',task)
  bridge=(ROOT/'gate-1b/container.py').read_bytes().decode()
  capture_source=r"""    import gzip, tokenize
    source = {}
    for filename in subprocess.check_output(['git','ls-files','-z']).decode().split('\0'):
        if filename.endswith(('.py','.pyi')) and not any(x.startswith('.') or x=='secrets' for x in pathlib.PurePosixPath(filename).parts):
            target = pathlib.Path(filename)
            if target.is_file() and not target.is_symlink():
                try:
                    with tokenize.open(str(target)) as stream: source[filename] = stream.read()
                except (UnicodeError,SyntaxError): pass
    with gzip.open(str(OUT / 'sources.json.gz'),'wt',encoding='utf8') as stream: json.dump(source,stream)
"""
  bridge=bridge.replace("    patch = pathlib.Path('/tmp/lab-test.patch')",capture_source+"    patch = pathlib.Path('/tmp/lab-test.patch')")
  (d/'bridge.py').write_bytes(bridge.encode());record['bridge_sha256']=sha(d/'bridge.py')
  existed=cmd(['docker','image','inspect',image],30).returncode==0;record['preexisting_image']=existed
  idle();r=cmd(['docker','pull',image],1200);(d/'pull.log').write_bytes(r.stdout+r.stderr)
  if r.returncode:raise RuntimeError('image pull failed')
  owned=not existed
  info=json.loads(cmd(['docker','image','inspect',image],30).stdout)[0];record['image_id']=info['Id'];record['image_digests']=info.get('RepoDigests',[])
  if info.get('Size',0)>15*1024**3:raise RuntimeError('image working-set cap')
  idle();args=['docker','create','--name',name,'--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','4g','--cpus','2','--pids-limit','128','--mount','type=bind,src='+str((d/'bridge.py').resolve())+',dst=/lab/container.py,readonly','--mount','type=bind,src='+str((d/'task.json').resolve())+',dst=/lab/task.json,readonly','--env','PYTHONDONTWRITEBYTECODE=1','--env','MPLBACKEND=Agg','--workdir','/testbed','--entrypoint','/bin/bash',info['Id'],'-lc','source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed && python /lab/container.py']
  record['create_argv']=args;r=cmd(args,60)
  if r.returncode:raise RuntimeError('container create failed')
  created=True;r=cmd(['docker','start','-a',name],750);(d/'container.log').write_bytes(r.stdout+r.stderr);record['attach_exit']=r.returncode
  r=cmd(['docker','cp',name+':/tmp/lab-gate-1b-output/.',str(d.resolve())],60)
  if r.returncode:raise RuntimeError('capture missing')
  record.update(status='captured',source_path=str((d/'sources.json.gz').relative_to(REPO)),trace_path=str((d/'failing.trace.json').relative_to(REPO)),execution_path=str((d/'execution.json').relative_to(REPO)))
  for name2 in ['sources.json.gz','failing.trace.json','execution.json']:
   if (d/name2).exists():record[name2.split('.')[0]+'_sha256']=sha(d/name2)
 except Exception as error:record.update(status='unknown',error=str(error))
 finally:
  if created:record['container_cleanup_exit']=cmd(['docker','rm','-f',name],60).returncode
  if owned:record['image_cleanup_exit']=cmd(['docker','image','rm',image],60).returncode
  record['finished']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());write(d/'attempt.json',record)
 return record
wanted=set(sys.argv[1:]);done=[]
for row in rows:
 if wanted and row['instance_id'] not in wanted:continue
 r=capture(row);done.append(r);print(row['instance_id'],r['status'],r.get('error',''),flush=True)
 if 'disk floor' in r.get('error','') or 'kitchen busy' in r.get('error',''):break
 if len(done)>=3 and all(x.get('error')=='image pull failed' for x in done[-3:]):break
write(HERE/'box-progress.json',done)
