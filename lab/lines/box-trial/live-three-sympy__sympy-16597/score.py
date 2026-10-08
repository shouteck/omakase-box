"""Verify saved pilot receipts and make a compact report; never rerun agents."""
import base64,collections,hashlib,json,pathlib,re
from common import HERE,production_patch
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((HERE/'launch-lock.json').read_bytes())
for n,h in lock['files'].items():assert sha(HERE/n)==h,n
runs=[]
for arm in ['control','box']:
 d=HERE/'raw/runs'/arm;a=json.loads((d/'attempt.json').read_bytes());steps=json.loads((d/'steps.json').read_bytes())
 for n,h in a['artifacts'].items():assert sha(d/n)==h,n
 assert a['prompt_sha256']==sha(HERE/'prompt.txt')
 assert a['reported_model']=='gpt-5.6-luna' and a['effort']=='low'
 assert production_patch((d/'all.patch').read_text(encoding='utf-8'))==(d/'candidate.patch').read_text(encoding='utf-8')
 errors=[];opens=[];promotions=[]
 for s in steps:
  r=s['result'];raw=base64.b64decode(r['native_stdout_b64']);shown=base64.b64decode(r['shown_stdout_b64'])
  assert collections.Counter(raw.splitlines(keepends=True))==collections.Counter(shown.splitlines(keepends=True))
  assert len(raw)==len(shown) and r['added_bytes']==0
  assert r['wrapper_sha256']==lock['files']['execute.py'] and r['capture_sha256']==lock['files']['capture.py']
  if r['timed_out'] or r['exit'] not in [0,1]:errors.append({'step':s['step'],'exit':r['exit'],'timed_out':r['timed_out']})
  for moved in r['moved_up']:
   promotions.append({'step':s['step'],'path':moved['path'],'line':moved['line'],'function_start':moved['function_start'],'ordinary_ordinal':moved['ordinary_ordinal'],'shown_ordinal':moved['shown_ordinal']})
   for later in steps:
    if later['step']<=s['step']:continue
    # Explicit sed read is an observable file/line open, not cognition.
    for m in re.finditer(r"sed -n ['\"]?(\d+),(\d+)p['\"]?\s+([^\s;&|]+)",later['command']):
     if m.group(3).lstrip('./')==moved['path'] and int(m.group(1))<=moved['line']<=int(m.group(2)):
      opens.append({'search_step':s['step'],'open_step':later['step'],'path':moved['path'],'function_start':moved['function_start'],'read_start':int(m.group(1)),'read_end':int(m.group(2))});break
 run={'arm':arm,'status':a['status'],'model':a['reported_model'],'effort':a['effort'],'tokens':a['token_usage']['total'],'steps':len(steps),'search_actions':sum(bool(s['result']['queries']) for s in steps),
  'searches':sum(len(s['result']['queries']) for s in steps),'searches_reordered':sum(s['result']['searches_reordered'] for s in steps),'promotions':promotions,'subsequent_explicit_opens':opens,
  'command_errors':errors,'nonzero_command_steps':[s['step'] for s in steps if s['result']['exit']!=0],
  'native_search_errors':[{'step':s['step'],'tool':q['tool'],'exit':q['exit']} for s in steps for q in s['result']['queries'] if q['exit']>=2],
  'native_no_match_searches':sum(q['exit']==1 for s in steps for q in s['result']['queries']),
  'box_valid':arm!='box' or bool(promotions),'solved':a['evaluation']['solved'],'evaluation_status':a['evaluation']['status'],
  'phases':{p:{k:v.get(k) for k in ['exit','timed_out','requested','matched_passes','all_pass']} for p,v in a['evaluation']['phases'].items()},
  'agent_seconds':a.get('agent_seconds'),'token_cap_excess':a['token_cap_excess'],'candidate_sha256':sha(d/'candidate.patch'),
  'attempt_sha256':sha(d/'attempt.json'),'steps_sha256':sha(d/'steps.json'),'events_sha256':sha(d/'model-events.json')}
 runs.append(run)
summary={'task':json.loads((HERE/'config.json').read_bytes())['task'],'frozen_pushed_commit':lock['commit'],'runs':runs,'pair_tokens':sum(r['tokens']['totalTokens'] for r in runs),
 'pair_cap_excess':max(0,sum(r['tokens']['totalTokens'] for r in runs)-800000),'repair_starts':2,'repeated':False,
 'standing':'Silent ordering reached the live agent and promoted source was subsequently opened. Both repairs failed. One pair establishes no superiority.',
 'limits':['One task and one pair; no repeat or counterfactual attribution','Promoted function was a helper, not necessarily the bug location','Whole native command output conserved before the common 16 KB return cap','Recorder covers available shell search commands; explicit executable bypasses and arbitrary Python searches are not intercepted','Context/unsupported formats fall back; no universal shell-support claim','Token totals include cached input and reasoning output, not an invoice or lead/reviewer usage']}
(HERE/'summary.json').write_bytes(json.dumps(summary,indent=2).encode())
print(json.dumps(summary,indent=2))
