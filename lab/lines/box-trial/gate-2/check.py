"""Known-answer checks for the Gate 2 command classifier. python lab/lines/box-trial/gate-2/check.py"""
import importlib.util, pathlib

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('m', HERE / 'measure.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

source = {'pkg/a.py': '\n'.join('line %d' % i for i in range(1, 201)), 'pkg/tests/test_a.py': 'x\n' * 30}
c = lambda segment, output='': m.classify(segment, output, source)

assert m.segments("cd /testbed && sed -n '10,20p' pkg/a.py") == ["sed -n '10,20p' pkg/a.py"]
assert c("sed -n '10,20p' pkg/a.py") == ({'view'}, [('pkg/a.py', 10, 20)], [], [])
assert c("nl -ba pkg/a.py | sed -n '150,400p'") == ({'view'}, [('pkg/a.py', 150, 200)], [], [])
assert c("cat ./pkg/a.py", 'a\nb\nc\n') == ({'view'}, [('pkg/a.py', 1, 3)], [], [])
assert c("head -n 40 /testbed/pkg/a.py") == ({'view'}, [('pkg/a.py', 1, 40)], [], [])
assert c("tail -n 5 pkg/a.py") == ({'view'}, [('pkg/a.py', 196, 200)], [], [])
assert c('grep -rn "frob" pkg', './pkg/a.py:12:  frob()\npkg/tests/test_a.py:3:frob\nBinary file x matches\n') == ({'search'}, [], [('pkg/a.py', 12), ('pkg/tests/test_a.py', 3)], [])
assert c('grep -n frob pkg/a.py', '12:  frob()\n40-  ctx\n') == ({'search'}, [], [('pkg/a.py', 12), ('pkg/a.py', 40)], [])
assert c('find . -name "*.py"', './pkg/a.py\n')[0] == {'search'} and c('find . -name "*.py"', './pkg/a.py\n')[2] == []
assert c("sed -i 's/a/b/' pkg/a.py") == ({'edit'}, [], [], ['pkg/a.py'])
assert c("cat > pkg/a.py <<'EOF'\nx\nEOF") == ({'edit'}, [], [], ['pkg/a.py'])
assert c("python - <<'PY'\nfrom pathlib import Path\np=Path('pkg/a.py')\np.write_text(p.read_text().replace('a','b'))\nPY") == ({'edit'}, [], [], ['pkg/a.py'])
assert c("python -m pytest pkg/tests/test_a.py -q")[0] == {'run'}
assert c("git status")[0] == {'other'}
assert c("ls -la")[0] == {'other'}
assert c("grep -n foo pkg/a.py 2>/dev/null")[0] == {'search'}

record = {'messages': [
    {'role': 'system', 'content': 's'},
    {'extra': {'actions': [{'command': 'ls'}]}, 'usage': {'input_tokens': 100}},
    {'extra': {'raw_output': 'a\n'}},
    {'role': 'assistant', 'extra': {'actions': [{'command': 'cat pkg/a.py'}], 'response': {'usage': {'prompt_tokens': 250}}}},
    {'role': 'tool', 'extra': {'raw_output': 'line 1\n'}}]}
steps = m.steps_of(record)
assert [(s['command'], s['output'], s['input_tokens']) for s in steps] == [('ls', 'a\n', 100), ('cat pkg/a.py', 'line 1\n', 250)]
multi = {'messages': [
    {'extra': {'actions': [{'command': 'ls', 'tool_call_id': 'a'}, {'command': 'pwd', 'tool_call_id': 'b'}]}, 'usage': {'input_tokens': 7}},
    {'call_id': 'a', 'extra': {'raw_output': 'A'}}, {'call_id': 'b', 'extra': {'raw_output': 'B'}}]}
assert [(s['command'], s['output'], s['input_tokens']) for s in m.steps_of(multi)] == [('ls', 'A', 7), ('pwd', 'B', None)]
print('gate-2 checks passed')
