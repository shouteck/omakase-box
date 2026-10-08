import base64,collections,gzip,json,pathlib
from adapter import sha
H=pathlib.Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_bytes())
a=read(H/'summary.json');b=read(H/'sceptic-sample/summary.json')
ids={t['task'] for t in b['tasks']}
assert [q for q in a['native_invocations'] if q['task'] in ids]==b['native_invocations']
rows=0;changed=0
for t in b['tasks']:
 old=next(v for v in a['tasks'] if v['task']==t['task'])
 assert (t['called_definitions'],t['identity_unknowns'],t['valid_trace'],t['source_snapshot_sha256'],t['trace_sha256'])==(old['called_definitions'],old['identity_unknowns'],old['valid_trace'],old['source_snapshot_sha256'],old['trace_sha256'])
 for q,o in zip(t['queries'],old['queries']):
  x=json.loads(gzip.decompress((H/'sceptic-sample'/q['receipt']['path']).read_bytes()));y=json.loads(gzip.decompress((H/o['receipt']['path']).read_bytes()))
  raw=base64.b64decode(x['stdout_b64']);prior=base64.b64decode(y['stdout_b64'])
  assert collections.Counter(raw.splitlines(keepends=True))==collections.Counter(prior.splitlines(keepends=True))
  assert q['metrics']['mark_count']==o['metrics']['mark_count']
  # Identity-to-line multiplicity, independent of traversal/order ordinal.
  def identities(d):return collections.Counter((v['path'],v['line'],v.get('function_start'),v.get('function_name'),v['priority']) for v in d['proof']['locations'])
  assert identities(x)==identities(y)
  assert q['native_sha256']==sha(raw) and q['shown_sha256']==sha(base64.b64decode(x['shown_b64']))
  rows+=1;changed+=raw!=prior
out={'fresh_queries':rows,'retained_invocations_exact_equal':len(b['native_invocations']),'native_order_changed':changed,'all_match_multiplicities_identity_marks_equal':True}
(H/'sceptic-sample-comparison.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
