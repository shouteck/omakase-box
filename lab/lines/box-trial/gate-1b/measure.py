"""Gate 1b host measurement. Pure Python over recorded artifacts; runs no project code.

python lab/lines/box-trial/gate-1b/measure.py [task ids]
Writes records/<task>/measurement.json and, for a full run, summary.json; a partial
run writes sample-rerun.json. Everything follows gate-1b-plan.md; the historical fix
is read only in `targets`, after the Boxes and word lists are built.
"""
import builtins, gzip, importlib.util, json, keyword, pathlib, re, statistics, sys, time

HERE = pathlib.Path(__file__).resolve().parent
GATE1 = HERE.parent / 'gate-1'
RECORDS = HERE / 'records'
spec = importlib.util.spec_from_file_location('lab_gate1_measure', GATE1 / 'measure.py')
gate1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate1)
production, functions, patch_changes = gate1.production, gate1.functions, gate1.patch_changes

ANSI = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')
FRAME = re.compile(r'File "([^"]+)", line (\d+), in (\S+)|^(\S+\.py):(\d+): in (\S+)', re.M)
WORD = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')
DROP = set(keyword.kwlist) | set(dir(builtins))
CAP_WORDS = 60


def innermost(rows, line):
    containing = [r for r in rows if r['start'] <= line <= r['end']]
    return min(containing, key=lambda r: r['end'] - r['start']) if containing else None


def called_functions(trace, trees):
    """Production functions credited with a call. Lambdas and comprehensions go to the enclosing def."""
    found, test_calls = set(), 0
    for key, (order, name) in trace.items():
        path, line = key.rsplit(':', 1)
        if not production(path):
            test_calls += 1
            continue
        if name == '<module>' or path not in trees:
            continue
        row = innermost(trees[path], int(line))
        if row:
            found.add((path, row['start']))
    return found, test_calls


def failed_named(task, row, log):
    """At least one named failing test reported failed or errored by the plain run."""
    names = json.loads(row['FAIL_TO_PASS']) if isinstance(row['FAIL_TO_PASS'], str) else row['FAIL_TO_PASS']
    if row['repo'] == 'django/django':
        return any(re.search(r'^(FAIL|ERROR): ' + re.escape(n.split(' ')[0]) + r' \(', log, re.M) for n in names)
    if row['repo'] == 'sympy/sympy':
        return any(re.search(r'^' + re.escape(n) + r' (F|E)\b', log, re.M) for n in names) or bool(re.search(r'tests finished: .*(failed|exceptions)', log))
    # Newer pytest prints 'FAILED <id>' in its summary; older pytest only '<id> FAILED' in the -vv listing.
    return any(re.search(r'^(FAILED|ERROR) ' + re.escape(n) + r'( |$)', log, re.M)
               or re.search(r'^' + re.escape(n) + r' (FAILED|ERROR)( |$)', log, re.M) for n in names)


def code_words(text):
    """Identifiers that look like code names, in order of first appearance. Plan, step 4."""
    out = []
    for match in WORD.finditer(text):
        word, start, end = match.group(), match.start(), match.end()
        if len(word) < 4 or word in DROP or word in out:
            continue
        looks = '_' in word or re.search(r'[a-z][A-Z]', word) or text[end:end + 1] == '(' or (start > 0 and text[start - 1] == '.')
        if looks:
            out.append(word)
    return out


def failure_text(log):
    match = re.search(r'^.*(FAILURES|ERRORS|Traceback|FAIL:|ERROR:).*$', log, re.M)
    return log[match.start():] if match else ''


def targets(row, source, trees):
    """First and only use of the historical fix."""
    found, files, module_only = set(), set(), False
    for path, change in patch_changes(row['patch'], source).items():
        if not path.endswith(('.py', '.pyi')) or not production(path):
            continue
        files.add(path)
        for line in change['old_lines']:
            hit = innermost(trees.get(path, []), line)
            if hit:
                found.add((path, hit['start']))
    return found, files


def measure(row):
    ident = row['instance_id']
    directory = RECORDS / ident
    result = {'instance_id': ident, 'repo': row['repo'], 'scoreable': False}
    def unknown(reason):
        result['unknown_reason'] = reason
        (directory / 'measurement.json').write_bytes(json.dumps(result, indent=2).encode())
        return result
    if not (directory / 'execution.json').exists():
        directory.mkdir(parents=True, exist_ok=True)
        return unknown('no execution record')
    execution = json.loads((directory / 'execution.json').read_text())
    phases = execution['phases']
    result['seconds'] = {k: round(v['seconds'], 2) for k, v in phases.items()}
    result['timed_out'] = {k: v['timed_out'] for k, v in phases.items()}
    task = json.loads((directory / 'task.json').read_text())
    result['notes'] = task.get('notes', [])
    started = time.perf_counter()
    source = json.loads(gzip.decompress((GATE1 / 'records' / ident / 'sources.json.gz').read_bytes()))
    trees = {}
    for path, text in source.items():
        try:
            trees[path] = functions(text)
        except (SyntaxError, ValueError, RecursionError):
            pass
    result['host_parse_seconds'] = round(time.perf_counter() - started, 2)
    production_bytes = sum(len(t.encode()) for p, t in source.items() if production(p))
    lines = {p: t.splitlines() for p, t in source.items()}
    log = ANSI.sub('', (directory / 'plain.log').read_bytes().decode('utf8', 'replace'))
    if phases['plain']['timed_out'] or not failed_named(task, row, log):
        return unknown('plain run timed out or did not report a named failing test as failed')
    if phases['failing']['timed_out'] or not (directory / 'failing.trace.json').exists():
        return unknown('traced run timed out or left no trace')
    started = time.perf_counter()
    narrow, test_calls = called_functions(json.loads((directory / 'failing.trace.json').read_text()), trees)
    result['host_box_seconds'] = round(time.perf_counter() - started, 3)
    if not test_calls:
        return unknown('trace has no call from a test file')
    subtracted = None
    if 'neighbours' in phases and not phases['neighbours']['timed_out'] and (directory / 'neighbours.trace.json').exists():
        neighbours, _ = called_functions(json.loads((directory / 'neighbours.trace.json').read_text()), trees)
        subtracted = narrow - neighbours
    row_of = {(p, r['start']): r for p, rows in trees.items() for r in rows}
    def size(box):
        return sum(len('\n'.join(lines[p][row_of[(p, s)]['start'] - 1:row_of[(p, s)]['end']]).encode()) for p, s in box)
    # Words are fixed before the fix is read.
    issue_words, failure_words = code_words(row['problem_statement']), code_words(failure_text(log))
    words = (issue_words + [w for w in failure_words if w not in issue_words])[:CAP_WORDS]
    # Error-trace frames, innermost last in the log; keep distinct production functions, innermost first.
    frames = []
    for m in FRAME.finditer(log):
        path, line = (m.group(1), m.group(2)) if m.group(1) else (m.group(4), m.group(5))
        path = path[len('/testbed/'):] if path.startswith('/testbed/') else path
        if path in trees and production(path):
            hit = innermost(trees[path], int(line))
            frames.append((path, hit['start'] if hit else None))
    trace_functions = []
    for frame in reversed(frames):
        if frame not in trace_functions:
            trace_functions.append(frame)

    target, target_files = targets(row, source, trees)
    if not target_files:
        return unknown('fix changes no production Python')
    file_target = not target
    result['file_target'] = file_target
    inside = (lambda p, n: p in target_files) if file_target else (lambda p, n: any(tp == p and row_of[(tp, ts)]['start'] <= n <= row_of[(tp, ts)]['end'] for tp, ts in target))
    in_box = lambda box: (any(p in target_files for p, _ in box) if file_target else bool(target & box))
    all_in_box = lambda box: (target_files <= {p for p, _ in box} if file_target else target <= box)
    result.update({
        'scoreable': True, 'production_bytes': production_bytes,
        'target': sorted([p, row_of[(p, s)]['name']] for p, s in target) if target else sorted([p, None] for p in target_files),
        'narrow': {'functions': len(narrow), 'bytes': size(narrow), 'ratio': size(narrow) / production_bytes,
                   'fix_any': in_box(narrow), 'fix_all': all_in_box(narrow)},
        'subtracted': None if subtracted is None else {'functions': len(subtracted), 'bytes': size(subtracted), 'ratio': size(subtracted) / production_bytes,
                                                         'fix_any': in_box(subtracted), 'fix_all': all_in_box(subtracted)},
    })
    named = [i + 1 for i, (p, s) in enumerate(trace_functions) if (p in target_files if file_target else (p, s) in target)]
    result['error_trace'] = {'production_functions': len(trace_functions), 'names_fix': bool(named), 'fix_position_from_innermost': named[0] if named else None}

    ordered_paths = sorted(source)

    def matches_of(word):
        pattern = re.compile(r'(?<![A-Za-z0-9_])' + re.escape(word) + r'(?![A-Za-z0-9_])')
        return [(path, number) for path in ordered_paths for number, text in enumerate(lines[path], 1)
                if word in text and pattern.search(text)]

    def spans_of(box):
        spans = {}
        for p, s in box:
            spans.setdefault(p, []).append((row_of[(p, s)]['start'], row_of[(p, s)]['end']))
        return spans

    def position(matches, spans=None):
        """Matches in path then line order; count them and find the first one inside the target."""
        count, first = 0, None
        for path, number in matches:
            if spans is not None and not any(a <= number <= b for a, b in spans.get(path, ())):
                continue
            count += 1
            if first is None and inside(path, number):
                first = count
        return count, first

    box_spans = {'narrow': spans_of(narrow), 'subtracted': None if subtracted is None else spans_of(subtracted)}
    rows = []
    for word in words:
        entry = {'word': word, 'from': ('issue' if word in issue_words else '') + ('+failure' if word in failure_words else '')}
        found = matches_of(word)
        entry['ordinary_matches'], entry['ordinary_first'] = position(found)
        for label in ('narrow', 'subtracted'):
            if box_spans[label] is None:
                continue
            matches, first = position(found, box_spans[label])
            entry[label + '_matches'], entry[label + '_first'] = matches, first
            if entry['ordinary_first'] is not None:
                entry[label + '_cost'] = first if first is not None else matches + entry['ordinary_first']
        rows.append(entry)
    result['word_count'] = len(words)
    result['word_cap_hit'] = len(issue_words) + len([w for w in failure_words if w not in issue_words]) > CAP_WORDS
    result['words'] = rows
    reaching = [r for r in rows if r['ordinary_first'] is not None]
    result['words_reaching_fix'] = len(reaching)
    if reaching:
        best = min(reaching, key=lambda r: r['ordinary_first'])
        result['median'] = {'ordinary': statistics.median(r['ordinary_first'] for r in reaching),
                            'narrow': statistics.median(r['narrow_cost'] for r in reaching),
                            'subtracted': statistics.median(r['subtracted_cost'] for r in reaching) if subtracted is not None else None,
                            'narrow_hits': sum(r['narrow_first'] is not None for r in reaching)}
        result['best_word'] = {k: best.get(k) for k in ('word', 'ordinary_first', 'narrow_cost', 'subtracted_cost')}
    (directory / 'measurement.json').write_bytes(json.dumps(result, indent=2).encode())
    return result


def decide(rows):
    S = [r for r in rows if r['scoreable']]
    named = [r for r in S if r['error_trace']['names_fix']]
    in_box = [r for r in S if r['narrow']['fix_any']]
    with_sub = [r for r in in_box if r['subtracted'] is not None]
    sub_keeps = [r for r in with_sub if r['subtracted']['fix_any']]
    sub_admitted = bool(with_sub) and len(sub_keeps) / len(with_sub) >= 0.8
    T = [r for r in S if not r['error_trace']['names_fix']]
    W = [r for r in T if r.get('median')]
    clearly = [r for r in W if r['median']['narrow'] <= 0.5 * r['median']['ordinary']]
    costly = [r for r in W if r not in clearly and r['median']['narrow'] > 1.2 * r['median']['ordinary']]
    counts = {'tasks': len(rows), 'scoreable': len(S), 'unknown': len(rows) - len(S), 'trace_names_fix': len(named),
              'fix_in_narrow_box': len(in_box), 'subtraction_measured': len(with_sub), 'subtraction_keeps_fix': len(sub_keeps),
              'subtracted_box_admitted': sub_admitted, 'T_trace_does_not_name': len(T), 'W_with_reaching_word': len(W),
              'box_first_clearly_fewer': len(clearly), 'box_first_costly': len(costly)}
    if len(S) < 15:
        verdict = 'could-not-be-decided: fewer than 15 scoreable tasks'
    elif len(named) > len(S) / 2:
        verdict = 'stop: error trace names the fix on most tasks'
    elif len(in_box) < len(S) / 2:
        verdict = 'stop: fix usually not in the narrow Box'
    elif len(W) < 8:
        verdict = 'could-not-be-decided: fewer than 8 tasks with a word reaching the fix'
    elif len(clearly) > len(W) / 2 and not costly:
        verdict = 'worth-going-on'
    else:
        verdict = 'stop: Box-first search is not clearly shorter'
    return verdict, counts


if __name__ == '__main__':
    tasks = json.loads((GATE1 / 'tasks.json').read_text(encoding='utf8'))
    wanted = set(sys.argv[1:])
    rows = [measure(t) for t in tasks if not wanted or t['instance_id'] in wanted]
    verdict, counts = decide(rows)
    slim = [{k: v for k, v in r.items() if k != 'words'} for r in rows]
    target = HERE / ('summary.json' if not wanted else 'sample-rerun.json')
    target.write_bytes(json.dumps({'verdict': verdict if not wanted else 'partial', 'counts': counts, 'tasks': slim}, indent=2).encode())
    print(json.dumps({'verdict': verdict if not wanted else 'partial', 'counts': counts}, indent=2))
