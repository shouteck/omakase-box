"""Saved-record table and pre-next-pair stop decision; no inference."""
import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent;HERE=ROOT/'live-three'
rows=[]
def add(summary,kind,first,ordinal):
 s=json.loads(summary.read_bytes());runs={r['arm']:r for r in s['runs']};c=runs['control'];b=runs['box']
 ct=c['tokens']['totalTokens'];bt=b['tokens']['totalTokens'];same=c['solved']==b['solved'];tie=same and abs(ct-bt)<0.05*ct
 valid=b['box_valid'] and all(r['status']=='completed' and r['evaluation_status']=='scored' for r in runs.values())
 forflag=valid and not tie and (bt<ct or (b['solved'] is True and c['solved'] is False))
 against=valid and not tie and (ct<bt or (c['solved'] is True and b['solved'] is False))
 rows.append({'ordinal':ordinal,'kind':kind,'task':s['task'],'first_arm':first,'runs':runs,'pair_tokens':ct+bt,'valid_uncapped_pair':valid,'for':forflag,'against':against,'tie':valid and tie,'direction':'mixed' if forflag and against else 'for' if forflag else 'against' if against else 'tie' if valid and tie else 'unknown/invalid'})
add(ROOT/'live-pilot/summary.json','pilot','control',0)
for h in ROOT.glob('live-three-*'):
 if not (h/'summary.json').exists():continue
 config=json.loads((h/'config.json').read_bytes());add(h/'summary.json','new',config['first_arm'],config['ordinal'])
rows.sort(key=lambda r:r['ordinal']);against=sum(r['against'] for r in rows);newtokens=sum(r['pair_tokens'] for r in rows if r['kind']=='new')
faults=[]
for h in ROOT.glob('live-three-*'):
 for p in h.glob('raw/runs/*/attempt.json'):
  a=json.loads(p.read_bytes())
  if a.get('error') or a.get('evaluation',{}).get('status')!='scored':faults.append({'task':a['task'],'arm':a['arm'],'error':a.get('error'),'status':a['status']})
decision={'pairs':rows,'new_repair_tokens':newtokens,'against_count':against,'stop':bool(faults) or against>=2 or len(rows)>=4,'faults':faults,'stop_reason':'protocol/scoring fault' if faults else 'two against' if against>=2 else 'three new pairs complete' if len(rows)>=4 else 'next authorized pair may proceed after its safeguards'}
(HERE/'decisions.json').write_text(json.dumps(decision,indent=2))
print(json.dumps({'rows':[{k:r[k] for k in ['task','first_arm','direction','pair_tokens','valid_uncapped_pair']} for r in rows],'new_tokens':newtokens,'stop':decision['stop'],'reason':decision['stop_reason']},indent=2))
