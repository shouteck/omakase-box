"""Create one isolated task instrument from the reviewed pilot, never start agents."""
import json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parent.parent
ident=sys.argv[1];ordinal=int(sys.argv[2]);first=['box','control','box'][ordinal-1]
H=ROOT/('live-three-'+ident);H.mkdir(exist_ok=False)
P=ROOT/'live-pilot'
for n in ['common.py','capture.py','execute.py','shell.sh','adapter.py']:(H/n).write_bytes((P/n).read_bytes())
(H/'.gitignore').write_text('raw/\nscratch/\nevidence.json\n')
(H/'evidence.json').write_text(json.dumps({'sources':{},'trace':{},'valid':False,'excluded':[]}))
(H/'config.json').write_text(json.dumps({'task':ident,'ordinal':ordinal,'first_arm':first},indent=2))
(H/'plan.md').write_text('Task '+ident+'; prospective pair '+str(ordinal)+', '+first+' first. Full protocol: ../live-three/plan.md. Inputs/settings and safeguards frozen here before launch.\n')
# Adapt only scope and first-arm/global-budget handling; model/agent tool unchanged.
s=(P/'run.py').read_text().replace("ident='sphinx-doc__sphinx-10614'","ident="+repr(ident)).replace("'first_arm':'control'","'first_arm':"+repr(first))
start=s.index(" first=run_arm('control')",s.index('def main():'));end=s.index("if __name__",start)
s=s[:start]+""" config=json.loads((HERE/'config.json').read_bytes())
 remote=command(['git','-c','safe.directory='+REPO.as_posix(),'rev-parse','origin/lab']).stdout.decode().strip()
 assert remote==lock['commit'],'Exact launch HEAD must be pushed'
 def spent():
  return sum(total(json.loads(p.read_bytes())) for p in ROOT.glob('live-three-*/raw/runs/*/attempt.json'))
 arms=[config['first_arm'],'control' if config['first_arm']=='box' else 'box'];records={}
 for arm in arms:
  assert spent()+CAP<=2400000,'Insufficient total equal allowance; stop'
  a=run_arm(arm);records[arm]=a
  write(HERE/'progress.json',dict(records,pair_tokens=sum(total(x) for x in records.values()),new_session_tokens=spent()))
  if a.get('error') or a.get('evaluation',{}).get('status')!='scored':raise RuntimeError('Protocol/scoring fault: stop')
  if total(a)>CAP:raise RuntimeError('In-flight cap excess: stop before any further arm')
 print('PAIR_STOP',flush=True)
"""+s[end:]
(H/'run.py').write_text(s)
s=(P/'score.py').read_text().replace("'task':'sphinx-doc__sphinx-10614'","'task':json.loads((HERE/'config.json').read_bytes())['task']")
(H/'score.py').write_text(s)
for n in ['box-check.py','native-check.py']:
 s=(P/n).read_text().replace("ident='sphinx-doc__sphinx-10614'","ident="+repr(ident)).replace('raw/box-check-v2','raw/box-check').replace('raw/native-check-final','raw/native-check')
 (H/n).write_text(s)
(H/'harness.py').write_bytes((ROOT/'live-three/harness-template.py').read_bytes())
print(H)
