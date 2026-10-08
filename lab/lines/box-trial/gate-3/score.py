"""Score saved receipts, never rerun or repair an agent. Gold consulted only here."""
import gzip, hashlib, importlib.util, json, math, pathlib, statistics, sys
from run import visible
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parent
spec=importlib.util.spec_from_file_location('gate2_measure',ROOT/'gate-2/measure.py')
g2=importlib.util.module_from_spec(spec);spec.loader.exec_module(g2)
def median(values):return statistics.median(values) if values else None
def exact_p(wins,losses):
    n=wins+losses
    return min(1.0,2*sum(math.comb(n,i) for i in range(min(wins,losses)+1))/(2**n)) if n else 1.0

def readings(ident,steps):
    source=json.loads(gzip.decompress((ROOT/'gate-1/records'/ident/'sources.json.gz').read_bytes()))
    task=next(t for t in json.loads((ROOT/'gate-1/tasks.json').read_text(encoding='utf-8')) if t['instance_id']==ident)
    trees={}
    for path,text in source.items():
        try:trees[path]=g2.g1b.functions(text)
        except (SyntaxError,ValueError,RecursionError):pass
    targets,target_files=g2.g1b.targets(task,source,trees)
    first=None;edit=None;rows=[]
    for step in steps:
        cmd=step['command'];output=visible(step['result']);spans=[];hits=[];edits=[];classes=set()
        if step['box_call']:cmd='grep '+cmd[len('box-search '):] if cmd.startswith('box-search ') else 'grep'
        for segment in g2.segments(cmd):
            a,b,c,d=g2.classify(segment,output,source);classes|=a;spans+=b;hits+=c;edits+=d
        viewed=set()
        for path,start,end in spans:
            for row in trees.get(path,[]):
                if row['start']<=end and row['end']>=start:viewed.add((path,row['start']))
        hit_functions=set()
        for path,line in hits:
            row=g2.innermost(trees.get(path,[]),line)
            if row:hit_functions.add((path,row['start']))
        reaches=bool(viewed & targets or hit_functions & targets or set(edits)&target_files)
        if first is None and reaches:first=step['step']
        if edit is None and set(edits)&target_files:edit=step['step']
        rows.append({'step':step['step'],'classes':sorted(classes),'chars_returned':len(output),'viewed_functions':len(viewed),'search_hits':len(hits),'reaches_fix_proxy':reaches,'edits_target_file':bool(set(edits)&target_files)})
    early=[r for r in rows if first is not None and r['step']<first]
    between=[r for r in rows if first is not None and edit is not None and first<=r['step']<edit]
    return {'first_reach_step':first,'first_edit_target_file_step':edit,'steps_before':first-1 if first else None,'chars_before':sum(r['chars_returned'] for r in early) if first else None,'steps_between_reach_edit':len(between) if first and edit else None,'chars_between_reach_edit':sum(r['chars_returned'] for r in between) if first and edit else None,'rows':rows,'limitation':'Gate 2 heuristic; search hit/edit of target file count; Python reads and inline writes may be missed; base line spans can shift'}

def collect(with_readings=True):
    selection=json.loads((HERE/'selection.json').read_text())
    pairs=[];runs=[];errors=[]
    for task in selection['tasks']:
        ident=task['instance_id'];pair={'instance_id':ident,'stratum':task['stratum'],'arms':{}}
        for arm in ['control','box']:
            directory=HERE/'records'/ident/(arm+'-0');path=directory/'attempt.json'
            if not path.exists():pair['arms'][arm]={'status':'not_started','solved':None};continue
            raw=json.loads(path.read_text(encoding='utf-8'))
            for filename,digest in raw.get('artifacts',{}).items():
                artifact=directory/filename
                if not artifact.exists() or hashlib.sha256(artifact.read_bytes()).hexdigest()!=digest:errors.append(str(artifact))
            total=(raw.get('token_usage') or {}).get('total',{})
            steps=json.loads((directory/'steps.json').read_text(encoding='utf-8')) if (directory/'steps.json').exists() else []
            entry={'status':raw['status'],'solved':raw.get('evaluation',{}).get('solved'),'evaluation_status':raw.get('evaluation',{}).get('status'),'steps':raw.get('steps',len(steps)),'tokens':total.get('totalTokens'),'input_tokens':total.get('inputTokens'),'cached_input_tokens':total.get('cachedInputTokens'),'output_tokens_including_reasoning':total.get('outputTokens'),'agent_seconds':raw.get('agent_seconds'),'box_calls':sum(bool(s['box_call']) for s in steps),'box_match_lines':sum(len(s['result']['stdout'].splitlines()) for s in steps if s['box_call']),'box_error_or_empty_calls':sum(s['result']['exit']!=0 for s in steps if s['box_call']),'error':raw.get('error') or raw.get('evaluation',{}).get('error')}
            entry['evaluated_solved']=entry['solved']
            baseline=HERE/'baselines'/ident/'guards.json'
            if baseline.exists():
                before=json.loads(baseline.read_text(encoding='utf-8'))
                if before['exit']!=0 or before['matched_passes']!=before['requested']:
                    entry['solved']=None;entry['error']='Pristine guard failure; candidate result cannot establish repair/regression'
                    entry['baseline_guard_receipt']=str(baseline.relative_to(HERE))
            entry['box_arm_valid']=arm!='box' or entry['box_calls']>=1
            entry['box_first_command']=raw.get('box_first_command')
            entry['box_call_followups']=raw.get('box_call_followups',[])
            if not entry['box_arm_valid']:entry['solved']=None;entry['error']='Invalid Box arm: no recorded Box call'
            if with_readings and steps:entry['reading']=readings(ident,steps)
            edit_step=next((s['step'] for s in steps if g2.EDIT.search(s['command'])),None)
            entry['box_calls_after_first_edit']=sum(s['box_call'] and edit_step is not None and s['step']>edit_step for s in steps)
            pair['arms'][arm]=entry;runs.append(entry)
        pairs.append(pair)
    complete=[p for p in pairs if all(p['arms'][a]['solved'] is not None for a in ['control','box'])]
    gain=sum(p['arms']['box']['solved'] and not p['arms']['control']['solved'] for p in complete)
    loss=sum(p['arms']['control']['solved'] and not p['arms']['box']['solved'] for p in complete)
    both=[p for p in complete if all(p['arms'][a]['solved'] for a in ['control','box'])]
    comparable=[p for p in both if all(p['arms'][a]['tokens'] is not None for a in ['control','box'])]
    reductions=[1-p['arms']['box']['tokens']/p['arms']['control']['tokens'] for p in comparable if p['arms']['control']['tokens']]
    wins=sum(p['arms']['box']['tokens']<p['arms']['control']['tokens'] for p in comparable);losses=sum(p['arms']['box']['tokens']>p['arms']['control']['tokens'] for p in comparable)
    stats={'attempts':len(runs),'scored_pairs':len(complete),'unknown_or_unstarted_pairs':12-len(complete),'control_solved':sum(r['arms']['control']['solved'] is True for r in pairs),'box_solved':sum(r['arms']['box']['solved'] is True for r in pairs),'gains':gain,'losses':loss,'success_exact_p':exact_p(gain,loss),'both_solved_comparable':len(comparable),'median_token_reduction':median(reductions),'token_wins':wins,'token_losses':losses,'token_exact_p':exact_p(wins,losses),'valid_box_attempts':sum(r.get('box_arm_valid',False) for p in pairs for a,r in p['arms'].items() if a=='box' and r['status']!='not_started'),'invalid_box_attempts':sum(not r.get('box_arm_valid',False) for p in pairs for a,r in p['arms'].items() if a=='box' and r['status']!='not_started'),'box_calls':sum(r['box_calls'] for r in runs),'artifact_hash_errors':errors}
    primary=len(complete)==12 and loss==0 and gain>0 and stats['success_exact_p']<.05
    steps_ok=median([p['arms']['box']['steps']-p['arms']['control']['steps'] for p in comparable]) if comparable else None
    time_ok=median([p['arms']['box']['agent_seconds']-p['arms']['control']['agent_seconds'] for p in comparable if all(p['arms'][a]['agent_seconds'] is not None for a in ['control','box'])]) if comparable else None
    cost=len(complete)==12 and len(comparable)>=6 and (stats['median_token_reduction'] or 0)>=.2 and stats['token_exact_p']<.05 and steps_ok is not None and steps_ok<=0 and time_ok is not None and time_ok<=0 and all(all(p['arms'][a]['agent_seconds'] is not None for a in ['control','box']) for p in comparable)
    stats.update(success_signal=primary,cost_signal=cost,median_step_delta=steps_ok,median_seconds_delta=time_ok)
    # The plan's repeat decision is separate from a superiority verdict.
    if len(runs)<24:decision='incomplete'
    elif loss and not gain:decision='stop without repeats'
    elif not gain and not cost and (stats['median_token_reduction'] or 0)<.2 and stats['token_exact_p']>=.05:decision='stop without repeats'
    else:decision='fixed repeats needed before any superiority claim'
    return {'stats':stats,'repeat_decision':decision,'pairs':pairs,'limitations':['Twelve selected tasks, one initial pair each; small effects cannot be distinguished','Unknown/missing tests are not successes or ordinary task failures','Agent receives failing tests unlike published Gate 2 setting','Total tokens include cached input and output reasoning, not an API invoice','Reading classifier proxies are not cognition; spans and search errors matter']}
if __name__=='__main__':
    result=collect('--quick' not in sys.argv)
    output=HERE/('progress.json' if '--quick' in sys.argv else 'summary.json');output.write_bytes(json.dumps(result,indent=2).encode('utf-8'))
    print(json.dumps({'stats':result['stats'],'repeat_decision':result['repeat_decision']},indent=2))
