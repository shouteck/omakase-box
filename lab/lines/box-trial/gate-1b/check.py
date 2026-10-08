"""Known-answer checks for the Gate 1b host measurement. python lab/lines/box-trial/gate-1b/check.py"""
import importlib.util, pathlib

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('m', HERE / 'measure.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

text = "Calling `frob_nicate(x)` on a FooBar fails; see obj.spin and the word table. print(len(x)) frob_nicate again"
assert m.code_words(text) == ['frob_nicate', 'FooBar', 'spin'], m.code_words(text)

src = '\n'.join(['import os', '', '@deco', 'def outer(a):', '    f = lambda v: v', '    def inner():', '        return 1',
                 '    return [i for i in a]', '', 'class K:', '    def meth(self):', '        pass', ''])
rows = m.functions(src)
assert [(r['name'], r['start'], r['end']) for r in rows] == [('outer', 3, 8), ('outer.inner', 6, 7), ('K.meth', 11, 12)], rows
trees = {'pkg/a.py': rows}
trace = {'pkg/a.py:3': [1, 'outer'], 'pkg/a.py:5': [2, '<lambda>'], 'pkg/a.py:8': [3, '<listcomp>'], 'pkg/a.py:1': [4, '<module>'],
         'pkg/a.py:10': [5, 'K'], 'pkg/tests/test_a.py:1': [6, 'test_x']}
found, test_calls = m.called_functions(trace, trees)
assert found == {('pkg/a.py', 3)} and test_calls == 1, (found, test_calls)

log = '=== FAILURES ===\npkg/a.py:7: in inner\n    return 1\nE  ValueError\n'
assert m.FRAME.search(log).group(4, 5, 6) == ('pkg/a.py', '7', 'inner')
assert m.FRAME.search('  File "/testbed/pkg/a.py", line 11, in meth').group(1, 2, 3) == ('/testbed/pkg/a.py', '11', 'meth')
assert m.failure_text('header\nplatform x\n' + log) == log

base = {'scoreable': True, 'subtracted': None}
mk = lambda names, box, o, n: dict(base, error_trace={'names_fix': names}, narrow={'fix_any': box}, median={'ordinary': o, 'narrow': n})
assert m.decide([mk(False, True, 100, 10)] * 9 + [mk(False, True, 100, 110)] * 3 + [mk(True, True, 5, 5)] * 4)[0] == 'worth-going-on'
assert m.decide([mk(False, True, 100, 10)] * 9 + [mk(False, True, 100, 130)] * 3 + [mk(True, True, 5, 5)] * 4)[0].startswith('stop: Box-first')
assert m.decide([mk(False, True, 100, 60)] * 9 + [mk(False, True, 100, 10)] * 3 + [mk(True, True, 5, 5)] * 4)[0].startswith('stop: Box-first')
assert m.decide([mk(True, True, 5, 5)] * 9 + [mk(False, True, 100, 10)] * 7)[0].startswith('stop: error trace')
assert m.decide([mk(False, False, 100, 100)] * 9 + [mk(False, True, 100, 10)] * 7)[0].startswith('stop: fix usually')
assert m.decide([mk(False, True, 100, 10)] * 14)[0].startswith('could-not')
print('gate-1b checks passed')
