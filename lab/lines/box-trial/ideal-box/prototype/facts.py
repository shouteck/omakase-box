"""One real bounded example; no production patch or model."""
import base64,gzip,hashlib,json,pathlib,subprocess,sys,time,uuid
from adapter import Evidence,sha
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];REPO=HERE.parents[4]
def read(p):return json.loads(p.read_bytes())
def write(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(json.dumps(x,indent=2).encode())
def command(a,timeout=60):return subprocess.run(a,capture_output=True,timeout=timeout)
def idle():
    p=command(['node',str(REPO/'lab/tools/kitchen-busy.mjs')])
    assert p.returncode==0 and p.stdout.startswith(b'idle '),'Kitchen busy'
def main():
    ident='django__django-12193';task=read(ROOT/'gate-1b/records'/ident/'task.json');image=read(ROOT/'gate-1/image-digests.json')[ident]
    scratch=HERE/'scratch/facts';scratch.mkdir(parents=True,exist_ok=True)
    patch=scratch/'test.patch';patch.write_bytes(task['test_patch'].encode())
    existed=command(['docker','image','inspect',image]).returncode==0
    receipt={'task':ident,'image':image,'image_preexisted':existed,'collector_sha256':sha((HERE/'collector.py').read_bytes()),'phases':[]}
    name='lab-ideal-box-'+str(uuid.uuid4());created=False
    write(HERE/'facts-ownership.json',dict(receipt,container=name))
    try:
        if not existed:
            idle();p=command(['docker','pull',image],1800);receipt['pull_exit']=p.returncode;assert p.returncode==0,p.stderr
        idle()
        argv=['docker','create','--name',name,'--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','4g','--cpus','2','--pids-limit','128','--env','PYTHONDONTWRITEBYTECODE=1',
          '--mount','type=bind,src='+str((HERE/'collector.py').resolve())+',dst=/lab/collector.py,readonly','--workdir','/testbed','--entrypoint','/bin/bash',image,'-lc','sleep infinity']
        p=command(argv);assert p.returncode==0,p.stderr;created=True;receipt['create_argv']=argv
        assert command(['docker','start',name]).returncode==0
        head=command(['docker','exec',name,'git','rev-parse','HEAD']).stdout.decode().strip();assert head==task['base_commit'];receipt['base_head']=head
        assert command(['docker','cp',str(patch),name+':/tmp/lab-test.patch']).returncode==0
        p=command(['docker','exec',name,'git','apply','/tmp/lab-test.patch']);assert p.returncode==0,p.stderr
        for mode in ['plain','ordered']:
            idle();start=time.monotonic()
            shell='source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed && exec timeout -k 3 60 python /lab/collector.py "$@"'
            p=command(['docker','exec',name,'/bin/bash','-lc',shell,'lab-facts',mode]+task['failing_argv'],75)
            out=HERE/'raw/facts';out.mkdir(parents=True,exist_ok=True)
            (out/(mode+'.log')).write_bytes(p.stdout+p.stderr)
            receipt['phases'].append({'mode':mode,'exit':p.returncode,'seconds':time.monotonic()-start,'stdout_sha256':sha(p.stdout),'stderr_sha256':sha(p.stderr)})
            assert p.returncode==1,'Expected known failing test, got '+str(p.returncode)
        datafile=HERE/'raw/facts/ordered.json'
        assert command(['docker','cp',name+':/tmp/lab-ideal-box-facts/ordered.json',str(datafile)]).returncode==0
        data=read(datafile);assert not data['cap_hit']
        ev=Evidence(data['sources'],data['calls'])
        file='django/forms/widgets.py';answer=ev.file_answer(file)
        events=data['events']
        assert any(x['event']=='call' and x['name']==data['target'] for x in events)
        assert any(x['event']=='exception' and x.get('exception_type')=='AssertionError' for x in events)
        # Preserve real sequence, including returns; no fictional call chain from a set.
        selected=[x for x in events if x['name']==data['target'] or (x['path']==file and x['name']=='get_context')]
        route='\n'.join('%s %s:%s %s%s'%(x['event'],x['path'],x['line'],x['name'],' '+x['exception_type'] if x['event']=='exception' else '') for x in selected)+'\n'
        receipt['raw']={'path':str(datafile.relative_to(HERE)),'sha256':sha(datafile.read_bytes()),'bytes':datafile.stat().st_size}
        receipt['events']=len(events);receipt['calls']=len(data['calls']);receipt['target']=data['target']
        receipt['file_answer']=answer;receipt['file_answer_bytes']=len(answer.encode())
        receipt['route_answer']=route;receipt['route_answer_bytes']=len(route.encode());receipt['omitted_events']=len(events)-len(selected)
        receipt['facts_instruction_bytes']=0;receipt['status']='pass'
        write(HERE/'facts.json',receipt)
        print(json.dumps({k:receipt[k] for k in ['status','events','calls','file_answer_bytes','route_answer_bytes']}))
    finally:
        if created:receipt['container_cleanup_exit']=command(['docker','rm','-f',name]).returncode
        if not existed:receipt['owned_image_cleanup_exit']=command(['docker','image','rm',image],180).returncode
        write(HERE/'facts-closeout.json',receipt)
if __name__=='__main__':main()
