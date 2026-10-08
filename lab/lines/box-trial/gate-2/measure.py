"""Gate 2: what published agent runs read before reaching the fix, against the Box.

python lab/lines/box-trial/gate-2/measure.py [task ids]
Host only; reads recorded run records, Gate 1's base snapshots and Gate 1b's traces.
Writes summary.json (full run) or sample-rerun.json. Follows gate-2-plan.md.
"""
import gzip, importlib.util, json, pathlib, re, shlex, statistics, sys

HERE = pathlib.Path(__file__).resolve().parent
GATE1, GATE1B = HERE.parent / 'gate-1', HERE.parent / 'gate-1b'
spec = importlib.util.spec_from_file_location('lab_gate1b_measure', GATE1B / 'measure.py')
g1b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g1b)
production, innermost, patch_changes = g1b.production, g1b.innermost, g1b.patch_changes

VIEWERS = {'cat', 'sed', 'nl', 'head', 'tail', 'less', 'more', 'bat'}
SEARCH = re.compile(r'(^|[\s|;&(])(grep|egrep|fgrep|rg|ag|ack|find)(\s|$)|git\s+grep')
EDIT = re.compile(r"\bsed\s+(-[a-zA-Z]*\s+)*-i|\bperl\s+-[a-zA-Z]*pi|\bgit\s+apply\b|(^|\s)patch\s|apply_patch|(?<![0-9&])>{1,2}\s*[\w./'\"$-]|\btee\s|write_text\(|\.write\(|open\([^)]*,\s*['\"][wa]")
RUN = re.compile(r'(^|[\s;&|(])(python[0-9.]*|pytest|tox|bin/test|\./\S+)(\s|$)')
RANGE = re.compile(r"(\d+)\s*,\s*(\d+)\s*p")
HIT = re.compile(r'^(?:\./|/testbed/)?([\w./+-]+\.pyi?)[:-](\d+)[:-]')
NUMBERED = re.compile(r'^(\d+)[:-]')


def norm(token, source):
    token = token.strip('\'"')
    for prefix in ('/testbed/', './'):
        if token.startswith(prefix):
            token = token[len(prefix):]
    return token if token in source else None


def segments(command):
    """Split on && ; newline, except when a here-document is present (then one segment)."""
    if '<<' in command:
        return [command]
    parts = re.split(r'&&|;|\n', command)
    return [p.strip() for p in parts if p.strip() and not re.match(r'^cd\s+\S+$', p.strip())]


def words(segment):
    try:
        return shlex.split(segment, posix=True)
    except ValueError:
        return segment.split()


def classify(segment, output, source):
    """Returns (classes, views [(path, a, b)], hits [(path, line)], edited paths)."""
    tokens = words(segment)
    paths = [p for p in (norm(t, source) for t in tokens) if p]
    first = tokens[0] if tokens else ''
    out_lines = output.splitlines()
    if EDIT.search(segment):
        named = paths or [p for p in (norm(m, source) for m in re.findall(r"[\w./+-]+\.pyi?", segment)) if p]
        return {'edit'}, [], [], sorted(set(named))
    if first in VIEWERS and paths:
        path, length = paths[0], len(source[paths[0]].splitlines())
        ranges = RANGE.findall(segment)
        if ranges:
            spans = [(int(a), min(int(b), length)) for a, b in ranges]
        elif first == 'head' or '| head' in segment:
            n = re.search(r'head\s+(?:-n\s*)?-?(\d+)', segment)
            spans = [(1, min(int(n.group(1)) if n else 10, length))]
        elif first == 'tail' or '| tail' in segment:
            n = re.search(r'tail\s+(?:-n\s*)?-?(\d+)', segment)
            count = int(n.group(1)) if n else 10
            spans = [(max(1, length - count + 1), length)]
        else:
            spans = [(1, min(length, max(1, len(out_lines))))]
        return {'view'}, [(path, a, b) for a, b in spans if a <= b], [], []
    if SEARCH.search(segment):
        hits = []
        for line in out_lines:
            m = HIT.match(line)
            if m and norm(m.group(1), source):
                hits.append((norm(m.group(1), source), int(m.group(2))))
            elif len(paths) == 1:
                n = NUMBERED.match(line)
                if n:
                    hits.append((paths[0], int(n.group(1))))
        return {'search'}, [], hits, []
    if RUN.search(segment):
        return {'run'}, [], [], []
    return {'other'}, [], [], []


def steps_of(record):
    """One step per assistant action: command, its tool output, the call's input tokens.

    Outputs are matched to actions by call id where the record has one (a call can hold
    several actions); otherwise they go to the latest action.
    """
    steps, current, by_id = [], None, {}
    for message in record['messages']:
        extra = message.get('extra') or {}
        if extra.get('actions'):
            usage = message.get('usage') or ((extra.get('response') or {}).get('usage')) or {}
            tokens = usage.get('input_tokens', usage.get('prompt_tokens'))
            for action in extra['actions']:
                current = {'command': action.get('command') or '', 'output': '', 'input_tokens': tokens}
                tokens = None  # count a call's input once, even with several actions
                steps.append(current)
                if action.get('tool_call_id'):
                    by_id[action['tool_call_id']] = current
        elif 'raw_output' in extra and current is not None:
            owner = by_id.get(message.get('call_id') or message.get('tool_call_id'), current)
            owner['output'] += extra['raw_output'] or ''
    return steps


def measure(agent, row, receipts):
    ident = row['instance_id']
    result = {'agent': agent, 'instance_id': ident, 'resolved': receipts[agent][ident].get('resolved')}
    path = HERE / 'records' / agent / (ident + '.traj.json')
    if not path.exists():
        return dict(result, status='record missing')
    source = json.loads(gzip.decompress((GATE1 / 'records' / ident / 'sources.json.gz').read_bytes()))
    trees = {}
    for p, text in source.items():
        try:
            trees[p] = g1b.functions(text)
        except (SyntaxError, ValueError, RecursionError):
            pass
    row_of = {(p, r['start']): r for p, rows in trees.items() for r in rows}
    trace_path = GATE1B / 'records' / ident / 'failing.trace.json'
    box = rival = None
    if trace_path.exists():
        trace = json.loads(trace_path.read_text())
        box, _ = g1b.called_functions(trace, trees)
        rival = {k.rsplit(':', 1)[0] for k in trace if production(k.rsplit(':', 1)[0])}
    box_files = None if box is None else {p for p, _ in box}
    target, target_files = g1b.targets(row, source, trees)
    file_target = not target
    spans = [(p, row_of[(p, s)]['start'], row_of[(p, s)]['end']) for p, s in target]
    in_target = (lambda p, a, b: p in target_files) if file_target else (lambda p, a, b: any(tp == p and a <= te and b >= ts for tp, ts, te in spans))
    edit_target_files = target_files if file_target else {p for p, _ in target}

    record = json.loads(path.read_text(encoding='utf8'))
    steps = steps_of(record)
    reached, strict, rows = None, None, []
    for index, step in enumerate(steps):
        classes, functions_viewed, files_seen, hit_reach, strict_reach = set(), set(), set(), False, False
        for segment in segments(step['command']):
            kinds, views, hits, edited = classify(segment, step['output'], source)
            classes |= kinds
            for p, a, b in views:
                files_seen.add(p)
                if production(p):
                    functions_viewed |= {(p, r['start']) for r in trees.get(p, []) if r['start'] <= b and r['end'] >= a}
                hit_reach |= in_target(p, a, b)
                strict_reach |= in_target(p, a, b)
            for p, line in hits:
                files_seen.add(p)
                hit_reach |= in_target(p, line, line)
            hit_reach |= bool(set(edited) & edit_target_files)
            strict_reach |= bool(set(edited) & edit_target_files)
        rows.append({'classes': sorted(classes), 'functions': functions_viewed, 'files': files_seen, 'chars': len(step['output']), 'tokens': step['input_tokens']})
        if reached is None and hit_reach:
            reached = index
        if strict is None and strict_reach:
            strict = index

    def tally(part):
        functions = set().union(*[r['functions'] for r in part]) if part else set()
        files = {p for r in part for p in r['files']}
        prod_files = {p for p in files if production(p)}
        out = {'steps': len(part), 'searches': sum('search' in r['classes'] for r in part), 'files': len(files),
               'production_files': len(prod_files), 'functions': len(functions), 'chars': sum(r['chars'] for r in part),
               'input_tokens': sum(r['tokens'] or 0 for r in part)}
        if box is not None:
            out['functions_outside_box'] = len(functions - box - target)
            out['functions_not_target'] = len(functions - target)
            out['files_outside_box'] = len(prod_files - box_files)
            out['files_outside_rival'] = len(prod_files - rival)
        return out

    whole = tally(rows)
    result.update(status='measured', file_target=file_target, steps=len(rows),
                  only_other_steps=sum(r['classes'] == ['other'] for r in rows),
                  class_counts={c: sum(c in r['classes'] for r in rows) for c in ('view', 'search', 'edit', 'run', 'other')},
                  has_box=box is not None, target_in_box=None if box is None else (bool(box_files & target_files) if file_target else bool(box & target)),
                  reached_step=None if reached is None else reached + 1, whole=whole)
    if reached is not None:
        before = tally(rows[:reached])
        result['before'] = before
        result['share_before'] = {'steps': reached / len(rows),
                                  'chars': before['chars'] / whole['chars'] if whole['chars'] else None,
                                  'input_tokens': before['input_tokens'] / whole['input_tokens'] if whole['input_tokens'] else None}
    # Sensitivity outside the plan: a search hit does not count as reaching; only a view or an edit does.
    result['strict_reached_step'] = None if strict is None else strict + 1
    if strict is not None:
        early = tally(rows[:strict])
        result['strict_before'] = early
        result['strict_share_before'] = {'steps': strict / len(rows), 'chars': early['chars'] / whole['chars'] if whole['chars'] else None,
                                         'input_tokens': early['input_tokens'] / whole['input_tokens'] if whole['input_tokens'] else None}
    submission = (record.get('info') or {}).get('submission') or ''
    own_functions, own_files = set(), set()
    for p, change in patch_changes(submission, source).items():
        if p.endswith(('.py', '.pyi')) and production(p):
            own_files.add(p)
            for line in change['old_lines']:
                hit = innermost(trees.get(p, []), line)
                if hit:
                    own_functions.add((p, hit['start']))
    result['own_patch'] = {'production_files': sorted(own_files), 'functions': len(own_functions),
                           'same_files_as_fix': own_files == set(target_files),
                           'files_outside_box': None if box is None else sorted(own_files - box_files),
                           'functions_outside_box': None if box is None else sorted(p + ':' + row_of[(p, s)]['name'] for p, s in own_functions - box)}
    return result


def summarise(rows):
    out = {}
    med = lambda values: statistics.median(values) if values else None
    for agent in sorted({r['agent'] for r in rows}):
        mine = [r for r in rows if r['agent'] == agent and r['status'] == 'measured']
        reached = [r for r in mine if r['reached_step']]
        boxed = [r for r in reached if r['has_box']]
        share = lambda r, a, b: r['before'][a] / r['before'][b] if r['before'][b] else None
        out[agent] = {
            'records': len(mine), 'missing': sum(r['agent'] == agent and r['status'] != 'measured' for r in rows),
            'resolved': sum(r['resolved'] is True for r in mine), 'reached_fix': len(reached),
            'never_reached': [r['instance_id'] for r in mine if not r['reached_step']],
            'steps_whole_median': med([r['steps'] for r in mine]),
            'steps_before_median': med([r['reached_step'] - 1 for r in reached]),
            'share_steps_before_median': med([r['share_before']['steps'] for r in reached]),
            'share_chars_before_median': med([r['share_before']['chars'] for r in reached if r['share_before']['chars'] is not None]),
            'share_input_tokens_before_median': med([r['share_before']['input_tokens'] for r in reached if r['share_before']['input_tokens'] is not None]),
            'searches_before_median': med([r['before']['searches'] for r in reached]),
            'files_before_median': med([r['before']['files'] for r in reached]),
            'functions_before_median': med([r['before']['functions'] for r in reached]),
            'chars_before_median': med([r['before']['chars'] for r in reached]),
            'functions_before_not_target_total': sum(r['before']['functions_not_target'] for r in boxed),
            'functions_before_outside_box_total': sum(r['before']['functions_outside_box'] for r in boxed),
            'share_functions_outside_box_median': med([s for s in (share(r, 'functions_outside_box', 'functions_not_target') for r in boxed) if s is not None]),
            'tasks_reading_any_function_before': sum(r['before']['functions_not_target'] > 0 for r in boxed),
            'production_files_before_total': sum(r['before']['production_files'] for r in boxed),
            'files_before_outside_box_total': sum(r['before']['files_outside_box'] for r in boxed),
            'files_before_outside_rival_total': sum(r['before']['files_outside_rival'] for r in boxed),
            'own_patch_outside_box_files': {r['instance_id']: r['own_patch']['files_outside_box'] for r in mine if r['own_patch']['files_outside_box']},
            'own_patch_outside_box_functions': sum(bool(r['own_patch']['functions_outside_box']) for r in mine),
            'unresolved': [{'instance_id': r['instance_id'], 'target_in_box': r['target_in_box'], 'reached': bool(r['reached_step'])} for r in mine if r['resolved'] is not True],
            'strict': (lambda sr, sb: {
                'reached': len(sr), 'steps_before_median': med([r['strict_reached_step'] - 1 for r in sr]),
                'share_steps_median': med([r['strict_share_before']['steps'] for r in sr]),
                'share_chars_median': med([r['strict_share_before']['chars'] for r in sr if r['strict_share_before']['chars'] is not None]),
                'share_input_tokens_median': med([r['strict_share_before']['input_tokens'] for r in sr if r['strict_share_before']['input_tokens'] is not None]),
                'share_steps_max': max([r['strict_share_before']['steps'] for r in sr], default=None),
                'functions_before_median': med([r['strict_before']['functions'] for r in sr]),
                'functions_not_target_total': sum(r['strict_before']['functions_not_target'] for r in sb),
                'functions_outside_box_total': sum(r['strict_before']['functions_outside_box'] for r in sb),
                'tasks_reading_any_function_before': sum(r['strict_before']['functions_not_target'] > 0 for r in sb),
                'production_files_total': sum(r['strict_before']['production_files'] for r in sb),
                'files_outside_box_total': sum(r['strict_before']['files_outside_box'] for r in sb),
                'files_outside_rival_total': sum(r['strict_before']['files_outside_rival'] for r in sb),
                'chars_before_median': med([r['strict_before']['chars'] for r in sr]),
            })([r for r in mine if r.get('strict_reached_step')], [r for r in mine if r.get('strict_reached_step') and r['has_box']]),
            'only_other_steps_share': sum(r['only_other_steps'] for r in mine) / max(1, sum(r['steps'] for r in mine)),
            'class_counts': {c: sum(r['class_counts'][c] for r in mine) for c in ('view', 'search', 'edit', 'run', 'other')},
        }
    return out


if __name__ == '__main__':
    tasks = json.loads((GATE1 / 'tasks.json').read_text(encoding='utf8'))
    receipts = json.loads((HERE / 'receipts.json').read_text())['records']
    wanted = set(sys.argv[1:])
    rows = [measure(agent, t, receipts) for agent in receipts for t in tasks if not wanted or t['instance_id'] in wanted]
    summary = {'agents': summarise(rows), 'rows': rows}
    (HERE / ('summary.json' if not wanted else 'sample-rerun.json')).write_text(json.dumps(summary, indent=1, default=sorted))
    print(json.dumps(summary['agents'], indent=1))
