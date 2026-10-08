"""Offline behavior checks for old-format records and exact search identity."""
from instrument import normalized,adapter
r={'messages':[{'role':'assistant','content':'Thought\n```bash\ngrep -n needle a.py\n```'},{'role':'user','content':'<returncode>0</returncode>\n<output>\n2:    return 1\n</output>'}]}
steps,fmt,bad=normalized(r);assert len(steps)==1 and steps[0]['command']=='grep -n needle a.py' and steps[0]['output']=='2:    return 1\n' and steps[0]['exit']==0
r['messages'][1]['content']=[{'type':'text','text':r['messages'][1]['content']}];assert normalized(r)[0][0]['output']=='2:    return 1\n'
r['messages'][0]['content']='```bash\ncat a.py\n```\n```bash\ncat b.py\n```';assert normalized(r)[2]==1 and len(normalized(r)[0])==1 and normalized(r)[0][0]['unknown_action']
source={'a.py':'def same():\n    return 1\n\ndef other():\n    return 2\n','b.py':'def same():\n    return 1\n'}
ev=adapter.Evidence(source,{'b.py:1':[1,'same']});raw=b'a.py:2:    return 1\nb.py:2:    return 1\n'
shown,proof=adapter.present(raw,'grep',['-n','return','a.py','b.py'],ev);assert proof['order']==[1,0] and proof['locations'][0]['priority'] is False and proof['locations'][1]['priority'] is True
bad=adapter.Evidence(source,{'a.py:4':[1,'same']});assert not bad.called
wrong=b'a.py:2:    return 99\nb.py:2:    return 1\n';_,proof=adapter.present(wrong,'grep',['-n','return','a.py','b.py'],ev);assert all(r['path']!='a.py' for r in proof['locations'])
print('6 behavior checks passed: fenced schema, ambiguous actions, name collision, stale definition, content mismatch')

from views import visible_lines,tally
text="def first_function():\n    return 'first result is unique'\n\ndef unseen_function():\n    return 'must not count unseen'\n"
assert visible_lines(text,1,5,"def first_function():\n    return 'first result is unique'\n")=={1,2}
assert not visible_lines(text,1,5,"    return None\n")
ev=adapter.Evidence({'a.py':text},{},True)
counts,keys=tally({'a.py':text},ev,{('a.py',1),('a.py',2)},{})
assert counts['removable']==len("    return 'first result is unique'\n".encode())
assert keys=={('a.py',1)}
print('3 visible-source/slicing checks passed')

assert visible_lines(text,1,5,"  1\tdef first_function():\n  2\t    return 'first result is unique'\n")=={1,2}
print('numbered-view indentation check passed')

counts,keys=tally({'a.py':text},ev,{('a.py',1)},{})
assert counts['removable']==0 and not keys
print('signature-only view is not an omitted function')

from views import verified_patch_paths
patch="diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -1,2 +1,2 @@\n def first_function():\n-    return 'first result is unique'\n+    return 'changed'\n"
assert verified_patch_paths(patch,{'a.py':text})=={'a.py'}
assert not verified_patch_paths(patch.replace('first result is unique','does not exist'),{'a.py':text})
print('base-matching patch and mismatched patch checks passed')

from views import literal_patch
cmd="git apply <<'PATCH'\n"+patch+"PATCH"
assert literal_patch(cmd)==patch.rstrip('\n')
assert literal_patch(cmd.replace('git apply','git apply --check')) is None
assert literal_patch(cmd.replace('git apply','git apply unrelated.diff')) is None
assert literal_patch(cmd+"\necho done") is None
print('stdin patch consumption / inspection / operand / extra-command checks passed')
