import pathlib,json,hashlib,urllib.request,urllib.error,concurrent.futures,time
HERE=pathlib.Path(__file__).resolve().parent
manifest=json.loads((HERE/'selection.json').read_bytes());records=HERE/'records';records.mkdir(exist_ok=True)
def get(url):
 for i in range(3):
  try:return urllib.request.urlopen(url,timeout=60).read(),None
  except urllib.error.HTTPError as e:
   if e.code in [403,404]:return None,str(e)
   error=str(e)
  except Exception as e:error=str(e)
 return None,error
def download(args):
 agent,task=args;ident=task['instance_id'];folder=agent['folder'];d=records/folder;d.mkdir(exist_ok=True);path=d/(ident+'.traj.json')
 # Official assets have two stale URLs: mixed-case Qwen3 prefix and Qwen2 root instead of trajs. Canonical listed folder fixes location, not model selection.
 url='https://swe-bench-submissions.s3.amazonaws.com/bash-only/'+folder+'/trajs/'+ident+'/'+ident+'.traj.json'
 data,error=(path.read_bytes(),None) if path.exists() else get(url)
 receipt=dict(agent=folder,instance_id=ident,url=url,present=data is not None,error=error)
 if data is not None:
  if not path.exists():path.write_bytes(data)
  receipt.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
 return receipt
receipts=[]
for a in manifest['agents']:
 url='https://raw.githubusercontent.com/SWE-bench/experiments/main/evaluation/verified/'+a['folder']+'/per_instance_details.json'
 b,e=get(url);d=records/a['folder'];d.mkdir(exist_ok=True)
 if b:(d/'published-results.json').write_bytes(b)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for r in pool.map(download,[(a,t) for t in manifest['tasks'] for a in manifest['agents']]):
  receipts.append(r)
  if len(receipts)%60==0:print('records',len(receipts),'present',sum(x['present'] for x in receipts),flush=True)
  if sum(x.get('bytes',0) for x in receipts)>2*1024**3:raise RuntimeError('raw resource cap')
(HERE/'record-receipts.json').write_bytes(json.dumps(receipts,indent=1).encode());print('complete',len(receipts),sum(r['present'] for r in receipts))
