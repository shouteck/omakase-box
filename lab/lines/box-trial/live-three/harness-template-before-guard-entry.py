"""Per-task zero-agent gold/empty/production guard mutation checks."""
import ast,gzip,json,re,shlex
from common import HERE,ROOT,command,create,capture,evaluate,execute,idle,write
from prepare import make
ident=json.loads((HERE/'config.json').read_bytes())['task'];task,_=make(ident)
image=json.loads((ROOT/'gate-1/image-digests.json').read_bytes())[ident]
row=next(t for t in json.loads((ROOT/'gate-1/tasks.json').read_bytes()) if t['instance_id']==ident)
out=HERE/'raw/harness';out.mkdir(parents=True,exist_ok=False)
record={'task':ident,'image':image,'stages':[],'status':'started','image_preexisted':command(['docker','image','inspect',image]).returncode==0};write(HERE/'ownership.json',record)
try:
 if not record['image_preexisted']:
  idle();p=command(['docker','pull',image]);(out/'pull.log').write_bytes(p.stdout+p.stderr);assert p.returncode==0
 for label in ['real-fix','empty','broken-guard']:
  d=out/label;d.mkdir();name=None
  try:
   name,args=create(image,task,d);write(d/'create.json',args)
   if label!='empty':
    f=d/'gold-input.patch';f.write_bytes(row['patch'].encode());p=command(['docker','cp',str(f),name+':/tmp/lab-gold.patch']);assert p.returncode==0
    p=command(['docker','exec',name,'git','apply','/tmp/lab-gold.patch']);assert p.returncode==0,p.stderr
   if label=='broken-guard':
    trace=json.loads((ROOT/'gate-1b/records'/ident/'neighbours.trace.json').read_bytes())
    goldfiles=re.findall(r'^\+\+\+ b/(.+)$',row['patch'],re.M)
    choices=sorted(trace.items(),key=lambda x:(x[0].rsplit(':',1)[0] not in goldfiles,x[1][0]))
    for key,(_,fnname) in choices:
     path,line=key.rsplit(':',1)
     if fnname.startswith('<') or not path.endswith('.py') or any(part in ['test','tests','docs','examples','benchmarks'] or part.startswith('.') for part in path.split('/')):continue
     p=command(['docker','exec',name,'cat',path])
     if p.returncode:continue
     source=p.stdout.decode();tree=ast.parse(source)
     functions=[f for f in ast.walk(tree) if isinstance(f,(ast.FunctionDef,ast.AsyncFunctionDef)) and f.name==fnname]
     if len(functions)!=1:continue
     fn=functions[0];body=fn.body[0]
     lines=source.splitlines(True);lines.insert(body.lineno-1,' '*body.col_offset+'raise ValueError("LAB_GUARD_BREAK")\n')
     patched=''.join(lines);ast.parse(patched)
     f=d/'guard-source.py';f.write_bytes(patched.encode());p=command(['docker','cp',str(f),name+':/testbed/'+path]);assert p.returncode==0
     write(d/'guard-identity.json',{'path':path,'name':fnname,'historical_code_start':int(line),'current_definition':fn.lineno,'injected_line':body.lineno});break
    else:raise RuntimeError('No uniquely parsed production guard callable')
   patch=capture(name,d);assert bool(patch)==(label!='empty')
   assert command(['docker','rm','-f',name]).returncode==0;name=None
   result=evaluate(image,task,patch,d)
   record['stages'].append({'label':label,'status':result['status'],'solved':result['solved'],'phases':{k:{a:v.get(a) for a in ['all_pass','requested','matched_passes','exit']} for k,v in result['phases'].items()},'error':result.get('error'),'exported_patch_bytes':len(patch.encode())});write(HERE/'harness.json',record)
   assert result['status']=='scored' and result['solved']==(label=='real-fix'),record['stages'][-1]
   if label=='broken-guard':assert not result['phases']['guards']['all_pass']
   print(label,result['solved'],flush=True)
  finally:
   if name:command(['docker','rm','-f',name])
 record['status']='pass'
except Exception as e:
 record['status']='failed';record['error']=str(e);raise
finally:write(HERE/'harness.json',record)
print('HARNESS_PASS',flush=True)
