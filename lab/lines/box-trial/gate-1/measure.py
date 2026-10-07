"""Pure source/trace packaging, then score-only historical patch mapping."""
import ast, gzip, hashlib, importlib.util, json, pathlib, re, sys, statistics

HERE = pathlib.Path(__file__).resolve().parent
adapter_path = HERE.parents[1] / 'example-slice/instrument/runtime/python_adapter.py'
spec = importlib.util.spec_from_file_location('lab_python_adapter', adapter_path)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

def production(path):
    parts = pathlib.PurePosixPath(path).parts
    return not any(p in ('tests', 'test', 'docs', 'doc', 'examples', 'benchmarks', 'benchmark', 'vendor', 'vendored') for p in parts) and not re.match(r'(test_.*|.*_test)\.py$', parts[-1])

def functions(text):
    tree = ast.parse(text)
    rows = []
    def visit(node, parents=()):
        for n in ast.iter_child_nodes(node):
            if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                qualified = '.'.join(parents + (n.name,))
                if not isinstance(n, ast.ClassDef):
                    start = min([n.lineno] + [d.lineno for d in n.decorator_list])
                    rows.append({'name': qualified, 'start': start, 'def_line': n.lineno, 'end': n.end_lineno,
                                 'body_start': n.body[0].lineno, 'node': n, 'parents': parents})
                visit(n, parents + (n.name,))
            else:
                visit(n, parents)
    visit(tree)
    return rows

def lean(text, rows, called, keep_docstrings=False):
    lines = text.splitlines(keepends=True)
    replacements = []
    for row in sorted(rows, key=lambda r: (r['start'], -r['end'])):
        if any(start <= row['start'] <= end for start, end, _ in replacements):
            continue
        if row['name'] in called or any(other['name'] in called and row['start'] <= other['start'] <= row['end'] for other in rows):
            continue
        node = row['node']
        # Header includes decorators/multiline arguments. One-line defs need a colon cut.
        prefix = ''.join(lines[row['start'] - 1:row['body_start'] - 1])
        if row['body_start'] == row['def_line']:
            line = lines[row['def_line'] - 1]
            prefix = ''.join(lines[row['start'] - 1:row['def_line'] - 1]) + line[:node.body[0].col_offset].rstrip() + '\n'
        first = node.body[0]
        if keep_docstrings and isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
            prefix += ''.join(lines[first.lineno - 1:first.end_lineno])
        prefix += ' ' * (node.col_offset + 4) + '[body omitted; repository remains searchable]\n'
        replacements.append((row['start'], row['end'], prefix))
    for start, end, prefix in reversed(replacements):
        lines[start - 1:end] = [prefix]
    return ''.join(lines)

def construct(directory, task):
    source = json.loads(gzip.decompress((directory / 'sources.json.gz').read_bytes()))
    tests = json.loads((directory / 'tests.json').read_text())
    trace = json.loads((directory / 'trace.json').read_text())
    execution = json.loads((directory / 'execution.json').read_text())
    contents = source | tests
    trees, parse_errors = {}, []
    for path, text in contents.items():
        try:
            trees[path] = functions(text)
        except (SyntaxError, ValueError, RecursionError) as error:
            parse_errors.append(path)
    graph = adapter.graph({p: contents[p] for p in trees}, ['', 'lib'])['graph']
    seeds = set(trace['files']) & set(contents) | set(tests)
    selected, pending, unresolved = set(), list(seeds), []
    while pending:
        path = pending.pop()
        if path in selected:
            continue
        selected.add(path)
        if path not in graph:
            unresolved.append({'from': path, 'kind': 'unparsed'})
        for edge in graph.get(path, []):
            if edge['kind'] == 'local':
                pending.append(edge['to'])
            else:
                unresolved.append({'from': path, **edge})
    ordered = sorted(selected, key=lambda p: (trace['files'].get(p, float('inf')), p))
    rows, called = {}, {}
    for path in ordered:
        called[path] = {r['name'] for r in trees.get(path, []) if path + ':' + str(r['start']) in trace['calls'] or path + ':' + str(r['def_line']) in trace['calls']}
        rows[path] = sorted(trees.get(path, []), key=lambda r: (trace['calls'].get(path + ':' + str(r['start']), trace['calls'].get(path + ':' + str(r['def_line']), float('inf'))), r['start']))
    is_test = lambda p: not production(p) or pathlib.PurePosixPath(p).name == 'conftest.py'
    header = 'Open repository context. Entry: ' + json.dumps(execution['argv']) + '\nUnresolved import observations: ' + str(len(unresolved)) + '; subprocess coverage unavailable.\n'
    presentations = [header, header, header]
    preregistered_lean = header
    for path in ordered:
        banner = '\n### ' + path + '\n'
        full = contents[path]
        index = 'Executed functions: ' + ', '.join(r['name'] for r in rows[path] if r['name'] in called[path]) + '\n'
        reduced = full if is_test(path) or path in parse_errors else lean(full, rows[path], called[path])
        original_reduced = full if is_test(path) or path in parse_errors else lean(full, rows[path], called[path], keep_docstrings=True)
        presentations[0] += banner + full
        presentations[1] += banner + index + full
        presentations[2] += banner + index + reduced
        preregistered_lean += banner + index + original_reduced
    production_bytes = sum(len(t.encode()) for p, t in source.items() if production(p))
    all_bytes = sum(len(t.encode()) for t in source.values())
    package_root = {'astropy/astropy': 'astropy/', 'django/django': 'django/', 'matplotlib/matplotlib': 'lib/matplotlib/',
                    'scikit-learn/scikit-learn': 'sklearn/', 'sphinx-doc/sphinx': 'sphinx/', 'sympy/sympy': 'sympy/'}[task['repo']]
    package_bytes = sum(len(t.encode()) for p, t in source.items() if p.startswith(package_root))
    dependency_bytes = execution['dependency_bytes']
    if (directory / 'dependency-correction.json').exists():
        dependency_bytes = json.loads((directory / 'dependency-correction.json').read_text())['result']['dependency_bytes']
    # Normal failures only. Mere mention in collection output does not admit a task.
    log = (directory / 'test.log').read_text(errors='replace')
    log = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', log)
    expected = json.loads(task['FAIL_TO_PASS']) if isinstance(task['FAIL_TO_PASS'], str) else task['FAIL_TO_PASS']
    pytest_failed = re.findall(r'^FAILED\s+(\S+)', log, re.M)
    pytest_failed += re.findall(r'^(\S+::\S+)\s+(?:FAILED|ERROR)\b', log, re.M)
    django_failed = re.findall(r'^(test\S+)\s+\(([^)]+)\).*?\b(?:FAIL|ERROR)\s*$', log, re.M)
    django_failed += re.findall(r'^(?:FAIL|ERROR): (test\S+)\s+\(([^)]+)\)', log, re.M)
    normal_names = pytest_failed + [a + ' (' + b + ')' for a, b in django_failed]
    def name_match(a, b):
        return a == b or a.replace('::', '.') == b.replace('::', '.')
    matched = [name for name in expected if any(name_match(name, observed) for observed in normal_names)]
    if task['repo'] == 'django/django':
        matched += [name for name in expected if re.search(r'^' + re.escape(name) + r'\s+\.\.\.\s+(?:FAIL|ERROR)\s*$', log, re.M)]
    if task['repo'] == 'sympy/sympy' and re.search(r'\b\d+ failed\b', log):
        matched += [name for name in expected if re.search(r'^' + re.escape(name.rsplit(':', 1)[-1]) + r'\s+F\b', log, re.M)]
    admitted = bool(matched) and execution['exit'] != 0 and not execution['timed_out'] and not re.search(r'ERROR collecting|errors during collection|ImportError while loading conftest', log)
    package = {'instance_id': task['instance_id'], 'files': ordered,
               'functions': {p: [{'name': r['name'], 'start': r['start'], 'end': r['end'], 'executed': r['name'] in called[p],
                                  'body_present': is_test(p) or any(a['name'] in called[p] and a['start'] <= r['start'] and a['end'] >= r['end'] for a in rows[p])}
                                 for r in rows[p]] for p in ordered},
               'bytes': [len(t.encode()) for t in presentations], 'sha256': [hashlib.sha256(t.encode()).hexdigest() for t in presentations],
               'preregistered_docstring_lean_bytes': len(preregistered_lean.encode()),
               'production_bytes': production_bytes, 'all_python_bytes': all_bytes, 'package_bytes': package_bytes,
               'dependency_bytes': dependency_bytes, 'unresolved': unresolved, 'parse_errors': parse_errors,
               'trace_file_count': len(trace['files']), 'admitted': admitted, 'matched_fail_to_pass': sorted(set(matched)),
               'normal_failed_names': normal_names, 'seconds': execution['seconds']}
    for i, text in enumerate(presentations, 1):
        (directory / ('level-' + str(i) + '.txt')).write_bytes(text.encode())
    (directory / 'packaging.json').write_bytes(json.dumps(package, indent=2).encode())
    return package, source, trees

def patch_changes(patch, source):
    changes = {}
    current, old, new, removed_anchor = None, 0, 0, None
    rebuilt, cursor = [], 0
    def finish():
        if current is not None:
            original = source.get(current, '').splitlines(keepends=True)
            changes[current]['new_text'] = ''.join(rebuilt + original[cursor:])
    for line in patch.splitlines():
        if line.startswith('diff --git '):
            finish()
            current = line.split(' b/', 1)[1]
            changes.setdefault(current, {'old_lines': set(), 'new_lines': [], 'new_functions': []})
            rebuilt, cursor, removed_anchor = [], 0, None
        elif line.startswith('@@ '):
            match = re.match(r'@@ -(\d+)(?:,\d+)? \+(\d+)', line)
            if match:
                old, new = map(int, match.groups())
                original = source.get(current, '').splitlines(keepends=True)
                rebuilt += original[cursor:max(0, old - 1)]
                cursor, removed_anchor = max(0, old - 1), None
        elif current and line.startswith('-') and not line.startswith('---'):
            if removed_anchor is None:
                removed_anchor = old
            changes[current]['old_lines'].add(old)
            old += 1
            cursor += 1
        elif current and line.startswith('+') and not line.startswith('+++'):
            # Addition belongs at the following old line, or final previous line at EOF.
            length = len(source.get(current, '').splitlines())
            changes[current]['old_lines'].add(min(max(1, removed_anchor if removed_anchor is not None else old), max(1, length)))
            changes[current]['new_lines'].append(line[1:])
            rebuilt.append(line[1:] + '\n')
            new += 1
        elif current and line.startswith(' '):
            rebuilt.append(line[1:] + '\n')
            old += 1
            new += 1
            cursor += 1
            removed_anchor = None
    finish()
    return changes

def score(package, source, trees, task):
    selected = set(package['files'])
    file_rank = {p: i + 1 for i, p in enumerate(package['files'])}
    ranks, counter = {}, 0
    for p in package['files']:
        for row in package['functions'][p]:
            counter += 1
            ranks[(p, row['name'])] = counter
    changed, module_edits, new_functions = [], [], []
    changes = patch_changes(task['patch'], source)
    for path, change in changes.items():
        if not path.endswith(('.py', '.pyi')) or not production(path):
            continue
        if path not in source or path not in trees:
            module_edits.append({'path': path, 'included': False, 'reason': 'new-or-unparsed-file'})
            continue
        funcs = trees[path]
        affected = set()
        for line in change['old_lines']:
            containing = [r for r in funcs if r['start'] <= line <= r['end']]
            if containing:
                affected.add(min(containing, key=lambda r: r['end'] - r['start'])['name'])
            else:
                module_edits.append({'path': path, 'line': line, 'included': path in selected})
        existing_names = {r['name'] for r in funcs}
        for added in functions(change['new_text']):
            if added['name'] not in existing_names:
                new_functions.append({'path': path, 'name': added['name'], 'included': False})
        for name in sorted(affected):
            manifest = next((r for r in package['functions'].get(path, []) if r['name'] == name), None)
            changed.append({'path': path, 'name': name, 'named': manifest is not None,
                            'executed': manifest['executed'] if manifest else False,
                            'lean_body': bool(manifest and manifest['body_present']),
                            'file_rank': file_rank.get(path), 'function_rank': ranks.get((path, name))})
    changed_files = [p for p in changes if p.endswith(('.py', '.pyi')) and production(p)]
    names_all = bool(changed_files) and all(p in selected for p in changed_files) and all(r['named'] for r in changed) and not new_functions and all(r['included'] for r in module_edits)
    ratios = [n / package['production_bytes'] for n in package['bytes']]
    eligible = [i + 1 for i, ratio in enumerate(ratios) if ratio < .1 and names_all]
    verdict = 'pass' if package['admitted'] and eligible else 'fail' if package['admitted'] else 'unknown'
    return {'instance_id': task['instance_id'], 'repo': task['repo'], 'verdict': verdict, 'admitted': package['admitted'],
            'level_bytes': package['bytes'], 'production_bytes': package['production_bytes'], 'all_python_bytes': package['all_python_bytes'],
            'preregistered_docstring_lean_ratio': package['preregistered_docstring_lean_bytes'] / package['production_bytes'],
            'repository_ratios': ratios, 'all_python_ratios': [n / package['all_python_bytes'] for n in package['bytes']],
            'package_bytes': package['package_bytes'], 'dependency_bytes': package['dependency_bytes'],
            'primary_package_ratios': [n / package['package_bytes'] if package['package_bytes'] else None for n in package['bytes']],
            'free_baseline_ratios': [n / (package['package_bytes'] + package['dependency_bytes']) for n in package['bytes']],
            'named_all_changed': names_all, 'eligible_levels': eligible,
            'changed_functions': changed, 'new_functions': new_functions, 'module_edits': module_edits,
            'changed_files': [{'path': p, 'included': p in selected, 'rank': file_rank.get(p)} for p in changed_files],
            'worst_function_rank': max((r['function_rank'] or 0 for r in changed), default=0) if names_all else None,
            'lean_bodies_all_changed': names_all and all(r['lean_body'] for r in changed),
            'selected_files': len(package['files']), 'trace_files': package['trace_file_count'],
            'unresolved_count': len(package['unresolved']), 'parse_errors': package['parse_errors'],
            'seconds': package['seconds'], 'presentation_sha256': package['sha256']}

def measure(task):
    directory = HERE / 'records' / task['instance_id']
    if not (directory / 'trace.json').exists():
        return {'instance_id': task['instance_id'], 'repo': task['repo'], 'verdict': 'unknown', 'reason': 'no captured trace'}
    try:
        package, source, trees = construct(directory, task)
        # First access to production historical patch occurs in this scorer.
        result = score(package, source, trees, task)
    except Exception as error:
        result = {'instance_id': task['instance_id'], 'repo': task['repo'], 'verdict': 'unknown', 'reason': repr(error)}
    (directory / 'measurement.json').write_bytes(json.dumps(result, indent=2).encode())
    return result

if __name__ == '__main__':
    tasks = json.loads((HERE / 'tasks.json').read_text(encoding='utf8'))
    wanted = set(sys.argv[1:])
    rows = [measure(task) for task in tasks if not wanted or task['instance_id'] in wanted]
    counts = {v: sum(r['verdict'] == v for r in rows) for v in ('pass', 'fail', 'unknown')}
    verdict = 'pass' if counts['pass'] >= 15 else 'fail' if counts['pass'] + counts['unknown'] < 15 and len(rows) == 30 else 'undecidable'
    summary = {'verdict': verdict, 'counts': counts, 'tasks': rows}
    target = HERE / ('summary.json' if not wanted else 'sample-rerun.json')
    target.write_bytes(json.dumps(summary, indent=2).encode())
    print(json.dumps({'verdict': verdict, 'counts': counts, 'rows': [{k: r.get(k) for k in ('instance_id', 'verdict', 'repository_ratios', 'named_all_changed', 'reason')} for r in rows]}, indent=2))
