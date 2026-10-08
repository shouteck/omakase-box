"""Metadata-only scaffold audit over frozen records; never run model commands."""
import pathlib,json,collections,hashlib,statistics
from instrument import content_of,normalized
HERE=pathlib.Path(__file__).resolve().parent
sel=json.loads((HERE/'selection.json').read_bytes());tasks={t['instance_id']:t for t in json.loads((HERE/'tasks.json').read_bytes())};out={}
for a in sel['agents']:
 systems=collections.Counter();templates=collections.Counter();exits=collections.Counter();formats=collections.Counter();steps=[];cost=[];examples={}
 for t in sel['tasks']:
  r=json.loads((HERE/'records'/a['folder']/(t['instance_id']+'.traj.json')).read_bytes());msgs=r.get('messages',[])
  system='\n'.join(content_of(z) for z in msgs if z.get('role')=='system');digest=hashlib.sha256(system.encode()).hexdigest();systems[digest]+=1;examples[digest]=system
  user=next((content_of(z) for z in msgs if z.get('role')=='user'),'');template=user.replace(tasks[t['instance_id']]['problem_statement'],'<ISSUE>');templates[hashlib.sha256(template.encode()).hexdigest()]+=1
  ss,fmt,unknown=normalized(r);steps.append(len(ss));formats[fmt]+=1;info=r.get('info',{});exits[str(info.get('exit_status'))]+=1
  value=info.get('model_stats',{}).get('instance_cost')
  if isinstance(value,(int,float)):cost.append(value)
 out[a['folder']]=dict(system_prompt_hash_counts=dict(systems),issue_template_hash_counts=dict(templates),exit_status=dict(exits),format=dict(formats),median_steps=statistics.median(steps),max_steps=max(steps),min_steps=min(steps),median_published_record_cost=statistics.median(cost) if cost else None,config_unavailable='No common step/cost ceilings or model sampling config in these files; same published scaffold version does not prove identical limits.',system_prompt_examples=examples)
(HERE/'scaffold-audit.json').write_bytes(json.dumps(out,indent=2).encode())
