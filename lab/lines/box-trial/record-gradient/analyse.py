"""Offline task-cluster summaries; reads no model APIs and executes no agent commands."""
import pathlib,json,sys,statistics,collections,random,math
from instrument import measure
HERE=pathlib.Path(__file__).resolve().parent
selection=json.loads((HERE/'selection.json').read_bytes());tasks=json.loads((HERE/'tasks.json').read_bytes());agents=selection['agents']
rows=[]
for index,task in enumerate(tasks):
 if not (HERE/'boxes'/task['instance_id']/'attempt.json').exists():continue
 for agent in agents:
  try:r=measure(task,agent)
  except Exception as e:r=dict(instance_id=task['instance_id'],repo=task['repo'],agent=agent['folder'],status='instrument error',error=str(e))
  rows.append(r)
 if index%12==0:print('measured tasks',index+1,'rows',len(rows),flush=True)
(HERE/'measurements.json').write_bytes(json.dumps(rows,indent=1).encode())
def med(values):return statistics.median(values) if values else None
def summary(items):
 allreading=[r for r in items if r['status']=='measured' and r.get('has_box')]
 items=[r for r in items if r['status']=='measured' and r.get('function_target')]
 known=[r for r in items if r.get('has_box')];searches=[s for r in known for s in r['searches']];measured=[s for s in searches if s['measurable']];before=[s for r in known for s in r['searches'] if not r['reached_step'] or s['step']<r['reached_step']]
 complete=[r for r in items if r['complete_record']];nc=len(complete)
 n=len(items);nk=len(known);ns=len(searches);nm=len(measured)
 result=dict(records=n,box_records=nk,median_reach_steps=med([r['reached_step'] for r in items if r['reached_step']]),never_recognized_rate=sum(r['reached_step'] is None for r in complete)/nc if nc else None,no_observed_reach_rate=sum(r['reached_step'] is None for r in items)/n if n else None,complete_records=nc,broad_never_visible_rate=sum(r['broad_visible_step'] is None for r in complete)/nc if nc else None,median_broad_steps=med([r['broad_visible_step'] for r in items if r['broad_visible_step']]),restricted_10_steps=med([min(r['reached_step'] or 11,11) for r in complete]),median_whole_steps=med([r['steps'] for r in items]),median_before_bytes=med([r['before_bytes'] for r in items if r['before_bytes'] is not None]),median_locating_share=med([r['locating_step_share'] for r in items if r['locating_step_share'] is not None]),search_actions=ns,measurable_search_actions=nm,measurable_fraction=nm/ns if ns else None,opportunity_actions=sum(s.get('opportunity') is True for s in measured),opportunity_share_all=sum(s.get('opportunity') is True for s in measured)/ns if ns else None,opportunity_share_measurable=sum(s.get('opportunity') is True for s in measured)/nm if nm else None,pre_reach_opportunity_runs=sum(r['pre_reach_opportunity'] is True for r in known),pre_reach_opportunity_rate=sum(r['pre_reach_opportunity'] is True for r in known)/nk if nk else None,pre_reach_unknown_runs=sum(any((not s['measurable'] or s.get('partial_unknown_results')) and (not r['reached_step'] or s['step']<r['reached_step']) for s in r['searches']) for r in known),median_rank_shift=med([s['ordinary_rank']-s['box_rank'] for s in measured if s['fix_present']]),median_ordinary_rank=med([s['ordinary_rank'] for s in measured if s['fix_present']]),median_box_rank=med([s['box_rank'] for s in measured if s['fix_present']]),rank_regressions=sum(s.get('regression') is True for s in measured),top3_rescues=sum(s.get('top3_rescue') is True for s in measured),never_reach_top3_runs=sum(r.get('never_reach_top3') is True for r in known if not r['reached_step'] and r['complete_record']),never_reach_target_in_box=sum(r['target_in_box'] is True for r in known if not r['reached_step'] and r['complete_record']),anticipation_runs=sum(r['anticipation_step'] is not None for r in items),issue_named_target_runs=sum(bool(r['issue_supplied_target_files']) for r in items),resolved_without_recognized_reach=sum(r['resolved'] is True and r['reached_step'] is None for r in items),unknown_views=sum(r['unknown_views'] for r in items),unparsed_actions=sum(r['unparsed_actions'] for r in items),after_finding_censored=sum(r['after_finding']['censored'] for r in items),after_finding_bytes_median=med([r['after_finding']['returned_bytes'] for r in items if r['reached_step']]),after_inside_functions_median=med([r['after_finding']['inside_functions'] for r in known if r['reached_step']]),after_outside_functions_median=med([r['after_finding']['outside_functions'] for r in known if r['reached_step']]),after_source_bytes_inside_median=med([r['after_finding']['source_bytes_inside'] for r in known if r['reached_step']]),after_source_bytes_outside_median=med([r['after_finding']['source_bytes_outside'] for r in known if r['reached_step']]),exit_status=dict(collections.Counter(str(r['exit_status']) for r in items)))
 result['median_before_text_share']=med([r['before_text_share'] for r in items if r['before_text_share'] is not None])
 result['neither_timed_nor_submitted_target_rate']=sum(not r['ever_timed_or_submitted_target'] for r in complete)/nc if nc else None
 result['submitted_target_edit_runs']=sum(r['submitted_target_edit'] for r in items)
 result['failed_despite_timed_or_endpoint_place']=sum(r['resolved'] is False and r['ever_timed_or_submitted_target'] for r in items)
 result['slice_box_records']=len(allreading)
 result['partial_unknown_search_actions']=sum(z.get('partial_unknown_results',False) for z in searches)
 result['pre_reach_ambiguous_action_runs']=sum(any(z.get('unknown_action') and (not r['reached_step'] or z['step']<r['reached_step']) for z in r['actions']) for r in known)
 result['pre_reach_opportunity_upper_rate']=sum(r['pre_reach_opportunity'] is True or any(z.get('unknown_action') and (not r['reached_step'] or z['step']<r['reached_step']) for z in r['actions']) or any((not z['measurable'] or z.get('partial_unknown_results')) and (not r['reached_step'] or z['step']<r['reached_step']) for z in r['searches']) for r in known)/nk if nk else None
 result['opportunity_share_upper_all']=sum(z.get('opportunity') is True or not z['measurable'] or z.get('partial_unknown_results',False) for z in searches)/ns if ns else None
 result['first10_action_opportunity_rate']=sum(any(z.get('opportunity') and z['step']<=10 for z in r['searches']) for r in known)/nk if nk else None
 result['first10_search_opportunity_rate']=sum(any(z.get('opportunity') for z in r['searches'][:10]) for r in known)/nk if nk else None
 result['slice_removable_all_returned_share_median']=med([r['slicing']['removable_source_bytes']/r['whole_bytes'] for r in allreading if r['whole_bytes']])
 result['slice_removable_view_source_share_median']=med([r['slicing']['removable_source_bytes']/r['slicing']['verified_view_source_bytes'] for r in allreading if r['slicing']['verified_view_source_bytes']])
 result['slice_gold_omission_runs']=sum(bool(r['slicing']['omitted_gold_functions']) for r in allreading)
 result['slice_edit_omission_runs']=sum(bool(r['slicing']['omitted_edited_functions']) for r in allreading)
 result['slice_repeated_outside_runs']=sum(bool(r['slicing']['repeated_outside_functions']) for r in allreading)
 result['after_source_module_bytes_median']=med([sum(a['view_source_bytes_module'] for a in r['actions'] if r['reached_step'] and a['step']>r['reached_step'] and (not r['first_verified_target_edit'] or a['step']<r['first_verified_target_edit'])) for r in known if r['reached_step']])
 result['failed_after_recognized_reach']=sum(r['resolved'] is False and r['reached_step'] is not None for r in items)
 result['available_verdicts']=sum(r['resolved'] is not None for r in items)
 return result

by={a['folder']:[r for r in rows if r['agent']==a['folder']] for a in agents}
table=[dict(agent=a['folder'],name=a['name'],published_rate=a['resolved'],**summary(by[a['folder']])) for a in agents]
projects={repo:[dict(agent=a['folder'],**summary([r for r in by[a['folder']] if r['repo']==repo])) for a in agents] for repo in sorted({r['repo'] for r in rows})}
strong=agents[0]['folder'];weak=agents[-1]['folder'];keyed={(r['instance_id'],r['agent']):r for r in rows if r['status']=='measured'}
common=[t for t in tasks if all((t['instance_id'],a['folder']) in keyed and keyed[t['instance_id'],a['folder']].get('function_target') for a in agents)]
commonreading=[t for t in tasks if all((t['instance_id'],a['folder']) in keyed and keyed[t['instance_id'],a['folder']]['has_box'] for a in agents)]
commonbox=[t for t in common if all(keyed[t['instance_id'],a['folder']]['has_box'] for a in agents)]
def differences(ts,field):
 vals=[]
 for t in ts:
  if field in ['never','endpoint_never','broad_never','restricted'] and not all(keyed[t['instance_id'],a['folder']]['complete_record'] for a in agents):continue
  w=keyed[t['instance_id'],weak];s=keyed[t['instance_id'],strong]
  if field=='opportunity':vals.append(float(w['pre_reach_opportunity'])-float(s['pre_reach_opportunity']))
  elif field=='slice':vals.append(w['slicing']['removable_source_bytes']/w['whole_bytes']-s['slicing']['removable_source_bytes']/s['whole_bytes'] if w['whole_bytes'] and s['whole_bytes'] else 0)
  elif field=='first10':vals.append(float(any(z.get('opportunity') and z['step']<=10 for z in w['searches']))-float(any(z.get('opportunity') and z['step']<=10 for z in s['searches'])))
  elif field=='endpoint_never':vals.append(float(not w['ever_timed_or_submitted_target'])-float(not s['ever_timed_or_submitted_target']))
  elif field=='never':vals.append(float(w['reached_step'] is None)-float(s['reached_step'] is None))
  elif field=='broad_never':vals.append(float(w['broad_visible_step'] is None)-float(s['broad_visible_step'] is None))
  elif field=='restricted':vals.append(min(w['reached_step'] or 11,11)-min(s['reached_step'] or 11,11))
 return sum(vals)/len(vals) if vals else None
def bootstrap(ts,field):
 if field in ['never','endpoint_never','broad_never','restricted']:ts=[t for t in ts if all(keyed[t['instance_id'],a['folder']]['complete_record'] for a in agents)]
 if not ts:return None
 groups=collections.defaultdict(list)
 for t in ts:groups[t['repo']].append(t)
 rng=random.Random(9102026);values=[]
 for _ in range(2000):values.append(differences([rng.choice(group) for group in groups.values() for i in range(len(group))],field))
 values.sort();return dict(tasks=len(ts),difference=differences(ts,field),interval=[values[50],values[1949]])
original={r['instance_id'] for r in json.loads((HERE.parent/'gate-1/tasks.json').read_bytes())}
result=dict(selected_tasks=150,records_available=sum(r['present'] for r in json.loads((HERE/'record-receipts.json').read_bytes())),rows=len(rows),statuses=dict(collections.Counter(r['status'] for r in rows)),table=table,projects=projects,common_tasks=len(common),common_box_tasks=len(commonbox),gradient={field:bootstrap(commonbox if field in ['opportunity','first10','slice'] else common,field) for field in ['opportunity','first10','never','endpoint_never','broad_never','restricted','slice']},original_overlap=[t['instance_id'] for t in common if t['instance_id'] in original],heldout_sensitivity={field:bootstrap([t for t in (commonbox if field in ['opportunity','first10','slice'] else common) if t['instance_id'] not in original],field) for field in ['opportunity','first10','never','endpoint_never','broad_never','restricted','slice']},common_table=[dict(name=a['name'],**summary([keyed[t['instance_id'],a['folder']] for t in commonbox])) for a in agents],search_unknown_reasons=dict(collections.Counter(s['unknown_reason'] for r in rows if r['status']=='measured' for s in r['searches'] if not s['measurable'])))



def agent_intervals(ts,agent,upper):
 if not ts:return None
 groups=collections.defaultdict(list)
 for t in ts:
  r=keyed[t['instance_id'],agent]
  value=r['pre_reach_opportunity'] is True or (upper and any(z.get('unknown_action') and (not r['reached_step'] or z['step']<r['reached_step']) for z in r['actions'])) or (upper and any((not z['measurable'] or z.get('partial_unknown_results')) and (not r['reached_step'] or z['step']<r['reached_step']) for z in r['searches']))
  groups[t['repo']].append(float(value))
 rng=random.Random(9102026);draw=[]
 for _ in range(2000):
  sample=[rng.choice(group) for group in groups.values() for i in range(len(group))];draw.append(sum(sample)/len(sample))
 draw.sort();observed=[v for group in groups.values() for v in group]
 return dict(tasks=len(ts),rate=sum(observed)/len(observed),interval=[draw[50],draw[1949]])
result['per_agent_pre_reach_intervals']={a['name']:{'verified_lower':agent_intervals(commonbox,a['folder'],False),'unknown_upper':agent_intervals(commonbox,a['folder'],True)} for a in agents}

result['reading_common_tasks']=len(commonreading)
result['reading_all_task_table']=[dict(name=a['name'],**summary([keyed[t['instance_id'],a['folder']] for t in commonreading])) for a in agents]
result['slicing_gradient_all_valid_tasks']=bootstrap(commonreading,'slice')
result['function_target_excluded_rows']=sum(r['status']=='measured' and not r.get('function_target') for r in rows)
result['incomplete_or_ambiguous_rows']=sum(r['status']=='measured' and not r['complete_record'] for r in rows)

submitted=[t for t in commonbox if all(keyed[t['instance_id'],a['folder']]['complete_record'] for a in agents)]
result['all_submitted_table']=[dict(name=a['name'],**summary([keyed[t['instance_id'],a['folder']] for t in submitted])) for a in agents]
result['all_submitted_sensitivity']={field:bootstrap(submitted,field) for field in ['opportunity','first10','never','endpoint_never','broad_never','restricted','slice']}
result['same_prompt_qwen_sensitivity']={a['name']:summary([keyed[t['instance_id'],a['folder']] for t in commonbox]) for a in [agents[2],agents[5]]}
result['project_gradients']={repo:{field:bootstrap([t for t in (commonbox if field in ['opportunity','first10','slice'] else common) if t['repo']==repo],field) for field in ['opportunity','first10','never','endpoint_never','broad_never','restricted','slice']} for repo in projects}
# Only published verdicts: never treat Submitted or patch presence as solved.
all_six=[t for t in common if all(keyed[t['instance_id'],a['folder']]['resolved'] is not None for a in agents)]
available=[t for t in common if sum(keyed[t['instance_id'],a['folder']]['resolved'] is not None for a in agents)>=5]
ranked=sorted(available,key=lambda t:(sum(keyed[t['instance_id'],a['folder']]['resolved'] is True for a in agents)/sum(keyed[t['instance_id'],a['folder']]['resolved'] is not None for a in agents),t['instance_id']))
result['hardness_all_six_tasks']=len(all_six)
result['secondary_available_five_hardness']={str(q):[dict(name=a['name'],**summary([keyed[t['instance_id'],a['folder']] for t in ranked if min(3,ranked.index(t)*4//max(1,len(ranked)))==q])) for a in agents] for q in range(4)}
# Ties can cross quartiles: these are rank-balanced descriptive groups only.
result['hardness_group_tasks']={str(q):[t['instance_id'] for i,t in enumerate(ranked) if min(3,i*4//max(1,len(ranked)))==q] for q in range(4)}

(HERE/'summary.json').write_bytes(json.dumps(result,indent=2).encode());print(json.dumps(dict(rows=len(rows),common=len(common),commonbox=len(commonbox),gradient=result['gradient'],table=table),indent=1))
