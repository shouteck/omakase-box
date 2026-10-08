"""Prepare trial inputs from earlier execution evidence; never consult a gold patch."""
import ast, gzip, hashlib, importlib.util, json, pathlib
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parent
spec=importlib.util.spec_from_file_location('gate1_measure',ROOT/'gate-1/measure.py')
gate1=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate1)
def make(ident):
    # Runtime task contains test overlay and commands only, not a production patch.
    task=json.loads((ROOT/'gate-1b/records'/ident/'task.json').read_text(encoding='utf-8'))
    trace=json.loads((ROOT/'gate-1b/records'/ident/'failing.trace.json').read_text(encoding='utf-8'))
    sources=json.loads(gzip.decompress((ROOT/'gate-1/records'/ident/'sources.json.gz').read_bytes()))
    trees={};scope={}
    for key,(order,name) in trace.items():
        path,line=key.rsplit(':',1)
        if name=='<module>' or not gate1.production(path) or path not in sources:continue
        if path not in trees:trees[path]=gate1.functions(sources[path])
        containing=[r for r in trees[path] if r['start']<=int(line)<=r['end']]
        if containing:
            row=min(containing,key=lambda r:r['end']-r['start'])
            span=[row['start'],row['end']]
            if span not in scope.setdefault(path,[]):scope[path].append(span)
    for spans in scope.values():spans.sort()
    snapshot=json.loads((ROOT/'gate-1/records'/ident/'task.json').read_text(encoding='utf-8'))
    # This earlier task has benchmark test fields only; it does not contain the gold patch.
    assert 'patch' not in snapshot
    row=next(r for r in json.loads((ROOT/'gate-1/tasks.json').read_text(encoding='utf-8')) if r['instance_id']==ident)
    task['issue']=row['problem_statement']
    task['fail_names']=json.loads(row['FAIL_TO_PASS']) if isinstance(row['FAIL_TO_PASS'],str) else row['FAIL_TO_PASS']
    task['guard_names']=json.loads(row['PASS_TO_PASS']) if isinstance(row['PASS_TO_PASS'],str) else row['PASS_TO_PASS']
    return task,scope
if __name__=='__main__':
    import sys
    for ident in sys.argv[1:]:
        task,scope=make(ident);print(ident,len(scope),sum(len(v) for v in scope.values()),bool(task['issue']))
