import ast,gzip,json,pathlib,re,shlex,sys
from common import command,create,capture,evaluate,execute,idle,write,ROOT,HERE
from prepare import make
ident='sphinx-doc__sphinx-10614';image=json.loads((ROOT/'gate-1/image-digests.json').read_bytes())[ident]
task,scope=make(ident);row=next(t for t in json.loads((ROOT/'gate-1/tasks.json').read_bytes()) if t['instance_id']==ident)
out=HERE/'raw/harness-v2';out.mkdir(parents=True,exist_ok=True)
record={'task':ident,'image':image,'stages':[],'status':'started','image_preexisted':command(['docker','image','inspect',image]).returncode==0}
write(HERE/'ownership.json',record)
if not record['image_preexisted']:
 idle();p=command(['docker','pull',image]);(out/'pull.log').write_bytes(p.stdout+p.stderr);assert p.returncode==0
for label in ['real-fix','empty','broken-guard']:
 d=out/label;d.mkdir(exist_ok=True);name=None
 try:
  name,args=create(image,task,d)
  if label!='empty':
   f=d/'gold-input.patch';f.write_bytes(row['patch'].encode());p=command(['docker','cp',str(f),name+':/tmp/lab-gold.patch']);assert p.returncode==0
   p=command(['docker','exec',name,'git','apply','/tmp/lab-gold.patch']);assert p.returncode==0,p.stderr
  if label=='broken-guard':
   source=json.loads(gzip.decompress((ROOT/'gate-1/records'/ident/'sources.json.gz').read_bytes()))
   text=source['sphinx/ext/inheritance_diagram.py'];tree=ast.parse(text);fn=next(x for x in ast.walk(tree) if isinstance(x,ast.FunctionDef) and x.name=='import_classes')
   script="from pathlib import Path\np=Path('sphinx/ext/inheritance_diagram.py')\ns=p.read_text();lines=s.splitlines(True);lines.insert("+str(fn.body[0].lineno-1)+", '    raise ValueError(\"LAB_GUARD_BREAK\")\\n');p.write_text(''.join(lines))"
   r=execute(name,{'mode':'command','command':shlex.join(['python','-c',script])});assert r['exit']==0,r
  patch=capture(name,d)
  assert bool(patch)==(label!='empty')
  command(['docker','rm','-f',name]);name=None
  result=evaluate(image,task,patch,d)
  assert result['status']=='scored' and result['solved']==(label=='real-fix'),result
  if label=='broken-guard':assert not result['phases']['guards']['all_pass']
  record['stages'].append({'label':label,'evaluation':result,'exported_patch_bytes':len(patch.encode())})
  write(HERE/'harness.json',record);print(label,result['solved'],flush=True)
 finally:
  if name:command(['docker','rm','-f',name])
record['status']='pass';write(HERE/'harness.json',record)
print('HARNESS_PASS',flush=True)
