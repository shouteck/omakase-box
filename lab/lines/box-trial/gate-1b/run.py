"""Gate 1b sequential runner. No third-party code runs on the host.

python lab/lines/box-trial/gate-1b/run.py [task ids]
Keeps one image at a time: the previous task's image is removed only after the next
is pulled, so images of one project share their layers. Removes only images that were
absent before this runner pulled them.
"""
import sys, pathlib, json, subprocess, hashlib, time, re, uuid

HERE = pathlib.Path(__file__).resolve().parent
GATE1 = HERE.parent / 'gate-1'
REPO = HERE.parents[3]
RECORDS = HERE / 'records'


def command(argv, timeout=1800):
    return subprocess.run(argv, capture_output=True, timeout=timeout)


def idle():
    for attempt in range(16):
        result = command(['node', str(REPO / 'lab/tools/kitchen-busy.mjs')])
        if result.returncode == 0 and result.stdout.startswith(b'idle '):
            return
        if attempt < 15:
            print('Kitchen busy; waiting one minute before any heavy work', flush=True)
            time.sleep(60)
    raise RuntimeError('Kitchen remained busy for fifteen minutes')


def names(row, key):
    value = row[key]
    return json.loads(value) if isinstance(value, str) else value


def django_label(text):
    match = re.match(r'^(\S+) \((\S+)\)$', text)
    if not match:
        return None
    name, path = match.groups()
    return path if path.endswith('.' + name) else path + '.' + name


def prepare(row):
    """Runtime task: test patch and commands only. Never the historical fix or the issue."""
    failing, passing = names(row, 'FAIL_TO_PASS'), names(row, 'PASS_TO_PASS')
    files = re.findall(r'^\+\+\+ b/(.+\.py)$', row['test_patch'], re.M)
    task = {k: row[k] for k in ('instance_id', 'repo', 'base_commit', 'test_patch')}
    task['notes'] = []
    if row['repo'] == 'django/django':
        labels = [django_label(t) for t in failing]
        if None in labels:
            raise RuntimeError('unparseable Django failing-test name')
        modules = {l.rsplit('.', 2)[0] for l in labels}
        neighbours = [l for l in (django_label(t) for t in passing) if l and l.rsplit('.', 2)[0] in modules and l not in labels]
        skipped = sum(django_label(t) is None for t in passing)
        if skipped:
            task['notes'].append('%d passing names unparseable, not usable as neighbours' % skipped)
        base = ['tests/runtests.py', '--verbosity', '2', '--settings=test_sqlite', '--parallel', '1']
        task['failing_argv'] = base + labels
        task['neighbour_argv'] = base + neighbours if neighbours else None
    elif row['repo'] == 'sympy/sympy':
        task['failing_argv'] = ['sympy', json.dumps({'files': files, 'names': failing})]
        task['neighbour_argv'] = ['sympy', json.dumps({'files': files, 'names': passing})] if passing else None
        task['notes'].append('SymPy runner called in-process; test names match by substring')
    else:
        test_files = {t.split('::')[0] for t in failing}
        neighbours = [t for t in passing if t.split('::')[0] in test_files]
        base = ['pytest', '-rA', '-vv', '--tb=short', '-p', 'no:cacheprovider']
        task['failing_argv'] = base + failing
        task['neighbour_argv'] = base + neighbours if neighbours else None
    task['neighbour_count'] = len(task['neighbour_argv'] or []) - (6 if task['neighbour_argv'] and task['neighbour_argv'][0] != 'sympy' else 0)
    return task


def run(row, held):
    ident = row['instance_id']
    directory = RECORDS / ident
    if (directory / 'attempt.json').exists():
        print(ident + ' retained existing attempt', flush=True)
        return held
    directory.mkdir(parents=True, exist_ok=True)
    record = {'instance_id': ident, 'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    name = 'lab-gate-1b-' + str(uuid.uuid4())
    image = json.loads((GATE1 / 'image-digests.json').read_text())[ident]
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
        started = time.monotonic()
        pulled = command(['docker', 'pull', image])
        record['pull_seconds'] = time.monotonic() - started
        (directory / 'pull.log').write_bytes(pulled.stdout + pulled.stderr)
        if pulled.returncode:
            raise RuntimeError('image-pull-failed')
        if held and held != image:
            command(['docker', 'image', 'rm', held])
            held = None
        record['image_id'] = json.loads(command(['docker', 'image', 'inspect', image]).stdout)[0]['Id']
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
        print(ident + ' running three phases (300 second cap each)', flush=True)
        result = command(['docker', 'start', '-a', name], timeout=1100)
        (directory / 'container.log').write_bytes(result.stdout + result.stderr)
        record['attach_exit'] = result.returncode
        record['state'] = json.loads(command(['docker', 'inspect', name, '--format', '{{json .State}}']).stdout)
        copied = command(['docker', 'cp', name + ':/tmp/lab-gate-1b-output/.', str(directory)])
        if copied.returncode:
            raise RuntimeError('No captured artifacts: ' + copied.stderr.decode(errors='replace'))
        record['status'] = 'captured' if (directory / 'failing.trace.json').exists() else 'missing-trace'
    except Exception as error:
        record['status'] = 'unknown'
        record['error'] = str(error)
    finally:
        if created:
            command(['docker', 'rm', '-f', name])
        record['artifacts'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}
        (directory / 'attempt.json').write_bytes(json.dumps(record, indent=2).encode())
        print(ident + ' ' + record['status'] + (' ' + record.get('error', '')), flush=True)
    if not existed and command(['docker', 'image', 'inspect', image]).returncode == 0:
        return image
    return held


if __name__ == '__main__':
    rows = json.loads((GATE1 / 'tasks.json').read_text(encoding='utf8'))
    wanted = set(sys.argv[1:])
    held = None
    try:
        for row in rows:
            if not wanted or row['instance_id'] in wanted:
                held = run(row, held)
    finally:
        if held:
            removed = command(['docker', 'image', 'rm', held])
            print('removed last held image: exit ' + str(removed.returncode), flush=True)
