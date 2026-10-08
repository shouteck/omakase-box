import base64,collections,gzip,json,pathlib,subprocess,shutil
from adapter import Evidence,present,sha
H=pathlib.Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_bytes())
report={}
s=read(H/'summary.json');f=read(H/'footprint.json')
assert sha((H/'summary.json').read_bytes())==f['summary_sha256']
for n,h in s['instrument_sha256'].items():assert sha((H/n).read_bytes())==h
receipts=0
for t in s['tasks']:
 for q in t['queries']:
  p=H/q['receipt']['path'];blob=p.read_bytes()
  assert sha(blob)==q['receipt']['sha256'] and len(blob)==q['receipt']['bytes']
  d=json.loads(gzip.decompress(blob));raw=base64.b64decode(d['stdout_b64']);shown=base64.b64decode(d['shown_b64'])
  assert sha(raw)==q['native_sha256'] and sha(shown)==q['shown_sha256']
  proof=d['proof'];lines=raw.splitlines(keepends=True);marks=set(proof['marked'])
  restored=[v[5:] if i in marks else v for i,v in zip(proof['order'],shown.splitlines(keepends=True))]
  assert collections.Counter(lines)==collections.Counter(restored)
  receipts+=1
report['all_literal_raw_receipts_checked']=receipts
A=read(H/'facts-before-path-cache.json');B=read(H/'facts.json')
x=read(H/'raw/facts-before-path-cache/ordered.json');y=read(H/'raw/facts/ordered.json')
for r in (A,B):assert sha((H/r['raw']['path']).read_bytes())==r['raw']['sha256']
assert {(k,v[1]) for k,v in x['calls'].items()}=={(k,v[1]) for k,v in y['calls'].items()}
event_fields=lambda v:(v['event'],v['path'],v['start'],v['line'],v['name'],v.get('exception_type'))
assert [event_fields(v) for v in x['events']]==[event_fields(v) for v in y['events']]
assert sum(x['calls'][k]!=y['calls'][k] for k in x['calls'])==271
e=Evidence(y['sources'],y['calls']);answer=e.file_answer('django/forms/widgets.py')
assert answer==B['file_answer']==A['file_answer'] and len(answer.encode())==670
selected=[v for v in y['events'] if v['name']==y['target'] or (v['path']=='django/forms/widgets.py' and v['name']=='get_context')]
route=''.join('%s %s:%s %s%s\n'%(v['event'],v['path'],v['line'],v['name'],' '+v['exception_type'] if v['event']=='exception' else '') for v in selected)
assert route==B['route_answer']==A['route_answer'] and len(route.encode())==598
assert len(y['events'])==17 and len(selected)==9 and B['omitted_events']==8
stack=[]
for v in y['events']:
 if v['event']=='call':
  assert v['parent']==(stack[-1] if stack else None);stack.append(v['id'])
 elif v['event']=='return':assert stack.pop()==v['id']
 else:assert stack[-1]==v['id']
assert not stack
report['facts']={'calls':len(y['calls']),'events':17,'selected':9,'omitted':8,'q2_bytes':670,'q3_bytes':598,'ordinals_differ':271,'parent_stack_valid':True}
p=H/'sceptic-suite/attacks';p.mkdir(exist_ok=True)
text='def ordinary():\n    needle = 1\n\ndef called():\n    needle = 2\n'
(p/'sample.py').write_bytes(text.encode());e=Evidence({'sample.py':text},{'sample.py:4':[1,'called']})
args=['-n','--with-filename','--multiline','needle = 1[\s\S]*needle = 2','sample.py']
r=subprocess.run([shutil.which('rg')]+args,cwd=p,capture_output=True);assert r.returncode==0
shown,proof=present(r.stdout,'rg',args,e)
report['multiline_attack']={'args':args,'native':r.stdout.decode(),'shown':shown.decode(),'order':proof['order'],'marked':proof['marked'],'pass_through':shown==r.stdout}
e=Evidence({'a.py':text,'b.py':text},{'b.py:4':[1,'called']})
raw=b'a.py:5:    needle = 2\n';loc=[{'ordinal':0,'path':'b.py','line':5,'is_match':True,'kind':'line','source_sha256':e.digests['b.py']}]
shown,proof=present(raw,'rg',['-n'],e,loc)
report['contradictory_captured_path']={'native':raw.decode(),'shown':shown.decode(),'marked':proof['marked']}
(H/'sceptic-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))

