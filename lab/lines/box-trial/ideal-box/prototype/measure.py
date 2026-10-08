"""Check thirty frozen snapshots and all retained native invocations; no project execution."""
import base64, collections, gzip, hashlib, importlib.util, json, pathlib, shutil, statistics, sys, time
from adapter import Evidence,present,sha,MARK
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[1]
read=lambda p:json.loads(p.read_bytes())
def write(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(json.dumps(x,indent=2,ensure_ascii=True).encode())
def sources(ident):return json.loads(gzip.decompress((ROOT/'gate-1/records'/ident/'sources.json.gz').read_bytes()))
spec=importlib.util.spec_from_file_location('old_g1b',ROOT/'gate-1b/measure.py')
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
def evidence(ident,source):
    p=ROOT/'gate-1b/records'/ident
    trace=read(p/'failing.trace.json') if (p/'failing.trace.json').exists() else {}
    execution=read(p/'execution.json') if (p/'execution.json').exists() else {}
    phase=execution.get('phases',{}).get('failing',{})
    valid=bool(trace) and not phase.get('timed_out',True)
    if trace:
        attempt=read(p/'attempt.json')
        assert sha((p/'failing.trace.json').read_bytes())==attempt['artifacts']['failing.trace.json']
        assert sha((p/'execution.json').read_bytes())==attempt['artifacts']['execution.json']
    if (p/'measurement.json').exists(): valid=valid and read(p/'measurement.json').get('scoreable',False)
    task=read(p/'task.json') if (p/'task.json').exists() else {}
    excluded=__import__('re').findall(r'^\+\+\+ b/(.+)$',task.get('test_patch',''),__import__('re').M)
    return Evidence(source,trace,valid,excluded),trace

def targets(task,source):
    trees={}
    for p,text in source.items():
        if old.production(p):
            try:trees[p]=old.functions(text)
            except (SyntaxError,ValueError,RecursionError):pass
    keys,files=old.targets(task,source,trees)
    return keys
def metrics(raw,shown,proof,e,keys):
    lines=raw.splitlines(keepends=True);order=proof['order'];marked=set(proof['marked'])
    loc=proof['locations'];wanted=set()
    for r in loc:
        if r.get('is_match') and r.get('line'):
            hit=e.locate(r['path'],r['line'],r.get('source_sha256'))
            if hit and (r['path'],hit['start']) in keys:wanted.add(r['ordinal'])
        if r.get('priority'):
            # Direct identity membership, never qualified-name selection.
            assert (r['path'],r['function_start']) in e.called
            assert r['source_sha256']==e.digests.get(r['path'])
    def pos(seq):return next((j+1 for j,i in enumerate(seq) if i in wanted),None)
    def before(seq):
        p=pos(seq)
        return sum(len(lines[i]) for i in seq[:p-1]) if p is not None else None
    a,b=pos(range(len(lines))),pos(order);ab,bb=before(list(range(len(lines)))),before(order)
    restored=[x[len(MARK):] if i in marked else x for i,x in zip(order,shown.splitlines(keepends=True))]
    assert collections.Counter(restored)==collections.Counter(lines)
    return {'ordinary_first':a,'box_first':b,'ordinary_prefix_bytes':ab,'box_prefix_bytes':bb,'potential_prefix_saved_bytes':ab-bb if ab is not None else None,
      'mark_count':len(marked),'mark_bytes':len(MARK)*len(marked),'native_bytes':len(raw),'shown_bytes':len(shown),'instruction_bytes':0,'all_records_preserved':True,
      'net_potential_bytes':ab-bb-len(MARK)*len(marked) if ab is not None else None}
def aggregate(rows):
    reaching=[r for r in rows if r['metrics']['ordinary_first'] is not None]
    return {'queries':len(rows),'reaching':len(reaching),'marks':sum(r['metrics']['mark_count'] for r in rows),
      'mark_bytes':sum(r['metrics']['mark_bytes'] for r in rows),'native_bytes':sum(r['metrics']['native_bytes'] for r in rows),
      'potential_saved_bytes':sum(r['metrics']['potential_prefix_saved_bytes'] or 0 for r in rows),
      'net_potential_bytes':sum(r['metrics']['potential_prefix_saved_bytes'] or 0 for r in rows)-sum(r['metrics']['mark_bytes'] for r in rows),
      'rank_wins':sum(r['metrics']['box_first']<r['metrics']['ordinary_first'] for r in reaching),
      'rank_losses':sum(r['metrics']['box_first']>r['metrics']['ordinary_first'] for r in reaching),
      'all_records_preserved':all(r['metrics']['all_records_preserved'] for r in rows)}
def main():
    args=sys.argv[1:];output=HERE
    if args and args[0].startswith('--output='):output=HERE/args.pop(0).split('=',1)[1];output.resolve().relative_to(HERE.resolve())
    tasks=[t for t in read(ROOT/'gate-1/tasks.json') if not args or t['instance_id'] in args]
    rg=shutil.which('rg');assert rg,'Native rg unavailable'
    report={'tasks':[],'native_invocations':[],'rg':rg,'rg_version':__import__('subprocess').check_output([rg,'--version']).decode(),'limits':[
      'Thirty-task literal searches use stored Python-source snapshots, not complete prepared repositories.',
      'Retained native invocations are re-annotated, not re-executed; captured source hashes and unknown flags gate marks.',
      'Historical target rank and inspected-prefix bytes are navigation proxies, not repair or actual model-input savings.',
      'Matched statement need not execute: a mark means membership in a called function.',
      'Patched test files, pseudo-functions and exact-identity unknowns are unmarked.',
      'Native final-display semantics preserve pipelines; saved invocation projection precedes historic downstream filters.'
    ]}
    for task in tasks:
        ident=task['instance_id'];source=sources(ident);e,trace=evidence(ident,source)
        # Gold is used only after evidence construction.
        keys=targets(task,source)
        row={'task':ident,'valid_trace':e.valid,'called_definitions':len(e.called),'identity_unknowns':len(e.unknown),'excluded_patched_files':sorted(e.excluded),'queries':[]}
        p=ROOT/'gate-1b/records'/ident/'measurement.json'
        words=[x['word'] for x in read(p).get('words',[])] if p.exists() else []
        if not words:
            # Same fixed issue identifier rule, not an adaptive new search.
            words=old.code_words(task['problem_statement'])[:old.CAP_WORDS]
            row['words_from']='issue fallback because previous measurement unavailable'
        scratch=output/'scratch'/ident;scratch.mkdir(parents=True,exist_ok=True)
        for path,text in source.items():
            f=scratch/path;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(text.encode('utf-8'))
        for index,word in enumerate(words):
            argv=[rg,'-n','--with-filename','--no-heading','--color','never','--no-ignore','--hidden','-F','-e',word,'.']
            start=time.monotonic()
            p=__import__('subprocess').run(argv,cwd=scratch,capture_output=True);elapsed=time.monotonic()-start
            assert p.returncode in (0,1),p.stderr
            shown,proof=present(p.stdout,'rg',argv[1:],e)
            m=metrics(p.stdout,shown,proof,e,keys)
            data={'argv':argv,'exit':p.returncode,'stderr_b64':base64.b64encode(p.stderr).decode(),'stdout_b64':base64.b64encode(p.stdout).decode(),
                  'shown_b64':base64.b64encode(shown).decode(),'proof':proof}
            blob=gzip.compress(json.dumps(data,ensure_ascii=True).encode(),mtime=0)
            file=output/'raw'/ident/('%03d.json.gz'%index);file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(blob)
            row['queries'].append({'word':word,'exit':p.returncode,'seconds':round(elapsed,6),'native_sha256':sha(p.stdout),'shown_sha256':sha(shown),
                  'metrics':m,'receipt':{'path':str(file.relative_to(output)),'sha256':sha(blob),'bytes':len(blob)}})
        replay=ROOT/'gate-3b/raw'/ident/'replay.json'
        if replay.exists():
            for index,q in enumerate(read(replay)['queries']):
                raw=base64.b64decode(q['stdout_b64'])
                ev=e
                if q['source_state_unknown'] or q['environment_state_unknown']:
                    ev=Evidence({}, {},False)
                shown,proof=present(raw,q['tool'],q['args'],ev,q['locations'],root='/testbed',cwd=q['cwd'])
                m=metrics(raw,shown,proof,ev,keys)
                report['native_invocations'].append({'task':ident,'agent':q['agent'],'step':q['step'],'invocation':q['invocation'],'tool':q['tool'],'args':q['args'],
                    'native_sha256':sha(raw),'shown_sha256':sha(shown),'metrics':m,'source_state_unknown':q['source_state_unknown'],'environment_state_unknown':q['environment_state_unknown'],
                    'trace_valid':e.valid,'format':proof['format'],'stale_locations':sum(r.get('source_sha256') is not None and r['source_sha256']!=e.digests.get(r['path']) for r in q['locations'])})
        row['aggregate']=aggregate(row['queries'])
        row['source_snapshot_sha256']=sha((ROOT/'gate-1/records'/ident/'sources.json.gz').read_bytes())
        row['trace_sha256']=sha((ROOT/'gate-1b/records'/ident/'failing.trace.json').read_bytes()) if trace else None
        report['tasks'].append(row)
        print(json.dumps({'task':ident,'valid':e.valid,'queries':len(row['queries']),'marks':row['aggregate']['marks']}),flush=True)
    report['literal_total']=aggregate([q for t in report['tasks'] for q in t['queries']])
    report['retained_native_total']=aggregate(report['native_invocations'])
    report['instrument_sha256']={n:sha((HERE/n).read_bytes()) for n in ['adapter.py','measure.py']}
    write(output/'summary.json',report)
    print(json.dumps({'literal':report['literal_total'],'retained_native':report['retained_native_total']}))
if __name__=='__main__':main()
