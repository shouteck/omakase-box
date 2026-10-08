"""Prints Gate 2's tables from summary.json. python lab/lines/box-trial/gate-2/report.py"""
import json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
summary = json.loads((HERE / 'summary.json').read_text())
agents = list(summary['agents'])
pct = lambda x: '-' if x is None else '%.0f%%' % (100 * x)
num = lambda x: '-' if x is None else ('%g' % x)

print('| | ' + ' | '.join(agents) + ' |')
print('|---|' + '---|' * len(agents))
A = summary['agents']
line = lambda label, f: print('| ' + label + ' | ' + ' | '.join(f(A[a]) for a in agents) + ' |')
line('Records found, of 30', lambda d: str(d['records']))
line('Task resolved', lambda d: '%d of %d' % (d['resolved'], d['records']))
line('Run reached the fix (search hit, view or edit)', lambda d: '%d of %d' % (d['reached_fix'], d['records']))
line('Steps in a run, median', lambda d: num(d['steps_whole_median']))
line('Steps before reaching, median', lambda d: num(d['steps_before_median']))
line('Share of the run before reaching: steps / output text / input tokens, medians', lambda d: ' / '.join(pct(d[k]) for k in ('share_steps_before_median', 'share_chars_before_median', 'share_input_tokens_before_median')))
line('Searches before reaching, median', lambda d: num(d['searches_before_median']))
line('Production functions read before reaching, other than the fix: all tasks together', lambda d: str(d['functions_before_not_target_total']))
line('... of which outside the narrow Box', lambda d: str(d['functions_before_outside_box_total']))
line('... tasks where any such function was read', lambda d: str(d['tasks_reading_any_function_before']))
line('Production files viewed or hit before reaching: all tasks together', lambda d: str(d['production_files_before_total']))
line('... outside the Box / outside the rival file filter', lambda d: '%d / %d' % (d['files_before_outside_box_total'], d['files_before_outside_rival_total']))
line('**Stricter: reached only by viewing or editing the fix** (not in the plan)', lambda d: '%d of %d' % (d['strict']['reached'], d['records']))
line('... steps before, median', lambda d: num(d['strict']['steps_before_median']))
line('... share of the run before: steps / output text / input tokens, medians', lambda d: ' / '.join(pct(d['strict'][k]) for k in ('share_steps_median', 'share_chars_median', 'share_input_tokens_median')))
line('... largest share of steps before, any task', lambda d: pct(d['strict']['share_steps_max']))
line('... functions read before, other than the fix; outside the Box', lambda d: '%d; %d, on %d tasks' % (d['strict']['functions_not_target_total'], d['strict']['functions_outside_box_total'], d['strict']['tasks_reading_any_function_before']))
line('... production files before; outside the Box / outside the rival filter', lambda d: '%d; %d / %d' % (d['strict']['production_files_total'], d['strict']['files_outside_box_total'], d['strict']['files_outside_rival_total']))
line('Own patch changes a production file with no Box function', lambda d: str(len(d['own_patch_outside_box_files'])) + ' tasks')
line('Steps the classifier could only call "other"', lambda d: pct(d['only_other_steps_share']))
print()
rows = {(r['agent'], r['instance_id']): r for r in summary['rows']}
ids = []
for r in summary['rows']:
    if r['instance_id'] not in ids:
        ids.append(r['instance_id'])
print('| Task | ' + ' | '.join(a + ': resolved; steps; reached at (hit, view or edit) / (view or edit only); functions read before, outside Box / all' for a in agents) + ' |')
print('|---|' + '---|' * len(agents))
for ident in ids:
    cells = []
    for a in agents:
        r = rows[(a, ident)]
        if r['status'] != 'measured':
            cells.append('no record')
            continue
        sb = r.get('strict_before')
        cells.append('%s; %d; %s / %s; %s' % ('yes' if r['resolved'] else 'NO', r['steps'], r['reached_step'] or 'never', r.get('strict_reached_step') or 'never',
                                              ('%d / %d' % (sb['functions_outside_box'], sb['functions_not_target'])) if sb and r['has_box'] else '-'))
    print('| ' + ident + ' | ' + ' | '.join(cells) + ' |')
