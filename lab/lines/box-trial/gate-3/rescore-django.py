"""Replay native grading only; preserve original scorer and candidate, no agent run."""
import hashlib,json,shutil
from run import *
images=json.loads((ROOT/'gate-1/image-digests.json').read_text())
for ident in ['django__django-14752','django__django-15467','matplotlib__matplotlib-21568']:
 task,_=make(ident);image=images[ident];owned=command(['docker','image','inspect',image],timeout=30).returncode!=0
 try:
  if owned:
   idle();r=command(['docker','pull',image]);assert r.returncode==0
  for arm in ['box','control']:
   d=RECORDS/ident/(arm+'-0');r=json.loads((d/'attempt.json').read_text(encoding='utf-8'))
   assert r.get('evaluation',{}).get('error','').startswith('Unparseable benchmark guard name:') or r.get('evaluation',{}).get('phases',{}).get('guards',{}).get('exit')==4
   for filename in ['attempt.json','evaluation.json','failing.log','guards.log','baseline-tree.json']:
    if (d/filename).exists():shutil.copyfile(d/filename,d/('before-guard-translation-'+filename))
   patch=(d/'candidate.patch').read_text(encoding='utf-8');digest=hashlib.sha256(patch.encode()).hexdigest();assert digest==r['patch_sha256']
   r['evaluation']=evaluate(image,task,patch,d)
   assert hashlib.sha256((d/'candidate.patch').read_bytes()).hexdigest()==digest
   r['scorer_correction']={'kind':'exact native benchmark guard ID translation','agent_rerun':False,'patch_unchanged':True,'original':'before-guard-translation-evaluation.json'}
   r['artifacts']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in d.iterdir() if p.is_file() and p.name!='attempt.json'}
   write(d/'attempt.json',r);print(ident,arm,r['evaluation']['solved'],r['evaluation'].get('error',''),flush=True)
 finally:
  if owned:print('scorer image cleanup',command(['docker','image','rm',image]).returncode,flush=True)
