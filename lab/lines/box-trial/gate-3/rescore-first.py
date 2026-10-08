"""Exporter correction only: remove byte-identical pre-agent dirty-image chunks. No rerolls."""
import json,re,shutil,hashlib
from run import HERE,ROOT,command,create,write,evaluate,production_patch
from prepare import make
ident='astropy__astropy-13033';task,_=make(ident);image=json.loads((ROOT/'gate-1/image-digests.json').read_text())[ident]
for arm in ['control','box']:
    directory=HERE/'records'/ident/(arm+'-0');name=None
    for file in ['attempt.json','evaluation.json','candidate.patch']:
        shutil.copyfile(directory/file,directory/('before-export-fix-'+file))
    try:
        name,_=create(image,task,directory)
        baseline=command(['docker','exec',name,'git','diff','--binary','HEAD','--','.']).stdout.decode('utf-8')
        (directory/'prepared-before-agent.patch').write_bytes(baseline.encode())
        old=(directory/'before-export-fix-candidate.patch').read_text(encoding='utf-8')
        original_blocks=re.split(r'(?=^diff --git )',old,flags=re.M)
        baseline_blocks=re.split(r'(?=^diff --git )',baseline,flags=re.M)
        removed=[b for b in original_blocks if b and b in baseline_blocks]
        corrected=''.join(b for b in original_blocks if b not in baseline_blocks)
        (directory/'candidate.patch').write_bytes(corrected.encode())
        write(directory/'export-correction.json',{'rule':'remove only byte-identical chunks already present before agent in pinned image plus test overlay','removed_headers':[b.splitlines()[0] for b in removed],'original_sha256':hashlib.sha256(old.encode()).hexdigest(),'corrected_sha256':hashlib.sha256(corrected.encode()).hexdigest(),'agent_rerun':False})
    finally:
        if name:command(['docker','rm','-f',name])
    result=evaluate(image,task,corrected,directory)
    attempt=json.loads((directory/'attempt.json').read_text());attempt['evaluation']=result;attempt['patch_sha256']=hashlib.sha256(corrected.encode()).hexdigest();attempt['patch_bytes']=len(corrected.encode());attempt['export_correction']='export-correction.json'
    attempt['artifacts']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file() and p.name!='attempt.json'}
    write(directory/'attempt.json',attempt);print(arm,result['status'],result.get('solved'),result.get('error',''),flush=True)
