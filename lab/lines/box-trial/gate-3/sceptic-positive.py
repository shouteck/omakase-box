import hashlib,json,pathlib,sys
sys.dont_write_bytecode=True
h=pathlib.Path('lab/lines/box-trial/gate-3').resolve();sys.path.insert(0,str(h))
from run import create,dispatch,command,ROOT,write
from prepare import make
ident='astropy__astropy-13033';task,scope=make(ident);d=h/'sceptic-positive-scratch';d.mkdir(exist_ok=True)
image=json.loads((ROOT/'gate-1/image-digests.json').read_text())[ident]
name=None;r={'purpose':'actual reconstructed scope positive query; no agent','scope_sha256':hashlib.sha256(json.dumps(scope,sort_keys=True).encode()).hexdigest()}
try:
 path=sorted(scope)[0];name,args=create(image,task,d);r['create_argv']=args
 result,called=dispatch(name,'box',scope,"box-search -F 'def ' "+path)
 assert called and result['exit']==0 and result['stdout'],result
 for line in result['stdout'].splitlines():
  p,n,text=line.split(':',2);assert p==path and 'def ' in text and any(a<=int(n)<=b for a,b in scope[p])
 r.update(status='pass',command="box-search -F 'def ' "+path,result=result)
finally:
 if name:r['cleanup_exit']=command(['docker','rm','-f',name],timeout=60).returncode
 write(h/'sceptic-positive-query.json',r)
print(json.dumps(r,indent=2))
