"""Keep tmpfs alive until host captures records; container exit is child verdict."""
import json
import os
import pathlib
import selectors
import signal
import subprocess
import sys
import time

timeout = float(sys.argv[1]) / 1000
argv = sys.argv[2:]
started = time.monotonic()
child = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
streams = selectors.DefaultSelector()
streams.register(child.stdout, selectors.EVENT_READ, ('stdout', sys.stdout.buffer))
streams.register(child.stderr, selectors.EVENT_READ, ('stderr', sys.stderr.buffer))
totals = {'stdout': 0, 'stderr': 0}
limit = 16 * 1024 * 1024
timed_out = False
output_limited = False
killed = False

def stop_child():
    global killed
    if not killed:
        killed = True
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

while streams.get_map():
    if time.monotonic() - started >= timeout and child.poll() is None:
        timed_out = True
        stop_child()
    for key, _ in streams.select(.05):
        data = os.read(key.fileobj.fileno(), 65536)
        if not data:
            streams.unregister(key.fileobj)
            continue
        name, target = key.data
        remaining = max(0, limit - totals[name])
        totals[name] += len(data)
        if len(data) > remaining:
            output_limited = True
            stop_child()
        target.write(data[:remaining])
        target.flush()
    # A child may exit leaving descendants holding its output pipes.
    if time.monotonic() - started >= timeout:
        timed_out = True
        stop_child()

child_exit = child.wait()
# Descendants must not keep mutating artifacts while the host captures them.
stop_child()
exit_code = 124 if timed_out else 125 if output_limited else child_exit if child_exit >= 0 else 128 - child_exit
result = {'argv': argv, 'childExit': child_exit, 'containerExit': exit_code,
          'timedOut': timed_out, 'outputLimited': output_limited, 'outputBytes': totals}
pathlib.Path('/record/supervisor.json').write_text(json.dumps(result))
# This sentinel only signals capture readiness; host uses actual container exit.
pathlib.Path('/tmp/lab-supervisor-ready').write_text('ready')
deadline = time.monotonic() + 60
while not pathlib.Path('/tmp/lab-supervisor-release').exists() and time.monotonic() < deadline:
    time.sleep(.05)
sys.exit(exit_code)
