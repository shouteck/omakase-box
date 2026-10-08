"""Native command completion, stale current bytes, and order-only delivery."""
import json,pathlib,shutil,sys
from adapter import Evidence,sha
from display import complete
HERE=pathlib.Path(__file__).resolve().parent
p=HERE/'scratch/display-fixture';p.mkdir(parents=True,exist_ok=True)
text='def ordinary():\n    needle = 1\n    return needle\n\ndef called():\n    needle = 2\n    return needle\n'
(p/'sample.py').write_bytes(text.encode())
e=Evidence({'sample.py':text},{'sample.py:5':[1,'called']})
rg=shutil.which('rg');argv=[rg,'-n','--with-filename','needle','sample.py']
a=complete(argv,p,e);b=complete(argv,p,e,marks=True)
assert a['added_bytes']==0 and a['exit']==b['exit']==0 and a['stderr']==b['stderr']==b''
assert a['shown'].splitlines()[0].startswith(b'sample.py:6:')
assert b['added_bytes']==10
# Matching body still equals old text, but unrelated current source changed.
(p/'sample.py').write_bytes((text+'\n# changed after trace\n').encode())
stale=complete(argv,p,e,marks=True)
assert stale['shown']==stale['native'] and stale['added_bytes']==0 and not stale['proof']['marked']
(p/'sample.py').write_bytes(text.encode())
# Complete native filter first; badge never becomes filter input.
filtered=complete([rg,'-F','[ran]'],p,e,input=a['native'],search_args=['-n'],marks=True)
assert filtered['exit']==1 and filtered['shown']==filtered['native']==b''
r={'status':'pass','cases':4,'order_only_bytes_added':a['added_bytes'],'optional_badge_bytes_added':b['added_bytes'],'stale_pass_through':True,'pipeline_filter_exit':filtered['exit'],
   'display_sha256':sha((HERE/'display.py').read_bytes()),'adapter_sha256':sha((HERE/'adapter.py').read_bytes())}
out=HERE/(sys.argv[1] if len(sys.argv)>1 else 'display-check.json');out.resolve().relative_to(HERE.resolve());out.write_bytes(json.dumps(r,indent=2).encode())
print(json.dumps(r))
