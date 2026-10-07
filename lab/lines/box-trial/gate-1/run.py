"""Sequential prepared-image runner. No third-party code runs on the host."""
import sys, pathlib, json, subprocess, hashlib, time, re, uuid

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]

def command(argv, timeout=1200):
    return subprocess.run(argv, capture_output=True, timeout=timeout)

def idle():
    result = command(['node', str(REPO / 'lab/tools/kitchen-busy.mjs')])
    if result.returncode or not result.stdout.startswith(b'idle '):
        raise RuntimeError('Kitchen busy: ' + result.stdout.decode())

def prepare(row):
    files = re.findall(r'^\+\+\+ b/(.+\.py)$', row['test_patch'], re.M)
    if not files:
        raise RuntimeError('No Python test-patch files')
    if row['repo'] == 'django/django':
        labels = sorted(set(p.removeprefix('tests/').removesuffix('.py').replace('/', '.') for p in files))
        argv = ['tests/runtests.py', '--verbosity', '2', '--settings=test_sqlite', '--parallel', '1'] + labels
    elif row['repo'] == 'sympy/sympy':
        argv = ['bin/test', '-C', '--verbose'] + files
    else:
        argv = ['pytest', '-rA', '-vv', '--tb=short'] + files
    # Never expose historical production patch to runtime/constructor.
    return {k: row[k] for k in ('instance_id', 'repo', 'base_commit', 'test_patch')} | {'test_files': files, 'argv': argv}

def run(row):
    ident = row['instance_id']
    directory = HERE / 'records' / ident
    if (directory / 'attempt.json').exists():
        print(ident + ' retained existing attempt', flush=True)
        return
    directory.mkdir(parents=True, exist_ok=True)
    record = {'instance_id': ident, 'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    name = 'lab-gate-1-' + str(uuid.uuid4())
    image = 'ghcr.io/epoch-research/swe-bench.eval.x86_64.' + ident + ':latest'
    existed = command(['docker', 'image', 'inspect', image]).returncode == 0
    created = False
    try:
        task = prepare(row)
        (directory / 'task.json').write_bytes(json.dumps(task, indent=2).encode())
        bridge = (HERE / 'container.py').read_bytes()
        (directory / 'bridge.py').write_bytes(bridge)
        record['bridge_sha256'] = hashlib.sha256(bridge).hexdigest()
        idle()
        print(ident + ' pulling prepared environment', flush=True)
        pulled = command(['docker', 'pull', image], timeout=1200)
        (directory / 'pull.log').write_bytes(pulled.stdout + pulled.stderr)
        if pulled.returncode:
            raise RuntimeError('image-pull-failed')
        image_info = json.loads(command(['docker', 'image', 'inspect', image]).stdout)[0]
        record['image_id'] = image_info['Id']
        record['image_digests'] = image_info.get('RepoDigests', [])
        idle()
        args = ['docker', 'create', '--name', name, '--network', 'none', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges', '--memory', '4g', '--cpus', '2', '--pids-limit', '128',
                '--mount', 'type=bind,src=' + str(directory / 'bridge.py') + ',dst=/lab/container.py,readonly',
                '--mount', 'type=bind,src=' + str(directory / 'task.json') + ',dst=/lab/task.json,readonly',
                '--env', 'PYTHONDONTWRITEBYTECODE=1', '--env', 'MPLBACKEND=Agg',
                '--workdir', '/testbed', '--entrypoint', '/bin/bash', record['image_id'], '-lc',
                'source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed && python /lab/container.py']
        record['create_argv'] = args
        result = command(args)
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors='replace'))
        created = True
        print(ident + ' tracing tests (300 second limit)', flush=True)
        result = command(['docker', 'start', '-a', name], timeout=420)
        (directory / 'container.log').write_bytes(result.stdout + result.stderr)
        record['attach_exit'] = result.returncode
        state = command(['docker', 'inspect', name, '--format', '{{json .State}}'])
        record['state'] = json.loads(state.stdout)
        copied = command(['docker', 'cp', name + ':/tmp/lab-gate-1-output/.', str(directory)])
        if copied.returncode:
            raise RuntimeError('No captured artifacts: ' + copied.stderr.decode(errors='replace'))
        record['status'] = 'captured' if (directory / 'trace.json').exists() else 'missing-trace'
    except Exception as error:
        record['status'] = 'unknown'
        record['error'] = str(error)
    finally:
        if created:
            command(['docker', 'rm', '-f', name])
        # Only a previously absent task-specific image is disposable here.
        if not existed:
            command(['docker', 'image', 'rm', image])
        record['artifacts'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}
        (directory / 'attempt.json').write_bytes(json.dumps(record, indent=2).encode())
        print(ident + ' ' + record['status'] + (' ' + record.get('error', '')), flush=True)

if __name__ == '__main__':
    rows = json.loads((HERE / 'tasks.json').read_text(encoding='utf8'))
    wanted = set(a for a in sys.argv[1:] if a != '--retry')
    if '--retry' in sys.argv:
        if not wanted:
            raise RuntimeError('Retries must name exact tasks')
        for ident in wanted:
            if ident not in {r['instance_id'] for r in rows}:
                raise RuntimeError('Unknown retry ID')
            old = HERE / 'records' / ident
            history = HERE / 'records' / 'history' / (ident + '-attempt-1')
            if not (old / 'attempt.json').exists() or history.exists():
                raise RuntimeError('Retry requires a completed first attempt and no previous archive')
            history.parent.mkdir(exist_ok=True)
            old.rename(history)
            print(ident + ' first attempt preserved at ' + str(history), flush=True)
    for row in rows:
        if not wanted or row['instance_id'] in wanted:
            run(row)
