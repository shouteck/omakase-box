"""Prints the Gate 1b table from summary.json. python lab/lines/box-trial/gate-1b/report.py"""
import json, pathlib, statistics

HERE = pathlib.Path(__file__).resolve().parent
summary = json.loads((HERE / 'summary.json').read_text())
gate1 = {r['instance_id']: r for r in json.loads((HERE.parent / 'gate-1' / 'summary.json').read_text())['tasks']}
print('verdict:', summary['verdict'])
print(json.dumps(summary['counts']))
print('| Task | Narrow Box: functions, % of source | Gate 1 lean % | Fix in Box | After subtraction: functions, fix kept | Trace names fix | Words reaching fix | Ordinary median | Box-first median | Seconds plain / traced / neighbours |')
print('|---|---|---|---|---|---|---|---|---|---|')
pct = lambda x: '%.1f%%' % (100 * x)
for r in summary['tasks']:
    ident = r['instance_id']
    if not r['scoreable']:
        print('| %s | unknown: %s |||||||||' % (ident, r.get('unknown_reason')))
        continue
    g = gate1.get(ident, {})
    lean = pct(g['repository_ratios'][2]) if g.get('repository_ratios') else 'n/a'
    s, m, sec = r['subtracted'], r.get('median'), r['seconds']
    print('| %s%s | %d, %s | %s | %s | %s | %s | %d of %d | %s | %s | %s / %s / %s |' % (
        ident, ' (file target)' if r['file_target'] else '', r['narrow']['functions'], pct(r['narrow']['ratio']), lean,
        'yes' if r['narrow']['fix_any'] else 'NO',
        ('%d, %s' % (s['functions'], 'yes' if s['fix_any'] else 'no')) if s else 'n/a',
        ('yes, #%d of %d' % (r['error_trace']['fix_position_from_innermost'], r['error_trace']['production_functions'])) if r['error_trace']['names_fix'] else 'no (%d named)' % r['error_trace']['production_functions'],
        r['words_reaching_fix'], r['word_count'],
        m['ordinary'] if m else '-', m['narrow'] if m else '-',
        sec.get('plain'), sec.get('failing'), sec.get('neighbours', '-')))
S = [r for r in summary['tasks'] if r['scoreable']]
T = [r for r in S if not r['error_trace']['names_fix']]
W = [r for r in T if r.get('median')]
med = statistics.median
print()
print('narrow Box %% of production source: min %s median %s max %s' % tuple(pct(f([r['narrow']['ratio'] for r in S])) for f in (min, med, max)))
print('narrow Box functions: min %d median %d max %d' % tuple(f([r['narrow']['functions'] for r in S]) for f in (min, med, max)))
print('W tasks: ratio Box-first/ordinary median: ' + ', '.join('%.2f' % (r['median']['narrow'] / r['median']['ordinary']) for r in W))
print('W totals: ordinary %s, Box-first %s' % (sum(r['median']['ordinary'] for r in W), sum(r['median']['narrow'] for r in W)))
print('best word on W: ordinary median %s, Box-first median %s' % (med([r['best_word']['ordinary_first'] for r in W]), med([r['best_word']['narrow_cost'] for r in W])))
print('seconds: plain median %.1f max %.1f; traced median %.1f max %.1f; host parse median %.1f; host box median %.3f' % (
    med([r['seconds']['plain'] for r in S]), max(r['seconds']['plain'] for r in S), med([r['seconds']['failing'] for r in S]), max(r['seconds']['failing'] for r in S),
    med([r['host_parse_seconds'] for r in S]), med([r['host_box_seconds'] for r in S])))
print('timeouts:', {r['instance_id']: r['timed_out'] for r in summary['tasks'] if any(r.get('timed_out', {}).values())})
print('narrow hits among reaching words, W:', sum(r['median']['narrow_hits'] for r in W), 'of', sum(r['words_reaching_fix'] for r in W))
