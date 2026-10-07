"""Small authored calibration for the measurement mechanics."""
import importlib.util, pathlib
here = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('measurement', here / 'measure.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
text = 'class C:\n    def __init__(self):\n        self.x = 1\n\n    def unused(self):\n        "intent"\n        return 2\n\n    def used(self):\n        return self.x\n'
rows = m.functions(text)
reduced = m.lean(text, rows, {'C.__init__', 'C.used'})
assert 'self.x = 1' in reduced and 'return self.x' in reduced
assert 'return 2' not in reduced and '"intent"' not in reduced
assert '"intent"' in m.lean(text, rows, {'C.__init__', 'C.used'}, keep_docstrings=True)
assert [r['name'] for r in rows] == ['C.__init__', 'C.unused', 'C.used']
patch = 'diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -3,1 +3,1 @@\n-        self.x = 1\n+        self.x = 2\n'
changed = m.patch_changes(patch, {'a.py': text})
assert changed['a.py']['old_lines'] == {3}
assert changed['a.py']['new_text'] == text.replace('self.x = 1', 'self.x = 2')
assert m.production('pkg/api.py') and not m.production('pkg/tests/test_api.py')
assert not m.production('docs/example.py')
property_text = 'class C:\n    @property\n    def value(self):\n        return "getter"\n    @value.setter\n    def value(self, value):\n        return "setter"\n'
property_rows = m.functions(property_text)
property_lean = m.lean(property_text, property_rows, {property_rows[1]['start']})
assert 'return "getter"' not in property_lean and 'return "setter"' in property_lean
print('PASS: constructors, body/signature distinction, docstrings, replacement anchors and denominator exclusions')
