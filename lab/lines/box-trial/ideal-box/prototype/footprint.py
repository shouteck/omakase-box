"""Compact footprint and one-task completion latency; no model token claims."""
import base64,gzip,json,pathlib,statistics,sys,time,shutil
import measure
from adapter import sha
from display import complete
HERE=pathlib.Path(__file__).resolve().parent
def stats(rows):
    reached=[q['metrics'] for q in rows if q['metrics']['ordinary_first'] is not None]
    net=[(q['metrics']['potential_prefix_saved_bytes'] or 0)-q['metrics']['mark_bytes'] for q in rows]
    return {'queries':len(rows),'reaching':len(reached),'ordinary_rank_median':statistics.median(r['ordinary_first'] for r in reached),
       'box_rank_median':statistics.median(r['box_first'] for r in reached),'reaching_prefix_saved_median_bytes':statistics.median(r['potential_prefix_saved_bytes'] for r in reached),
       'all_query_net_median_bytes':statistics.median(net),'positive_net_queries':sum(x>0 for x in net),'negative_net_queries':sum(x<0 for x in net),
       'badge_added_bytes':sum(q['metrics']['mark_bytes'] for q in rows),'order_only_added_bytes':0,'instruction_bytes':0}
def main():
    report=measure.read(HERE/'summary.json')
    result={'literal':stats([q for t in report['tasks'] for q in t['queries']]),'retained_native':stats(report['native_invocations']),'tasks':[],'latency_sample':[]}
    for t in report['tasks']:
        qs=[q for q in report['native_invocations'] if q['task']==t['task']]
        result['tasks'].append({'task':t['task'],'valid_trace':t['valid_trace'],'literal_queries':len(t['queries']),'literal_net_potential_bytes':t['aggregate']['net_potential_bytes'],
            'retained_queries':len(qs),'retained_net_potential_bytes':sum(q['metrics']['potential_prefix_saved_bytes'] or 0 for q in qs)-sum(q['metrics']['mark_bytes'] for q in qs)})
    ident='django__django-12193';source=measure.sources(ident);cwd=HERE/'scratch'/ident
    for i in range(3):
        start=time.perf_counter();e,trace=measure.evidence(ident,source);index=time.perf_counter()-start
        argv=[shutil.which('rg'),'-n','--with-filename','--no-heading','--color','never','--no-ignore','--hidden','-F','-e','get_context','.']
        start=time.perf_counter();r=complete(argv,cwd,e);elapsed=time.perf_counter()-start
        assert r['added_bytes']==0 and r['exit']==0
        result['latency_sample'].append({'repeat':i+1,'index_seconds':index,'native_plus_display_seconds':elapsed,'native_sha256':sha(r['native']),'shown_sha256':sha(r['shown']),'bytes':len(r['shown'])})
    before=measure.read(HERE/'facts-before-path-cache.json');after=measure.read(HERE/'facts.json')
    initial=measure.read(HERE/'raw/facts-before-path-cache/ordered.json');final=measure.read(HERE/'raw/facts/ordered.json')
    call_keys_equal={(k,v[1]) for k,v in initial['calls'].items()}=={(k,v[1]) for k,v in final['calls'].items()}
    assert call_keys_equal
    first_seen_differences=sum(initial['calls'][k]!=final['calls'][k] for k in initial['calls'])
    assert before['file_answer']==after['file_answer'] and before['route_answer']==after['route_answer']
    assert [(x['event'],x['path'],x['start'],x['line'],x.get('exception_type')) for x in initial['events']]==[(x['event'],x['path'],x['start'],x['line'],x.get('exception_type')) for x in final['events']]
    result['ordered_collector']={'initial_phases':before['phases'],'final_phases':after['phases'],'same_call_key_name_set_and_selected_test_events':True,'global_first_seen_ordinal_differences':first_seen_differences,
       'file_answer_bytes':after['file_answer_bytes'],'route_answer_bytes':after['route_answer_bytes'],'omitted_route_events':after['omitted_events']}
    result['limits']=['Net potential counts bytes before a historical patch target, not actual saved model input.',
       'No-target searches have zero measured prefix saving and retain their badge cost; needed non-target reading is not measured.',
       'One cold index and one completion repeated three times on one task, not thirty-task runtime performance.',
       'Old unique-call first-seen data cannot recover a path; route comes from a fresh selected-test collector.',
       'Python-only helper prototype; other-language collectors not built.']
    result['summary_sha256']=sha((HERE/'summary.json').read_bytes())
    measure.write(HERE/'footprint.json',result)
    print(json.dumps({'literal':result['literal'],'retained':result['retained_native'],'latency_sample':result['latency_sample']}))
if __name__=='__main__':main()
