"""Aggregate every frozen query, with unknowns kept outside eligibility."""
import collections,hashlib,json,pathlib,statistics,sys
from replay import HERE,ROOT,read,write,sha

def summary(ids=None):
    corpus=read(HERE/'corpus.json');rows=[];queries=[];receipts=[];regressions=[];missing=[];covered=0;uncovered=0;skippedsearch=0;errors=[]
    allids=list(dict.fromkeys(t['task'] for t in corpus['trajectories']))
    for ident in (ids or allids):
        p=HERE/'raw'/ident/'replay.json'
        if not p.exists():missing.append(ident);continue
        record=read(p);receipts.append({'path':str(p.relative_to(HERE)),'sha256':sha(p.read_bytes())})
        if record.get('error'):errors.append([ident,record['error']])
        qs=record['queries'];queries+=qs
        for traj in record['trajectories']:
            if traj.get('error'):errors.append([ident,traj['agent'],traj['error']])
            for a in traj.get('actions',[]):
                if a['search_action']:
                    if a.get('search_invocations'):covered+=1
                    else:uncovered+=1
                    if a['status']=='skipped-expensive':skippedsearch+=1
        eligible=[q for q in qs if q['metrics']['ordinary_first'] is not None and not q['metrics']['format_unknown'] and not q['source_state_unknown'] and not q['environment_state_unknown'] and q['exit'] in (0,1)]
        regress=[q for q in eligible if q['metrics']['box_first']>q['metrics']['ordinary_first']]
        regressions += [{'task':ident,'agent':q['agent'],'step':q['step'],'invocation':q['invocation'],'tool':q['tool'],'args':q['args'],'ordinary_first':q['metrics']['ordinary_first'],'box_first':q['metrics']['box_first'],'command':q['command'],'state_before':q['state_before']} for q in regress]
        c=statistics.median(q['metrics']['ordinary_before'] for q in eligible) if eligible else None;b=statistics.median(q['metrics']['box_before'] for q in eligible) if eligible else None
        clear=c is not None and c>=1 and b<=c/2 and c-b>=1
        rows.append({'task':ident,'invocations':len(qs),'eligible_reaching_queries':len(eligible),'no_target_queries':sum(q['metrics']['no_target'] for q in qs),'native_error_queries':sum(q['exit'] not in (0,1) for q in qs),'unknown_format_queries':sum(q['metrics']['format_unknown'] for q in qs),'unknown_source_queries':sum(q['source_state_unknown'] for q in qs),'unknown_environment_queries':sum(q['environment_state_unknown'] for q in qs),'pre_edit_queries':sum(q['pre_edit'] for q in qs),'ordinary_median_before':c,'box_median_before':b,'clearly_nearer':clear,'regressions':len(regress),'all_match_sets_preserved':all(q['proof']['same_records'] for q in qs)})
    eligible_tasks=sum(r['eligible_reaching_queries']>0 for r in rows);wins=sum(r['clearly_nearer'] for r in rows);conserved=all(r['all_match_sets_preserved'] for r in rows)
    complete=len(rows)==len(allids) and not missing
    if regressions or (complete and wins<=eligible_tasks/2):decision='stop'
    elif not complete or uncovered or errors or not conserved or any(q['proof'].get('ordering_error') for q in queries):decision='cannot decide'
    else:decision='go to one pair'
    querytable=[]
    for q in queries:
        querytable.append({k:v for k,v in q.items() if k not in ('stdout_b64','stderr_b64','locations')})
    return {'corpus_sha256':sha((HERE/'corpus.json').read_bytes()),'decision':decision,'tasks':rows,'total_invocations':len(queries),'eligible_tasks':eligible_tasks,'clearly_nearer_tasks':wins,'regressions':regressions,'covered_search_actions':covered,'uncovered_search_actions':uncovered,'skipped_search_actions':skippedsearch,'missing_tasks':missing,'replay_errors':errors,'all_match_sets_preserved':conserved,'ordering_faults':sum(bool(q['proof'].get('ordering_error')) for q in queries),'raw_receipts':receipts,'queries':querytable,'agent_tokens':0,'limits':['Native stream recorded before downstream head/tail/filter; not the final visible stream.','Source-changing actions replayed in order; expensive/missing state explicitly unknown.','Binary, machine and unlocated stdin results stay native and may be unscoreable.','Generated-output queries outside repository are unknown environment.','Median places are conditional on a real search reaching a changed function; no-target searches remain counted.']}
if __name__=='__main__':
    r=summary(sys.argv[1:] or None);write(HERE/'summary.json',r);print(json.dumps({k:v for k,v in r.items() if k not in ('queries','raw_receipts','regressions','limits')}));print('regressions',len(r['regressions']))