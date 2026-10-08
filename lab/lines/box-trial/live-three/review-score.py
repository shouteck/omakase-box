"""Independent native rescore of saved actual patches; no repair runs."""
import hashlib,json,pathlib,shutil,sys,uuid
ROOT=pathlib.Path(__file__).resolve().parent.parent
HERE=ROOT/sys.argv[1]
sys.path.insert(0,str(HERE))
from common import command,evaluate,idle
from prepare import make
ident=sys.argv[2];task,_=make(ident)
image=json.loads((ROOT/'gate-1/image-digests.json').read_bytes())[ident]
ownership_path=ROOT/'live-three/review-image-ownership.json'
ownership=json.loads(ownership_path.read_bytes()) if ownership_path.exists() else {}
inspection=command(['docker','image','inspect',image])
record={'image':image,'inspect_exit':inspection.returncode,'preexisted':inspection.returncode==0,'pulled_by_review':False}
ownership[ident]=record
ownership_path.write_text(json.dumps(ownership,indent=2),encoding='utf-8')
if inspection.returncode:
    assert ident=='sphinx-doc__sphinx-10614','Only missing pilot image authorized for pull'
    idle();pull=command(['docker','pull',image]);record['pull_exit']=pull.returncode
    (ROOT/'live-three/review-pilot-pull.log').write_bytes(pull.stdout+pull.stderr)
    record['pulled_by_review']=pull.returncode==0
    ownership_path.write_text(json.dumps(ownership,indent=2),encoding='utf-8')
    assert pull.returncode==0
out=HERE/'raw/review'/('continuation-rescore-'+str(uuid.uuid4()))
receipts={}
for arm in ['control','box']:
    d=out/arm;d.mkdir(parents=True)
    original=HERE/'raw/runs'/arm/'candidate.patch';shutil.copyfile(original,d/'candidate.patch')
    result=evaluate(image,task,(d/'candidate.patch').read_text(encoding='utf-8'),d)
    assert result['status']=='scored' and result['cleanup_exit']==0,result
    assert result['solved']==(ident!='sphinx-doc__sphinx-10614'),result
    receipts[arm]={'directory':str(d),'sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'result':result}
    print(ident,arm,result['status'],result['solved'],flush=True)
(ROOT/'live-three'/('review-score-'+ident+'.json')).write_text(json.dumps(receipts,indent=2),encoding='utf-8')
