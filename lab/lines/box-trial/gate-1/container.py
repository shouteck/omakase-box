"""Lab bridge, Python 3.6+; executed only inside prepared benchmark containers."""
import os, sys, json, subprocess, pathlib, gzip, time, threading, runpy

OUT = pathlib.Path('/tmp/lab-gate-1-output')

def dependency_envelope():
    import sysconfig
    dependency_bytes, dependency_files = 0, 0
    for directory in sorted(set(sysconfig.get_paths()[k] for k in ('purelib', 'platlib'))):
        for p in pathlib.Path(directory).rglob('*.py'):
            if p.is_symlink() or str(p.resolve()).startswith('/testbed/'):
                continue
            dependency_bytes += p.stat().st_size
            dependency_files += 1
    return {'dependency_bytes': dependency_bytes, 'dependency_files': dependency_files}

def child(argv):
    events = {'files': {}, 'calls': {}, 'lines': {}}
    counter = [0]
    paths = {}
    def trace(frame, event, arg):
        name = frame.f_code.co_filename
        if name not in paths:
            resolved = os.path.realpath(name)
            paths[name] = resolved[len('/testbed/'):] if resolved.startswith('/testbed/') else None
        relative = paths[name]
        if relative is None:
            return None
        if event in ('call', 'line'):
            counter[0] += 1
            events['files'].setdefault(relative, counter[0])
            if event == 'call':
                key = relative + ':' + str(frame.f_code.co_firstlineno)
                events['calls'].setdefault(key, counter[0])
            else:
                events['lines'].setdefault(relative, set()).add(frame.f_lineno)
        return trace
    sys.settrace(trace)
    threading.settrace(trace)
    try:
        sys.argv = argv
        sys.path.insert(0, os.getcwd())
        if argv[0] == 'pytest':
            sys.argv[0] = 'pytest'
            runpy.run_module('pytest', run_name='__main__', alter_sys=True)
        else:
            sys.path.insert(0, os.path.dirname(os.path.abspath(argv[0])))
            runpy.run_path(argv[0], run_name='__main__')
    finally:
        sys.settrace(None)
        events['lines'] = {k: sorted(v) for k, v in events['lines'].items()}
        (OUT / 'trace.json').write_text(json.dumps(events, sort_keys=True))

def main():
    task = json.load(open('/lab/task.json'))
    OUT.mkdir(exist_ok=True)
    os.chdir('/testbed')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
    if head != task['base_commit']:
        raise RuntimeError('Prepared image HEAD differs from task base: ' + head)
    names = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    source = {}
    for name in names:
        if name.endswith(('.py', '.pyi')) and not any(p.startswith('.') or p in ('secrets',) for p in pathlib.PurePosixPath(name).parts):
            p = pathlib.Path(name)
            if p.is_file() and not p.is_symlink():
                import tokenize
                with tokenize.open(str(p)) as stream:
                    source[name] = stream.read()
    with gzip.open(str(OUT / 'sources.json.gz'), 'wt', encoding='utf8') as stream:
        json.dump(source, stream)
    patch = pathlib.Path('/tmp/lab-test.patch')
    patch.write_text(task['test_patch'])
    subprocess.check_call(['git', 'apply', str(patch)])
    tests = {}
    for name in task['test_files']:
        if pathlib.Path(name).is_file():
            tests[name] = pathlib.Path(name).read_text()
    (OUT / 'tests.json').write_text(json.dumps(tests))
    # Complete installed dependency envelope; no target import or installation.
    dependencies = dependency_envelope()
    started = time.monotonic()
    argv = [sys.executable, '/lab/container.py', '--child'] + task['argv']
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
    timed_out = False
    try:
        stdout = process.communicate(timeout=300)[0]
    except subprocess.TimeoutExpired:
        import signal
        timed_out = True
        os.killpg(process.pid, signal.SIGKILL)
        stdout = process.communicate()[0]
    (OUT / 'test.log').write_bytes(stdout)
    record = {'base_commit': head, 'python': sys.version, 'argv': task['argv'],
              'exit': process.returncode, 'timed_out': timed_out,
              'seconds': time.monotonic() - started, 'source_files': len(source)}
    record.update(dependencies)
    (OUT / 'execution.json').write_text(json.dumps(record, indent=2))
    print(json.dumps(record))

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--dependencies':
        print(json.dumps(dependency_envelope()))
    elif len(sys.argv) > 1 and sys.argv[1] == '--child':
        child(sys.argv[2:])
    else:
        main()
