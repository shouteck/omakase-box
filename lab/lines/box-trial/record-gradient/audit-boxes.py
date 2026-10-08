"""Independent task capture/provenance census after sequential builder stops."""
import pathlib,json,hashlib,collections,gzip,shutil,subprocess,statistics
from instrument import inputs
HERE=pathlib.Path(__file__).resolve().parent;REPO=HERE.parents[3]
selected=json.loads((HERE/'tasks.json').read_bytes());rows=[]
for task in selected:
 ident=task['instance_id'];path=HERE/'boxes'/ident/'attempt.json';row=dict(instance_id=ident,repo=task['repo'],attempted=path.exists())
 if path.exists():
  a=json.loads(path.read_bytes());row.update(status=a['status'],error=a.get('error'),capture_started=a.get('started'),capture_finished=a.get('finished'),image=a.get('image'),image_id=a.get('image_id'),container_cleanup_exit=a.get('container_cleanup_exit'),image_cleanup_exit=a.get('image_cleanup_exit'),reused=a.get('status')=='reused')
  try:
   bundle=inputs(task)
   if bundle:
    source,ev,trees,target,files,_=bundle;execution=json.loads((REPO/a['execution_path']).read_bytes());production_bytes=sum(len(source[p].encode()) for p in trees)
    union={}
    for p,start in ev.called:
     r=next((z for z in trees.get(p,[]) if z['start']==start),None)
     if r:union.setdefault(p,set()).update(range(r['start'],r['end']+1))
    line_sizes={p:[len(z.encode()) for z in source[p].splitlines(keepends=True)] for p in union}
    called_bytes=sum(line_sizes[p][n-1] for p,ns in union.items() for n in ns)
    row.update(valid_box=ev.valid,function_target=bool(target),target_in_box=bool(target&ev.called) if ev.valid and target else None,all_target_functions_in_box=target<=ev.called if ev.valid and target else None,production_source_bytes=production_bytes,called_source_bytes=called_bytes,box_share=called_bytes/production_bytes if production_bytes else None,called_functions=len(ev.called),ambiguous_trace_keys=len(ev.unknown),phases=execution.get('phases'),base_matches=execution.get('base_commit')==task['base_commit'],source_sha256=hashlib.sha256((REPO/a['source_path']).read_bytes()).hexdigest(),trace_sha256=hashlib.sha256((REPO/a['trace_path']).read_bytes()).hexdigest(),execution_sha256=hashlib.sha256((REPO/a['execution_path']).read_bytes()).hexdigest())
   else:row['valid_box']=False
  except Exception as e:row.update(valid_box=False,instrument_error=str(e))
 rows.append(row)
raw_bytes={d:sum(f.stat().st_size for f in (HERE/d).rglob('*') if f.is_file()) for d in ['raw','records','boxes']}
owned_images={r['image'] for r in rows if r.get('image')};names=subprocess.run(['docker','ps','-a','--filter','name=lab-record-gradient-','--format','{{.Names}}'],capture_output=True,text=True)
listing=subprocess.run(['docker','image','ls','--format','{{.Repository}}:{{.Tag}}'],capture_output=True,text=True)
med=lambda x:statistics.median(x) if x else None
out=dict(selected=150,attempted=sum(r['attempted'] for r in rows),valid_boxes=sum(r.get('valid_box',False) for r in rows),rows=rows,capture_status=dict(collections.Counter(r.get('status','not attempted') for r in rows)),by_project={repo:dict(selected=sum(r['repo']==repo for r in rows),attempted=sum(r['repo']==repo and r['attempted'] for r in rows),valid=sum(r['repo']==repo and r.get('valid_box',False) for r in rows)) for repo in sorted({r['repo'] for r in rows})},box_share_median=med([r['box_share'] for r in rows if r.get('valid_box')]),raw_bytes=raw_bytes,raw_cap_2GiB_respected=sum(raw_bytes.values())<=2*1024**3,free_GiB=shutil.disk_usage(REPO).free/2**30,owned_containers_remaining=names.stdout.splitlines(),selected_image_refs_remaining=sorted(owned_images&set(listing.stdout.splitlines())),resource_inspection_exit=[names.returncode,listing.returncode])
(HERE/'box-audit.json').write_bytes(json.dumps(out,indent=2).encode());print(json.dumps({k:v for k,v in out.items() if k not in ['rows']},indent=1))
