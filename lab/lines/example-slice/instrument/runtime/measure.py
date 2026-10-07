"""One declared Python behavioural command, with separate raw parity/trace/coverage."""
import json
import os
import pathlib
import subprocess
import sys
from python_adapter import coverage

args = sys.argv[1:]
if not args or args[0] not in ('script', 'module') or len(args) < 2:
    raise SystemExit('Usage: measure.py script tests/example.py [args] | module pytest [args]')
mode, target, *arguments = args
plain_argv = ['python'] + (['-m'] if mode == 'module' else []) + [target] + arguments
out = pathlib.Path('/record')


def run(label, argv):
    result = subprocess.run(argv, cwd='/case/tree', env=os.environ, capture_output=True, timeout=110)
    # Preserve bytes losslessly; no failure-identity normalization is done here.
    (out / (label + '.stdout')).write_bytes(result.stdout)
    (out / (label + '.stderr')).write_bytes(result.stderr)
    record = {'argv': argv, 'exit': result.returncode}
    (out / (label + '.execution.json')).write_text(json.dumps(record))
    return result


plain = run('plain', plain_argv)
traced = run('traced', ['strace', '-f', '-v', '-yy', '-s', '65535', '-e', 'trace=file,getdents64', '-o', '/record/files.strace'] + plain_argv)
measured = run('coverage', ['python', '-m', 'coverage', 'run', '--data-file=/record/.coverage'] + (['-m'] if mode == 'module' else []) + [target] + arguments)
reported = run('coverage-json', ['python', '-m', 'coverage', 'json', '--data-file=/record/.coverage', '-o', '/record/coverage.json'])
result = {'plainExit': plain.returncode, 'tracedExit': traced.returncode, 'coverageExit': measured.returncode,
          'rawParity': (plain.returncode, plain.stdout, plain.stderr) == (traced.returncode, traced.stdout, traced.stderr)}
result['coverageRawParity'] = (plain.returncode, plain.stdout, plain.stderr) == (measured.returncode, measured.stdout, measured.stderr)
if reported.returncode == 0:
    result['execution'] = coverage(json.loads((out / 'coverage.json').read_text()))
else:
    result['execution'] = {'status': 'unknown', 'reason': 'coverage JSON unavailable'}
(out / 'measurement.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
