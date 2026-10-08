import ast,hashlib,importlib.util,json,pathlib,shlex,sys
sys.dont_write_bytecode=True
HERE=pathlib.Path('lab/lines/box-trial/gate-3').resolve();sys.path.insert(0,str(HERE))
def load(name):
 spec=importlib.util.spec_from_file_location('sceptic_'+name,HERE/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
selection=load('select').select();assert selection==json.loads((HERE/'selection.json').read_text(encoding='utf-8'))
summary=json.loads((HERE/'summary.json').read_text(encoding='utf-8')) if '--receipts-only' in sys.argv else load('score').collect(True)
assert summary==json.loads((HERE/'summary.json').read_text(encoding='utf-8'))
def prompt(p):
 tree=ast.parse(p.read_text(encoding='utf-8'));return ast.dump(next(n for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='prompt' for t in n.targets)))
assert prompt(HERE/'run.py')==prompt(HERE/'passive/run.py')
checks=[];calls=[];errors=[]
for path in sorted((HERE/'records').glob('*/*/attempt.json')):
 r=json.loads(path.read_text(encoding='utf-8'));d=path.parent;s=json.loads((d/'steps.json').read_text(encoding='utf-8'))
 for n,h in r['artifacts'].items():
  if hashlib.sha256((d/n).read_bytes()).hexdigest()!=h:errors.append(str(d/n))
 assert len(s)==r['steps']<=60
 c=[x for x in s if x['box_call']];assert len(c)==r['box_calls']
 expected=[{'box_step':x['step'],'command':x['command'],'result':x['result'],'following_steps':[{'step':n['step'],'command':n['command'],'exit':n['result']['exit']} for n in s[i+1:next((j for j in range(i+1,len(s)) if s[j]['box_call']),len(s))]]} for i,x in enumerate(s) if x['box_call']]
 assert expected==r['box_call_followups']
 assert r['box_arm_valid']==(r['arm']!='box' or bool(c))
 assert r['box_first_command']==(bool(s and s[0]['box_call']) if r['arm']=='box' else None)
 assert all(shlex.split(x['command'])[0]=='box-search' for x in c)
 assert r['arm']=='box' or not c
 for x in s:
  total=(x.get('usage_before') or {}).get('total',{}).get('totalTokens',0);assert total<1000000,(path,x['step'],total)
 calls += [{'instance_id':r['instance_id'],'step':x['step'],'command':x['command'],'result':x['result']} for x in c]
 checks.append({'instance_id':r['instance_id'],'arm':r['arm'],'steps':len(s),'tokens':r['token_usage']['total']['totalTokens'],'agent_seconds':r['agent_seconds'],'valid':r['box_arm_valid']})
assert not errors
result={'selection_exact_match':True,'complete_summary_exact_match':True,'control_prompt_expression_match':True,'artifact_hash_errors':errors,'attempts':checks,'box_calls':calls,'stats':summary['stats'],'repeat_decision':summary['repeat_decision']}
(HERE/'sceptic-receipt-replay.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['attempts','box_calls']},indent=2))

