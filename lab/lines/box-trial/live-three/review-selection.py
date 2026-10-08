"""Independent selection, sign, frozen protocol and native discrepancy receipt."""
import collections,hashlib,json,pathlib,subprocess
R=pathlib.Path(__file__).resolve().parent.parent;H=R/'live-three';repo=R.parents[2]
read=lambda p:json.loads(p.read_bytes());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
g=read(R/'gate-2/summary.json');groups=collections.defaultdict(list)
for row in g['rows']:
 if row.get('status')=='measured' and not row['instance_id'].startswith('sphinx-'):groups[row['instance_id']].append(row)
candidates=[]
for ident,rows in groups.items():
 failures=sum(row['resolved'] is False for row in rows);maximum=max(row['steps'] for row in rows)
 if failures or maximum>=40:candidates.append({'task':ident,'published_failures':failures,'max_published_commands':maximum})
candidates.sort(key=lambda x:(-x['published_failures'],-x['max_published_commands'],x['task']))
selection=read(H/'selection.json');assert selection['candidates']==candidates and selection['gate2_sha256']==sha(R/'gate-2/summary.json')
decision=read(H/'decisions.json');signs=[]
for pair in decision['pairs']:
 c=pair['runs']['control'];b=pair['runs']['box'];ct=c['tokens']['totalTokens'];bt=b['tokens']['totalTokens'];same=c['solved']==b['solved'];tie=same and abs(ct-bt)<0.05*ct
 assert pair['tie']==tie
 assert pair['for']==(not tie and (bt<ct or b['solved'] is True and c['solved'] is False))
 assert pair['against']==(not tie and (ct<bt or c['solved'] is True and b['solved'] is False))
 signs.append(pair['direction'])
assert signs==['for','against','against'] and decision['stop'] and decision['against_count']==2
assert sum(p['pair_tokens'] for p in decision['pairs'][1:])==decision['new_repair_tokens']==380096
assert sum(p['pair_tokens'] for p in decision['pairs'])==763357
assert len(list(R.glob('live-three-*/raw/runs/*/attempt.json')))==4
base=['git','-c','safe.directory='+repo.as_posix()]
frozen='2e85d53224be31e346df49a149b0606b5875d575'
assert subprocess.run(base+['diff','--exit-code','62aced1f456a4565becfcd77896c84130d1f7183',frozen,'--','lab/lines/box-trial/live-three/plan.md','lab/lines/box-trial/live-three/harness-template.py'],capture_output=True).returncode==0
report={'frozen_candidate':frozen,'selection_reconstructed':True,'ranked_candidates':candidates,'signs':signs,'new_tokens':380096,'including_pilot_tokens':763357,'new_starts':4,'third_started':False,'root_protocol_unchanged_since_first_launch':True,'native_stderr_discrepancy':[]}
for p in H.glob('review-audit-*.json'):
 a=read(p)
 for arm,run in a['runs'].items():
  assert 'model/rerouted' not in run['event_methods'] and 'error' not in run['event_methods']
  assert run['settings']['model']=='gpt-5.6-luna' and run['settings']['effort']=='low'
p=H/'review-replay-matplotlib__matplotlib-21568.json'
if p.exists():
 for step in read(p)['steps']:
  raw=read(pathlib.Path(step['receipt']));native=__import__('base64').b64decode(raw['native_stderr_b64']);wrapped=__import__('base64').b64decode(raw['wrapped']['native_stderr_b64'])
  report['native_stderr_discrepancy'].append(dict(step,native_prefix_of_wrapped=wrapped.startswith(native),extra_wrapped_lines=len(wrapped.splitlines())-len(native.splitlines())))
(H/'review-selection-stop.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='ranked_candidates'},indent=2))
