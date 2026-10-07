"""Executed only in the bounded replay container; outputs raw runs and assertions."""
import hashlib
import json
import os
import pathlib
import subprocess
from python_adapter import graph, coverage

out = pathlib.Path('/record')


def run(label, argv, env=None):
    result = subprocess.run(argv, cwd='/case/tree', env={**os.environ, **(env or {})}, capture_output=True, text=True, timeout=100)
    record = {'argv': argv, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    (out / (label + '.json')).write_text(json.dumps(record, indent=2))
    return record


plain = run('python-plain', ['python', 'tests/example.py'])
traced = run('python-traced', ['strace', '-f', '-v', '-yy', '-s', '65535', '-e', 'trace=file,getdents64', '-o', '/record/python.strace', 'python', 'tests/example.py'])
assert plain['exit'] == 0 and plain == {**traced, 'argv': plain['argv']}, (plain, traced)
measured = run('python-coverage', ['python', '-m', 'coverage', 'run', '--data-file=/record/.coverage', 'tests/example.py'])
assert measured['exit'] == 0 and measured == {**plain, 'argv': measured['argv']}
report = run('python-json', ['python', '-m', 'coverage', 'json', '--data-file=/record/.coverage', '-o', '/record/python-coverage.json'])
assert report['exit'] == 0
data = coverage(json.loads((out / 'python-coverage.json').read_text()))
assert 'pkg/hot.py' in data['executed'] and 'pkg/helper.py' in data['executed']
assert 'pkg/cold.py' not in data['executed'] and 'pkg/empty.py' not in data['executed']
assert 5 not in data['statements']['pkg/hot.py']
contents = {str(p.relative_to('/case/tree')): p.read_text() for p in pathlib.Path('/case/tree').rglob('*.py')}
parsed = graph(contents, [''])
assert any(e.get('to') == 'pkg/helper.py' for e in parsed['graph']['pkg/hot.py'])
assert any(e.get('to') == 'pkg/__init__.py' for e in parsed['graph']['tests/example.py'])
(out / 'python-adapter.json').write_text(json.dumps({'coverage': data, 'graph': parsed}, indent=2))
assert run('typescript-transpile', ['node', '/opt/instrument/typescript_adapter.mjs', 'transpile', '/case/tree', '/record/build'])['exit'] == 0
plain = run('typescript-plain', ['node', '/record/build/tests/example.js'])
traced = run('typescript-traced', ['strace', '-f', '-v', '-yy', '-s', '65535', '-e', 'trace=file,getdents64', '-o', '/record/typescript.strace', 'node', '/record/build/tests/example.js'])
assert plain['exit'] == 0 and plain == {**traced, 'argv': plain['argv']}, (plain, traced)
measured = run('typescript-coverage', ['node', '/record/build/tests/example.js'], {'NODE_V8_COVERAGE': '/record/v8'})
assert measured == plain
mapped = run('typescript-extract', ['node', '/opt/instrument/typescript_adapter.mjs', 'extract', '/record/v8', '/record/build', '/case/tree'])
assert mapped['exit'] == 0, mapped
data = json.loads(mapped['stdout'])
assert 'src/hot.ts' in data['executed'] and 'src/helper.ts' in data['executed']
assert 'src/importonly.ts' in data['executed']
assert all(p not in data['executed'] for p in ['src/typeonly.ts', 'src/empty.ts', 'src/cold.ts'])
assert 3 not in data['statements']['src/hot.ts']
versions = run('versions', ['sh', '-c', 'node --version; python --version; coverage --version; pytest --version; strace --version'])
summary = {'status': 'passed', 'checks': ['Python actual coverage', 'relative/import-submodule graph', 'TypeScript mapped V8 coverage', 'dead/type/comment exclusion', 'plain/traced parity', 'network/host-repository absence'], 'versions': versions}
(out / 'fixture-result.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(summary))
