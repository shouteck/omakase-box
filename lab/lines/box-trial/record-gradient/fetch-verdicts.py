import pathlib,json,urllib.request,concurrent.futures,hashlib
HERE=pathlib.Path(__file__).resolve().parent;manifest=json.loads((HERE/'selection.json').read_bytes())
missing=[a for a in manifest['agents'] if not (HERE/'records'/a['folder']/'published-results.json').exists()]
receipts=[]
for a in missing:
 def get(task):
  ident=task['instance_id'];u='https://swe-bench-submissions.s3.amazonaws.com/bash-only/'+a['folder']+'/logs/'+ident+'/report.json'
  try:
   b=urllib.request.urlopen(u,timeout=45).read();x=json.loads(b);r=x.get(ident,x);return ident,r,dict(url=u,sha256=hashlib.sha256(b).hexdigest())
  except Exception as e:return ident,{},dict(url=u,error=str(e))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rs=list(pool.map(get,manifest['tasks']))
 (HERE/'records'/a['folder']/'published-results.json').write_bytes(json.dumps({ident:r for ident,r,_ in rs},indent=1).encode())
 receipts += [dict(agent=a['folder'],instance_id=i,**rec) for i,_,rec in rs]
 print(a['name'],sum(r.get('resolved') is not None for _,r,_ in rs),'verdicts',flush=True)
(HERE/'verdict-receipts.json').write_bytes(json.dumps(receipts,indent=1).encode())
