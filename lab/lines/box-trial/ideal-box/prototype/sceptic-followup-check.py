import base64,collections,gzip,json,pathlib
import measure
from adapter import Evidence,present,sha
H=pathlib.Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_bytes())
s=read(H/'summary.json');old=read(H/'summary-before-sceptic.json');f=read(H/'footprint.json')
assert sha((H/'summary.json').read_bytes())==f['summary_sha256']
assert sha((H/'summary-before-sceptic.json').read_bytes())==s['recheck']['original_summary_sha256']
for n,v in s['instrument_sha256'].items():assert sha((H/n).read_bytes())==v
assert old['literal_total']==s['literal_total'] and old['retained_native_total']==s['retained_native_total']
receipts=0
for t,o in zip(s['tasks'],old['tasks']):
 assert t['task']==o['task']
 for q,prior in zip(t['queries'],o['queries']):
  blob=(H/q['receipt']['path']).read_bytes();assert sha(blob)==q['receipt']['sha256'] and len(blob)==q['receipt']['bytes']
  ob=(H/q['original_receipt']['path']).read_bytes();assert sha(ob)==q['original_receipt']['sha256']
  d=json.loads(gzip.decompress(blob));orig=json.loads(gzip.decompress(ob))
  assert d['stdout_b64']==orig['stdout_b64'] and q['native_sha256']==prior['native_sha256']
  raw=base64.b64decode(d['stdout_b64']);shown=base64.b64decode(d['shown_b64']);assert sha(raw)==q['native_sha256'] and sha(shown)==q['shown_sha256']
  p=d['proof'];marks=set(p['marked']);restored=[v[5:] if i in marks else v for i,v in zip(p['order'],shown.splitlines(keepends=True))]
  assert collections.Counter(raw.splitlines(keepends=True))==collections.Counter(restored)
  receipts+=1
assert [q['native_sha256'] for q in s['native_invocations']]==[q['native_sha256'] for q in old['native_invocations']]
# Re-present selected actual saved streams independently from current summary.
count=0
for ident in ('django__django-12193','sympy__sympy-16597'):
 source=measure.sources(ident);e,trace=measure.evidence(ident,source)
 replay=read(measure.ROOT/'gate-3b/raw'/ident/'replay.json')['queries']
 expected=[v for v in s['native_invocations'] if v['task']==ident]
 for q,row in zip(replay,expected):
  raw=base64.b64decode(q['stdout_b64']);ev=Evidence({},{},False) if q['source_state_unknown'] or q['environment_state_unknown'] else e
  shown,p=present(raw,q['tool'],q['args'],ev,q['locations'],root='/testbed',cwd=q['cwd'])
  assert sha(raw)==row['native_sha256'] and sha(shown)==row['shown_sha256']
  assert len(p['marked'])==row['metrics']['mark_count'];count+=1
# Additional separator disagreement and outside-root identity must fall back.
text='def called():\n    needle = 2\n';ev=Evidence({'a.py':text},{'a.py:1':[1,'called']})
loc=[{'ordinal':0,'path':'a.py','line':2,'is_match':True,'kind':'line','source_sha256':ev.digests['a.py']}]
for raw,args,root,cwd in [(b'a.py-2-    needle = 2\n',['-n'],None,None),(b'/other/a.py:2:    needle = 2\n',['-n'],'/testbed','/testbed'),(b'2-    needle = 2\n',['-n','a.py'],None,None)]:
 shown,p=present(raw,'rg',args,ev,loc,root,cwd);assert shown==raw and not p['marked']
report={'exact_candidate':'9baf4697137db5aeaad911a6d43a61648b245875','current_receipts_checked':receipts,'native_hashes_preserved':True,'aggregates_unchanged':True,'saved_streams_independently_represented':count,'extra_separator_root_guards':3}
(H/'sceptic-followup-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
