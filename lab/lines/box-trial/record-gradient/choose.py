import pathlib,json,hashlib,urllib.request,collections,re
HERE=pathlib.Path(__file__).resolve().parent
metadata=json.loads((HERE/'leaderboard-metadata.json').read_bytes())
entries=[r for r in metadata['entries'] if re.match(r'^\d{8}_mini-v',r.get('folder','')) and r.get('trajs') and r.get('mini-swe-agent_version')]
groups=collections.defaultdict(list)
for r in entries:groups[r['mini-swe-agent_version']].append(r)
cohorts=[(max(r['resolved'] for r in rs)-min(r['resolved'] for r in rs),len(rs),v,rs) for v,rs in groups.items() if len(rs)>=6]
span,size,version,rs=sorted(cohorts,key=lambda z:(-z[0],-z[1],z[2]))[0]
rs=sorted(rs,key=lambda r:(-r['resolved'],r['folder']));agents=[rs[round(i*(len(rs)-1)/5)] for i in range(6)]
raw=HERE/'raw';raw.mkdir(exist_ok=True);rows=[];receipts=[]
for offset in range(0,500,100):
 url='https://datasets-server.huggingface.co/rows?dataset=princeton-nlp%2FSWE-bench_Verified&config=default&split=test&offset='+str(offset)+'&length=100'
 b=urllib.request.urlopen(url,timeout=90).read();(raw/('dataset-'+str(offset)+'.json')).write_bytes(b)
 rows += [z['row'] for z in json.loads(b)['rows']];receipts.append(dict(url=url,sha256=hashlib.sha256(b).hexdigest(),bytes=len(b)))
assert len(rows)==500
by=collections.defaultdict(list)
for r in rows:by[r['repo']].append(r)
for repo in by:by[repo].sort(key=lambda r:hashlib.sha256(('box-room-2026-10-09'+r['instance_id']).encode()).hexdigest())
chosen=[];counts=collections.Counter()
while len(chosen)<150:
 repo=min((r for r in by if counts[r]<len(by[r])),key=lambda r:(counts[r],r))
 chosen.append(by[repo][counts[repo]]);counts[repo]+=1
chosen.sort(key=lambda r:(by[r['repo']].index(r),r['repo']))
(HERE/'tasks.json').write_bytes(json.dumps(chosen,indent=1).encode())
manifest=dict(agents=agents,version=version,rate_span=span,tasks=[dict(instance_id=r['instance_id'],repo=r['repo'],base_commit=r['base_commit']) for r in chosen],projects=dict(counts),dataset_receipts=receipts,metadata_sha256=hashlib.sha256((HERE/'leaderboard-metadata.json').read_bytes()).hexdigest(),tasks_sha256=hashlib.sha256((HERE/'tasks.json').read_bytes()).hexdigest())
(HERE/'selection.json').write_bytes(json.dumps(manifest,indent=2).encode());print(json.dumps(dict(version=version,agents=[(r['name'],r['resolved']) for r in agents],projects=dict(counts),tasks=len(chosen)),ensure_ascii=True))
