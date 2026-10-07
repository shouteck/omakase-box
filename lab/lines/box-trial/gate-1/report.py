"""Render a compact finding from measured rows; no target code or model calls."""
import json, pathlib, statistics
here = pathlib.Path(__file__).resolve().parent
summary = json.loads((here / 'summary.json').read_text())
rows = summary['tasks']
measured = [r for r in rows if 'repository_ratios' in r]
admitted = [r for r in measured if r['admitted'] and not r['unsupported_fix_source_files']]
percent = lambda value: '—' if value is None else f'{100 * value:.1f}%'
spread = lambda values: '—' if not values else f'{percent(min(values))}–{percent(max(values))}; median {percent(statistics.median(values))}'
counts = summary['counts']
facts = {
    'completed_tasks': len(rows), 'admitted_tasks': len(admitted), 'counts': counts, 'verdict': summary['verdict'],
    'all_functions_named': sum(r['named_all_changed'] for r in admitted),
    'all_changed_bodies_present': sum(r['lean_bodies_all_changed'] for r in admitted),
    'lean_under_tenth': sum(r['repository_ratios'][2] < .1 for r in admitted),
    'all_tracked_python_combined_successes': sum(min(r['all_python_ratios']) < .1 and r['named_all_changed'] for r in admitted),
    'all_tracked_python_lean_range': spread([r['all_python_ratios'][2] for r in admitted]),
    'original_docstring_detail_successes': sum(r['preregistered_docstring_lean_ratio'] < .1 and r['named_all_changed'] for r in admitted),
    'lean_range': spread([r['repository_ratios'][2] for r in admitted]),
    'original_lean_range': spread([r['preregistered_docstring_lean_ratio'] for r in admitted]),
    'package_range': spread([r['primary_package_ratios'][2] for r in admitted]),
    'envelope_range': spread([r['free_baseline_ratios'][2] for r in admitted]),
    'worst_fix_function_ranks': [r['worst_function_rank'] for r in admitted if r['worst_function_rank'] is not None],
    'unexecuted_changed_functions': sum(not f['executed'] for r in admitted for f in r['changed_functions']),
    'signature_only_changed_functions': sum(f['named'] and not f['lean_body'] for r in admitted for f in r['changed_functions']),
    'omitted_changed_functions': sum(not f['named'] for r in admitted for f in r['changed_functions']),
    'new_changed_functions': sum(len(r['new_functions']) for r in admitted),
    'admitted_seconds': sum(r['seconds'] for r in admitted),
}
(here / 'aggregate.json').write_bytes(json.dumps(facts, indent=2).encode())
text = '# Gate 1: open packaging size\n\n8 October 2026. Fixed sample: 30 SWE-bench Verified tasks, five per repository; six large Python repositories. No repair agents or Gate 2 runs.\n\n'
text += f'**{summary["verdict"].upper()}: {counts["pass"]} confirmed successes among 30 fixed tasks; {counts["fail"]} confirmed misses and {counts["unknown"]} unknown. Fifteen successes were required.**\n\n'
text += '| Measurement | Observed |\n|---|---|\n'
text += f'| Named failing test reproduced and scoreable | {len(admitted)}/30 |\n'
text += f'| Lean packaging below 10% of production Python source | {facts["lean_under_tenth"]}/{len(admitted)} admitted |\n'
text += f'| Every changed function and non-function edit included by name/path | {facts["all_functions_named"]}/{len(admitted)} admitted |\n'
text += f'| Every changed function body retained in lean detail | {facts["all_changed_bodies_present"]}/{len(admitted)} admitted |\n'
text += f'| Lean / production Python source | {facts["lean_range"]} |\n'
text += f'| Lean / all tracked Python, including tests/docs/examples | {facts["all_tracked_python_lean_range"]}; {facts["all_tracked_python_combined_successes"]} combined successes |\n'
text += f'| Original full-docstring lean / production Python source | {facts["original_lean_range"]}; {facts["original_docstring_detail_successes"]} combined successes |\n'
text += f'| Lean / whole primary package, including internal tests | {facts["package_range"]} |\n'
text += f'| Lean / primary package + installed dependency envelope | {facts["envelope_range"]} |\n'
text += '\n## Every fixed task\n\n| Task | Result | Files / repo | Marked / repo | Lean / repo | All fix names | Worst function manifest rank |\n|---|---|---:|---:|---:|---|---:|\n'
for r in rows:
    ratios = r.get('repository_ratios', [None] * 3)
    text += f'| {r["instance_id"]} | {r["verdict"]} | {percent(ratios[0])} | {percent(ratios[1])} | {percent(ratios[2])} | {r.get("named_all_changed", "—")} | {r.get("worst_function_rank") or "—"} |\n'
text += '\n## Meaning and limits\n\n'
text += 'This measures one conservative runtime-plus-local-import-closure method, with whole modified test files as the trace scope. Full AST import closure can pull in most of a library; tracing only individual failed tests or omitting never-executed imports would be a different method and was not tried. The open repository remains available. Small text and named signatures do not establish repair success or token savings. Production Python bytes are a narrower denominator than all languages or disk size; the per-task JSON also gives all tracked Python and primary-package denominators. The installed dependency envelope is deliberately not represented as a minimal transitive closure.\n\n'
text += 'The sample and threshold were committed before dataset acquisition. The final signature-only detail was corrected after preliminary results; the original full-docstring detail is retained as a sensitivity. A slow initial tracer attempt is preserved, not silently replaced; the same task was retraced after a path-resolution performance correction. Output format parsing and the first ancillary dependency count were corrected with raw records preserved. Threads are traced, subprocesses/compiled extensions are not. Unknowns are never counted as passes. Function identity includes its base source line, distinguishing property getter/setter bodies. Historical patches are used only after packaging construction. See the [method and reproduction commands](gate-1/README.md) and [preregistration plus amendment](gate-1-plan.md).\n\n'
text += 'Per-task records include changed function names, constructor identities, body/signature/omission status, new functions, module edits, file/function ranks, unresolved imports, exact sizes, runtime and immutable image/artifact receipts. The aggregate is in `gate-1/aggregate.json`; detailed rows are in `gate-1/summary.json`. Raw snapshots/logs remain on this host with hashes; public pinned images and test overlays permit reconstruction.\n\n'
text += '## Sceptic\n\nPending one independent sample reproduction before closing the gate.\n'
(here.parent / 'gate-1-result.md').write_bytes(text.encode())
print(json.dumps(facts, indent=2))
