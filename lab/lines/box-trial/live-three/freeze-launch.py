"""Freeze passed task inputs; no repair-agent invocation."""
import hashlib,json,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parent.parent;H=ROOT/('live-three-'+sys.argv[1]);REPO=ROOT.parents[2]
base=['git','-c','safe.directory='+REPO.as_posix()]
assert not subprocess.check_output(base+['status','--porcelain']).strip(),'Commit and push sources/preflight first'
head=subprocess.check_output(base+['rev-parse','HEAD']).decode().strip()
assert head==subprocess.check_output(base+['rev-parse','origin/lab']).decode().strip()
for name in ['harness.json','box-check.json','native-check.json']:assert json.loads((H/name).read_bytes())['status']=='pass'
names=list(json.loads((ROOT/'live-pilot/launch-lock.json').read_bytes())['files'])+['config.json','../live-three/plan.md','../live-three/selection.json','../live-three/prepare-task.py','../live-three/harness-template.py']
lock={'commit':head,'pushed':True,'repair_starts_before_lock':0,'files':{n:hashlib.sha256((H/n).read_bytes()).hexdigest() for n in names}}
assert not (H/'raw/runs').exists(),'No reroll'
(H/'launch-lock.json').write_text(json.dumps(lock,indent=2))
files={str(p.relative_to(H)):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in (H/'raw').rglob('*') if p.is_file()}
(H/'pre-agent-manifest.json').write_text(json.dumps({'files':files,'evidence_sha256':hashlib.sha256((H/'evidence.json').read_bytes()).hexdigest()},indent=2))
print('Launch locked to pushed '+head+'; zero repair starts.')
