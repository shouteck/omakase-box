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

from views import visible_locations
from collections import defaultdict
claims=defaultdict(set)
for path in ['a.py','b.py']:
 for n,i in visible_locations(text,1,5,"cat: a.py: Permission denied\n"+text):claims[i].add((path,n))
assert claims and not {next(iter(v)) for v in claims.values() if len(v)==1}
print('competing cross-file view locations stay unknown')

from views import verified_removed_lines
assert verified_removed_lines(patch,{'a.py':text})=={'a.py':{2}}
assert not verified_removed_lines("diff --git a/a.py b/a.py\n@@ -2,0 +2,1 @@\n+    extra()\n",{'a.py':text})
print('submitted removed-line identity / pure-addition exclusion checks passed')

record={'messages':[{'role':'assistant','content':'No usable command'},{'role':'user','content':'Please return exactly one bash command.'}]}
s,_,unknown=normalized(record)
assert unknown==1 and s[0]['output']=='' and s[0]['returned_text']=='Please return exactly one bash command.'
print('error feedback retained for text cost, never source attribution')

from instrument import production,source_identity
assert production('django/django','django/test/testcases.py') and not production('django/django','tests/test_helpers.py')
assert not production('astropy/astropy','tests/test_helpers.py')
new_method="diff --git a/a.py b/a.py\n@@ -5,0 +6,3 @@\n+\ndef additional_method():\n+    return 3\n"
assert not verified_removed_lines(new_method,{'a.py':text})
assert source_identity({'a.py':adapter.definitions('def outer():\n    def child():\n        return 1\n    return child()\n')},'a.py',3)['start']==2
print('Django framework/test distinction and physical-gold/nested-identity checks passed')
