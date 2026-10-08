import base64,gzip,json,pathlib,copy
import measure
from adapter import Evidence,present,sha
H=measure.HERE; R=measure.ROOT
original=(H/'summary-before-sceptic.json').read_bytes()
report=copy.deepcopy(json.loads(original));report['native_invocations']=[]
tasks={t['instance_id']:t for t in measure.read(R/'gate-1/tasks.json')}
for row in report['tasks']:
    ident=row['task'];source=measure.sources(ident);e,trace=measure.evidence(ident,source)
    keys=measure.targets(tasks[ident],source)
    assert row['source_snapshot_sha256']==sha((R/'gate-1/records'/ident/'sources.json.gz').read_bytes())
    for index,q in enumerate(row['queries']):
        receipt=q['receipt'];blob=(H/receipt['path']).read_bytes();assert sha(blob)==receipt['sha256']
        data=json.loads(gzip.decompress(blob));raw=base64.b64decode(data['stdout_b64'])
        assert sha(raw)==q['native_sha256']
        shown,proof=present(raw,'rg',data['argv'][1:],e)
        q['metrics']=measure.metrics(raw,shown,proof,e,keys);q['shown_sha256']=sha(shown)
        q['original_receipt']=receipt;q['presentation_rechecked']=True
        data['shown_b64']=base64.b64encode(shown).decode();data['proof']=proof
        blob=gzip.compress(json.dumps(data,ensure_ascii=True).encode(),mtime=0)
        path=H/'raw/rechecked'/ident/('%03d.json.gz'%index);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(blob)
        q['receipt']={'path':str(path.relative_to(H)),'sha256':sha(blob),'bytes':len(blob)}
    replay=R/'gate-3b/raw'/ident/'replay.json'
    if replay.exists():
        for q in measure.read(replay)['queries']:
            raw=base64.b64decode(q['stdout_b64']);ev=e
            if q['source_state_unknown'] or q['environment_state_unknown']:ev=Evidence({}, {},False)
            shown,proof=present(raw,q['tool'],q['args'],ev,q['locations'],root='/testbed',cwd=q['cwd'])
            m=measure.metrics(raw,shown,proof,ev,keys)
            report['native_invocations'].append({'task':ident,'agent':q['agent'],'step':q['step'],'invocation':q['invocation'],'tool':q['tool'],'args':q['args'],
                'native_sha256':sha(raw),'shown_sha256':sha(shown),'metrics':m,'source_state_unknown':q['source_state_unknown'],'environment_state_unknown':q['environment_state_unknown'],
                'trace_valid':e.valid,'format':proof['format'],'stale_locations':sum(r.get('source_sha256') is not None and r['source_sha256']!=e.digests.get(r['path']) for r in q['locations'])})
    row['aggregate']=measure.aggregate(row['queries'])
    print(json.dumps({'task':ident,'queries':len(row['queries']),'marks':row['aggregate']['marks']}),flush=True)
report['literal_total']=measure.aggregate([q for t in report['tasks'] for q in t['queries']])
report['retained_native_total']=measure.aggregate(report['native_invocations'])
old=json.loads(original)
assert [q['native_sha256'] for q in report['native_invocations']]==[q['native_sha256'] for q in old['native_invocations']]
report['original_instrument_sha256']=old['instrument_sha256']
report['recheck']={'original_summary_sha256':sha(original),'native_streams_reexecuted':False,'original_seconds_retained':True,'reason':'Mandatory sceptic multiline and filename identity guards; all frozen streams re-presented.'}
report['instrument_sha256']={n:sha((H/n).read_bytes()) for n in ['adapter.py','measure.py','recheck.py']}
measure.write(H/'summary.json',report)
print(json.dumps({'literal':report['literal_total'],'retained_native':report['retained_native_total']}))
