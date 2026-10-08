"""Native end-to-end fixture checks: command compatibility and record conservation."""
import collections,json,pathlib,subprocess,sys
from replay import HERE,ROOT,read,write,sha,command,idle,create,execute,logs,scope_of

def check():
    ident=read(ROOT/'gate-3/selection.json')['tasks'][0]['instance_id'];image=read(ROOT/'gate-1/image-digests.json')[ident]
    existed=command(['docker','image','inspect',image],timeout=30).returncode==0;name=None
    report={'task_image':ident,'image':image,'preexisted':existed,'cases':[]}
    scratch=HERE/'scratch'/'fixture';scratch.mkdir(parents=True,exist_ok=True)
    sample='def ordinary():\n    needle = 1\n    return needle\n\ndef boxed():\n    needle = 2\n    return needle\n'
    fixture=scratch/'sample.py';fixture.write_bytes(sample.encode())
    try:
        if not existed:
            idle();p=command(['docker','pull',image]);assert p.returncode==0
        task,_=scope_of(ident);name,created=create(image,ident,'fixture',scratch,{'lab-gate-3b-fixture/sample.py':['boxed']},task,fixture=True);report.update(created)
        assert command(['docker','exec',name,'mkdir','-p','/testbed/lab-gate-3b-fixture']).returncode==0
        assert command(['docker','cp',str(fixture),name+':/testbed/lab-gate-3b-fixture/sample.py']).returncode==0
        assert command(['docker','exec',name,'git','add','lab-gate-3b-fixture/sample.py']).returncode==0
        f='lab-gate-3b-fixture/sample.py'
        cases=[('single','grep -n needle '+f),('recursive','grep -Rn needle lab-gate-3b-fixture'),('absolute','cd /tmp && grep -n needle /testbed/'+f),('plain','grep needle '+f),('context','grep -n -C 1 "needle =" '+f),('compound','cd /testbed && grep -n needle '+f+' && grep -n missing '+f+' || true'),('head','grep -n needle '+f+' | head -1'),('stdin','printf "needle\\nother\\n" | grep -n needle'),('git','git grep -n needle -- '+f),('find','find lab-gate-3b-fixture -name "*.py"'),('count','grep -c needle '+f),('file-list','grep -l needle '+f),('no-match','grep -n absent '+f),('bad-regex','grep -n "[" '+f),('bad-path','grep -n needle /testbed/absent'),('native-missing','rg -n needle '+f)]
        for label,text in cases:
            before=len(logs(name));ordinary=execute(name,text,'ordinary');oq=logs(name)[before:];before=len(logs(name));box=execute(name,text,'box');bq=logs(name)[before:]
            assert ordinary['exit']==box['exit'] and ordinary['stderr_sha256']==box['stderr_sha256'],label
            assert len(oq)==len(bq)>0,label
            for a,b in zip(oq,bq):
                assert a['native_sha256']==b['native_sha256'] and a['exit']==b['exit'] and a['stderr_sha256']==b['stderr_sha256'] and b['proof']['same_records'],label
            report['cases'].append({'label':label,'command':text,'status':'pass','ordinary':ordinary,'box':box,'queries':bq})
        positive=report['cases'][0]['queries'][0];assert positive['proof']['marked'] and positive['proof']['order'][0]==positive['proof']['marked'][0]
        report['status']='pass'
    finally:
        if name:report['container_cleanup_exit']=command(['docker','rm','-f',name],timeout=60).returncode
        # Keep a newly pulled image for immediate corpus replay; replay closeout
        # records its ownership explicitly before removal.
        report['retained_owned_image']=image if not existed else None
        write(HERE/'fixture-check.json',report)
    return report
if __name__=='__main__':r=check();print(json.dumps({'status':r.get('status'),'cases':len(r['cases']),'retained_owned_image':r.get('retained_owned_image')}))