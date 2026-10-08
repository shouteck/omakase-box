"""Replay actual delivered Box promotions vs unwrapped native commands."""
import base64,collections,hashlib,json,pathlib,sys,uuid
ROOT=pathlib.Path(__file__).resolve().parent.parent;HERE=ROOT/sys.argv[1]
sys.path.insert(0,str(HERE))
from common import create,execute,command,ACTIVATE
from prepare import make
read=lambda p:json.loads(p.read_bytes())
ident=read(HERE/'config.json')['task'];task,_=make(ident);image=read(ROOT/'gate-1/image-digests.json')[ident]
steps=read(HERE/'raw/runs/box/steps.json');selected=[s for s in steps if s['result']['moved_up']]
d=HERE/'raw/review'/('actual-promoted-replay-'+str(uuid.uuid4()));d.mkdir(parents=True)
name=None;receipt={'task':ident,'directory':str(d),'steps':[]}
try:
 name,args=create(image,task,d);receipt['create_argv']=args
 for s in selected:
  wrapped=execute(name,{'mode':'command','command':s['command'],'arm':'box'})
  native=command(['docker','exec',name,'/bin/bash','-lc',ACTIVATE+s['command']])
  assert native.returncode==wrapped['exit']==s['result']['exit']
  assert native.stdout==base64.b64decode(wrapped['native_stdout_b64'])
  stderr_equal=native.stderr==base64.b64decode(wrapped['native_stderr_b64'])
  assert wrapped['shown_stdout_b64']==s['result']['shown_stdout_b64']
  assert wrapped['moved_up']==s['result']['moved_up']
  assert collections.Counter(native.stdout.splitlines(keepends=True))==collections.Counter(base64.b64decode(wrapped['shown_stdout_b64']).splitlines(keepends=True))
  sources={}
  for move in wrapped['moved_up']:
   source=command(['docker','exec',name,'cat','/testbed/'+move['path']]);assert source.returncode==0
   h=hashlib.sha256(source.stdout).hexdigest();assert h==move['source_sha256']
   target=d/(move['path'].replace('/','__')+'.source');target.write_bytes(source.stdout);sources[move['path']]=h
  output={'wrapped':wrapped,'native_exit':native.returncode,'native_stdout_b64':base64.b64encode(native.stdout).decode(),'native_stderr_b64':base64.b64encode(native.stderr).decode(),'source_sha256':sources}
  path=d/('step-'+str(s['step'])+'.json');path.write_text(json.dumps(output,indent=2),encoding='utf-8')
  receipt['steps'].append({'step':s['step'],'receipt':str(path),'receipt_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'matched_saved_promotions':True,'native_stdout_exit_equal':True,'native_stderr_equal':stderr_equal,'native_stderr_bytes':len(native.stderr),'wrapped_stderr_bytes':len(base64.b64decode(wrapped['native_stderr_b64']))})
finally:
 if name:receipt['cleanup_exit']=command(['docker','rm','-f',name]).returncode
(ROOT/'live-three'/('review-replay-'+ident+'.json')).write_text(json.dumps(receipt,indent=2),encoding='utf-8')
assert receipt.get('cleanup_exit')==0
print(json.dumps(receipt,indent=2))
