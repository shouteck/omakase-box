import json,pathlib,statistics
H=pathlib.Path(__file__).resolve().parent
s=json.loads((H/'summary.json').read_bytes());f=json.loads((H/'footprint.json').read_bytes())
for name,rows in [('literal',[q for t in s['tasks'] for q in t['queries']]),('retained_native',s['native_invocations'])]:
 reach=[q['metrics'] for q in rows if q['metrics']['ordinary_first'] is not None]
 net=[(q['metrics']['potential_prefix_saved_bytes'] or 0)-q['metrics']['mark_bytes'] for q in rows]
 expected={'queries':len(rows),'reaching':len(reach),'ordinary_rank_median':statistics.median(r['ordinary_first'] for r in reach),'box_rank_median':statistics.median(r['box_first'] for r in reach),'reaching_prefix_saved_median_bytes':statistics.median(r['potential_prefix_saved_bytes'] for r in reach),'all_query_net_median_bytes':statistics.median(net),'positive_net_queries':sum(v>0 for v in net),'negative_net_queries':sum(v<0 for v in net),'badge_added_bytes':sum(q['metrics']['mark_bytes'] for q in rows),'order_only_added_bytes':0,'instruction_bytes':0}
 assert expected==f[name]
print('Independent footprint arithmetic matches both entire corpora.')
