"""Reproduce saved actual candidate scoring only, in new review-owned directories."""
import json,pathlib,shutil,sys,uuid
HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from common import evaluate
from prepare import make
ident='sphinx-doc__sphinx-10614';task,_=make(ident)
image=json.loads((HERE.parent/'gate-1/image-digests.json').read_bytes())[ident]
root=HERE/'raw/review'/('rescore-'+str(uuid.uuid4()))
for arm in ['control','box']:
 d=root/arm;d.mkdir(parents=True);shutil.copyfile(HERE/'raw/runs'/arm/'candidate.patch',d/'candidate.patch')
 r=evaluate(image,task,(d/'candidate.patch').read_text(encoding='utf-8'),d)
 print(arm,r['status'],r['solved'],d,flush=True)
 if r['status']!='scored':raise SystemExit('Evaluation incomplete; inspect owned receipts')
