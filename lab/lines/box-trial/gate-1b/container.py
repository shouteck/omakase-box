"""Gate 1b bridge, Python 3.6+; executed only inside prepared benchmark containers.

Three phases, each a fresh process with a 300 second cap: the named failing tests
untraced; the same under a call tracer; their passing neighbours under the tracer.
"""
import os, sys, json, subprocess, pathlib, time, threading, runpy, signal

OUT = pathlib.Path('/tmp/lab-gate-1b-output')
CAP = 300


def child(mode, target, argv):
    calls, counter, paths = {}, [0], {}

    def trace(frame, event, arg):
        if event != 'call':
            return None
        name = frame.f_code.co_filename
        if name not in paths:
            resolved = os.path.realpath(name)
            paths[name] = resolved[len('/testbed/'):] if resolved.startswith('/testbed/') else None
        relative = paths[name]
        if relative is not None:
            key = relative + ':' + str(frame.f_code.co_firstlineno)
            if key not in calls:
                counter[0] += 1
                calls[key] = [counter[0], frame.f_code.co_name]
        return None  # call events only; no line tracing

    if mode == 'trace':
        threading.settrace(trace)
        sys.settrace(trace)
    try:
        sys.path.insert(0, os.getcwd())
        if argv[0] == 'pytest':
            sys.argv = argv
            runpy.run_module('pytest', run_name='__main__', alter_sys=True)
        elif argv[0] == 'sympy':
            request = json.loads(argv[1])
            import sympy
            ok = sympy.test(*request['files'], kw=tuple(request['names']), subprocess=False, verbose=True)
            sys.exit(0 if ok else 1)
        else:
            sys.argv = argv
            sys.path.insert(0, os.path.dirname(os.path.abspath(argv[0])))
            runpy.run_path(argv[0], run_name='__main__')
    finally:
        sys.settrace(None)
        if mode == 'trace':
            pathlib.Path(target).write_text(json.dumps(calls, sort_keys=True))


def phase(name, mode, argv):
    started = time.monotonic()
    command = [sys.executable, '/lab/container.py', '--child', mode, str(OUT / (name + '.trace.json'))] + argv
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
    timed_out = False
    try:
        output = process.communicate(timeout=CAP)[0]
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGKILL)
        output = process.communicate()[0]
    (OUT / (name + '.log')).write_bytes(output)
    return {'argv': argv, 'exit': process.returncode, 'timed_out': timed_out, 'seconds': time.monotonic() - started}


def main():
    task = json.load(open('/lab/task.json'))
    OUT.mkdir(exist_ok=True)
    os.chdir('/testbed')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
    if head != task['base_commit']:
        raise RuntimeError('Prepared image HEAD differs from task base: ' + head)
    patch = pathlib.Path('/tmp/lab-test.patch')
    patch.write_text(task['test_patch'])
    subprocess.check_call(['git', 'apply', str(patch)])
    record = {'base_commit': head, 'python': sys.version, 'phases': {}}
    record['phases']['plain'] = phase('plain', 'plain', task['failing_argv'])
    record['phases']['failing'] = phase('failing', 'trace', task['failing_argv'])
    if task.get('neighbour_argv'):
        record['phases']['neighbours'] = phase('neighbours', 'trace', task['neighbour_argv'])
    (OUT / 'execution.json').write_text(json.dumps(record, indent=2))
    print(json.dumps(record))


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--child':
        child(sys.argv[2], sys.argv[3], sys.argv[4:])
    else:
        main()
