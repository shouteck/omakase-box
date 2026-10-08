"""Check saved restart receipts without running repair agents."""
import ast,hashlib,json,pathlib,shlex
HERE=pathlib.Path(__file__).resolve().parent
errors=[];checked=0;box=[]
def prompt(path):
 tree=ast.parse(path.read_text(encoding='utf-8'))
 return ast.dump(next(n for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='prompt' for t in n.targets)))
assert prompt(HERE/'run.py')==prompt(HERE/'passive/run.py'), 'Control prompt changed'
for path in sorted((HERE/'records').glob('*/*/attempt.json')):
 r=json.loads(path.read_text(encoding='utf-8'));d=path.parent;checked+=1
 for name,digest in r.get('artifacts',{}).items():
  if not (d/name).exists() or hashlib.sha256((d/name).read_bytes()).hexdigest()!=digest:errors.append(str(d/name))
 steps=json.loads((d/'steps.json').read_text(encoding='utf-8')) if (d/'steps.json').exists() else []
 calls=[s for s in steps if s['box_call']]
 assert r['steps']==len(steps) and r['box_calls']==len(calls)
 for s in calls:assert shlex.split(s['command'])[0]=='box-search'
 if r['arm']=='box':
  assert r['box_arm_valid']==bool(calls)
  assert len(r['box_call_followups'])==len(calls)
  box.append({'instance_id':r['instance_id'],'repeat':r['repeat'],'valid':bool(calls),'first_command':r['box_first_command'],'calls':len(calls)})
 else:assert not calls
 assert len(steps)<=60
assert not errors,errors
result={'status':'pass','checked_attempts':checked,'control_prompt_unchanged':True,'artifact_hash_errors':errors,'box_runs':box}
(HERE/'checks.json').write_bytes(json.dumps(result,indent=2).encode())
print(json.dumps(result,indent=2))
