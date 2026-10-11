"""box trace startup hook — loaded by site.py in every Python process whose
environment carries it (`box trace` puts this directory on PYTHONPATH, so
child Python processes the command starts inherit it and trace themselves).

Call events only: sys.monitoring PY_START on 3.12+, sys.settrace('call')
elsewhere. Line events made the lab's tracer too slow to use. Each process
writes one JSON record into BOX_TRACE_DIR at exit; box trace merges them.

The hook must never disturb the traced program: it writes nothing to
stdout/stderr, and a failure inside it ends as an error-*.json note the
merge can report, never a traceback in the test's output.
"""
import ast
import atexit
import json
import os
import sys
import threading
import time
import uuid

_root = os.environ.get('BOX_TRACE_ROOT')
_out = os.environ.get('BOX_TRACE_DIR')

if _root and _out:
    # normcase folds Windows case/separators; the root spelling and a loaded
    # file's spelling may differ in case even for the same path.
    _root = os.path.normcase(os.path.realpath(_root)) + os.sep
    _resolved = {}
    _calls = {}
    _loaded = set()
    _order = [0]
    _started = time.time()

    def _resolve(name):
        path = _resolved.get(name, False)
        if path is False:
            path = None
            # '<frozen ...>', '<string>' and friends are pseudo-filenames;
            # realpath would place them under the cwd and fake a repo file.
            if not name.startswith('<'):
                try:
                    real = os.path.normcase(os.path.realpath(name))
                except OSError:
                    real = None
                if real is not None and real.startswith(_root):
                    path = real
            _resolved[name] = path
        return path

    def _record(code):
        path = _resolve(code.co_filename)
        if path is None:
            return
        if code.co_name == '<module>':
            _loaded.add(path)
            return
        # Identity is file + the line the code object's definition starts on
        # (co_firstlineno), never the name: a property's getter and setter
        # share a name, and lambdas/comprehensions share the name '<lambda>'/
        # '<genexpr>' — mapping them by line credits the enclosing def.
        key = (path, code.co_firstlineno)
        if key not in _calls:
            _order[0] += 1
            _calls[key] = _order[0]

    # --- crediting ------------------------------------------------------
    # A called (file, line) is credited to the innermost def/class whose
    # extent contains that line. Lambdas and comprehensions have no row of
    # their own, so they land on the enclosing function — matching the lab.
    # co_firstlineno of a decorated function points at its first decorator,
    # so a row's extent starts at the decorator, while `start` reported in
    # the trace stays the def/class line itself.
    def _rows(path):
        try:
            with open(path, encoding='utf-8') as fh:
                tree = ast.parse(fh.read())
        except (OSError, SyntaxError, ValueError):
            return []
        rows = []

        def visit(node, prefix):
            for child in ast.iter_child_nodes(node):
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    first = child.lineno
                    for deco in getattr(child, 'decorator_list', ()):
                        if deco.lineno < first:
                            first = deco.lineno
                    label = prefix + '.' + child.name if prefix else child.name
                    kind = 'class' if isinstance(child, ast.ClassDef) else 'function'
                    rows.append({'extent': (first, child.end_lineno or child.lineno),
                                 'start': child.lineno, 'end': child.end_lineno or child.lineno,
                                 'label': label, 'kind': kind})
                    visit(child, label)
                else:
                    visit(child, prefix)
        visit(tree, '')
        return rows

    def _finish():
        try:
            sys.settrace(None)
            if hasattr(sys, 'monitoring') and sys.monitoring.get_tool(sys.monitoring.PROFILER_ID) == 'box-trace':
                sys.monitoring.set_events(sys.monitoring.PROFILER_ID, 0)
                sys.monitoring.free_tool_id(sys.monitoring.PROFILER_ID)
            rows_cache = {}
            functions = []
            emitted = set()
            for (path, line), order in sorted(_calls.items(), key=lambda item: item[1]):
                if path not in rows_cache:
                    rows_cache[path] = _rows(path)
                hit = None
                for row in rows_cache[path]:
                    lo, hi = row['extent']
                    if lo <= line <= hi and (hit is None or hi - lo < hit['extent'][1] - hit['extent'][0]):
                        hit = row
                if hit is not None and (path, hit['start']) not in emitted:
                    emitted.add((path, hit['start']))
                    functions.append({'file': path, 'start': hit['start'], 'end': hit['end'],
                                      'label': hit['label'], 'kind': hit['kind'], 'order': order})
            unseen = []
            for module in list(sys.modules.values()):
                filename = getattr(module, '__file__', None)
                if not filename or filename.startswith('<'):
                    continue
                try:
                    real = os.path.normcase(os.path.realpath(filename))
                except OSError:
                    continue
                if real.startswith(_root) and not real.endswith('.py'):
                    unseen.append({'file': real, 'reason': 'compiled or non-Python module: no Python calls were visible in it'})
            os.makedirs(_out, exist_ok=True)
            record = {
                'pid': os.getpid(), 'ppid': os.getppid(), 'started': _started,
                'executable': sys.executable, 'version': sys.version.split()[0],
                'functions': functions, 'files': sorted(_loaded), 'unseen': unseen,
            }
            name = 'proc-%d-%s.json' % (os.getpid(), uuid.uuid4().hex[:8])
            with open(os.path.join(_out, name), 'w', encoding='utf-8') as fh:
                json.dump(record, fh)
        except Exception as error:  # never disturb the traced process
            try:
                name = 'error-%d-%s.json' % (os.getpid(), uuid.uuid4().hex[:8])
                with open(os.path.join(_out, name), 'w', encoding='utf-8') as fh:
                    json.dump({'pid': os.getpid(), 'error': repr(error)}, fh)
            except OSError:
                pass

    def _trace(frame, event, arg):
        if event == 'call':
            _record(frame.f_code)
        return None  # no line events

    def _arm(fallback):
        if hasattr(threading, 'settrace_all_threads'):
            threading.settrace_all_threads(fallback)
        else:
            threading.settrace(fallback)
        sys.settrace(fallback)

    if hasattr(sys, 'monitoring'):
        try:
            # PY_START fires per code object on every thread; DISABLE the event
            # on each object after its first call — first-seen is all we keep.
            def _start(code, offset):
                _record(code)
                return sys.monitoring.DISABLE

            _tool = sys.monitoring.PROFILER_ID
            sys.monitoring.use_tool_id(_tool, 'box-trace')
            sys.monitoring.register_callback(_tool, sys.monitoring.events.PY_START, _start)
            sys.monitoring.set_events(_tool, sys.monitoring.events.PY_START)
        except Exception:
            _arm(_trace)
    else:
        _arm(_trace)

    atexit.register(_finish)
