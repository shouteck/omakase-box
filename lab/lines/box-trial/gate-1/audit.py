"""Independent receipt and gold-context checks using data only, never target imports."""
import pathlib, json, gzip, hashlib, re
here = pathlib.Path(__file__).resolve().parent
tasks = json.loads((here / 'tasks.json').read_text(encoding='utf8'))
errors, contexts, ambiguities, images = [], [], [], {}
for task in tasks:
    directory = here / 'records' / task['instance_id']
    attempt = json.loads((directory / 'attempt.json').read_text())
    for name, expected in attempt.get('artifacts', {}).items():
        p = directory / name
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != expected:
            errors.append({'task': task['instance_id'], 'artifact': name})
    if attempt.get('image_digests'):
        images[task['instance_id']] = attempt['image_digests'][0]
    source = json.loads(gzip.decompress((directory / 'sources.json.gz').read_bytes()))
    current, old, verified_lines = None, 0, 0
    for line in task['patch'].splitlines():
        if line.startswith('diff --git '):
            current = line.split(' b/', 1)[1]
        elif line.startswith('@@ '):
            match = re.match(r'@@ -(\d+)(?:,\d+)? \+(\d+)', line)
            old = int(match.group(1))
        elif line.startswith(('---', '+++')):
            continue
        elif current and line.startswith(('-', ' ')):
            if current in source:
                original = source[current].splitlines()
                if old < 1 or old > len(original) or original[old - 1] != line[1:]:
                    errors.append({'task': task['instance_id'], 'patch_context': current, 'line': old})
                else:
                    verified_lines += 1
            old += 1
    contexts.append({'task': task['instance_id'], 'verified_changed_or_context_lines': verified_lines})
    if (directory / 'packaging.json').exists():
        package = json.loads((directory / 'packaging.json').read_text())
        possible = []
        removable_bytes = 0
        for path, functions in package['functions'].items():
            lines = (source.get(path) or '').splitlines(keepends=True)
            for row in functions:
                if not row['executed'] or row['start'] > len(lines):
                    continue
                first = lines[row['start'] - 1]
                if row['start'] == 1 or re.search(r'\blambda\b', first):
                    possible.append({'path': path, 'name': row['name'], 'start': row['start']})
                    # Generous bound: remove the entire ambiguous source span and index name.
                    removable_bytes += len(''.join(lines[row['start'] - 1:row['end']]).encode()) + len(row['name'].encode()) + 2
        ambiguities.append({'task': task['instance_id'], 'possible_source_line_aliases': possible,
                            'lean_ratio_lower_bound_if_all_alias_spans_removed': (package['bytes'][2] - removable_bytes) / package['production_bytes'],
                            'all_python_ratio_lower_bound_if_all_alias_spans_removed': (package['bytes'][2] - removable_bytes) / package['all_python_bytes']})
result = {'errors': errors, 'gold_context_checks': contexts, 'call_line_alias_sensitivity': ambiguities,
          'all_raw_artifact_hashes_match': not any('artifact' in e for e in errors),
          'all_gold_patch_contexts_match_snapshot': not any('patch_context' in e for e in errors)}
(here / 'audit.json').write_bytes(json.dumps(result, indent=2).encode())
(here / 'image-digests.json').write_bytes(json.dumps(images, indent=2).encode())
print(json.dumps({'errors': errors, 'tasks': len(tasks), 'possible_aliases': sum(len(a['possible_source_line_aliases']) for a in ambiguities),
                  'lowest_alias_removal_bound': min(a['lean_ratio_lower_bound_if_all_alias_spans_removed'] for a in ambiguities)}, indent=2))
if errors:
    raise SystemExit(1)
