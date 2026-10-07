"""Ancillary counter rerun for the first trace; never modifies its raw record."""
import pathlib, json, subprocess, uuid, hashlib
here = pathlib.Path(__file__).resolve().parent
directory = here / 'records/astropy__astropy-14539'
attempt = json.loads((directory / 'attempt.json').read_text())
busy = subprocess.run(['node', str(here.parents[3] / 'lab/tools/kitchen-busy.mjs')], capture_output=True)
if busy.returncode or not busy.stdout.startswith(b'idle '):
    raise RuntimeError('Kitchen busy')
argv = ['docker', 'run', '--rm', '--name', 'lab-gate-1-dependency-' + str(uuid.uuid4()), '--network', 'none',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only', '--memory', '1g', '--cpus', '1',
        '--pids-limit', '32', '--env', 'PYTHONDONTWRITEBYTECODE=1',
        '--mount', 'type=bind,src=' + str(here / 'container.py') + ',dst=/lab/container.py,readonly',
        '--entrypoint', '/bin/bash', attempt['image_id'], '-lc',
        'source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed && python /lab/container.py --dependencies']
result = subprocess.run(argv, capture_output=True, timeout=60)
if result.returncode:
    raise RuntimeError(result.stderr.decode(errors='replace'))
record = {'argv': argv, 'image_id': attempt['image_id'], 'result': json.loads(result.stdout),
          'bridge_sha256': hashlib.sha256((here / 'container.py').read_bytes()).hexdigest(),
          'stdout_sha256': hashlib.sha256(result.stdout).hexdigest()}
target = directory / 'dependency-correction.json'
if target.exists():
    old = json.loads(target.read_text())
    if old['result'] != record['result']:
        raise RuntimeError('Dependency envelope changed')
else:
    target.write_bytes(json.dumps(record, indent=2).encode())
print(json.dumps(record['result']))
