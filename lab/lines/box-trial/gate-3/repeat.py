"""Only the three preselected tasks, two fresh repeats; use after fixed decision."""
from run import *
from score import collect
assert collect(False)['repeat_decision']=='fixed repeats needed before any superiority claim'
selected=json.loads((HERE/'selection.json').read_text())['tasks'];images=json.loads((ROOT/'gate-1/image-digests.json').read_text());cleanup=[]
for row in selected:
 if not row['repeat']:continue
 ident=row['instance_id'];task,scope=make(ident);image=images[ident];owned=command(['docker','image','inspect',image],timeout=30).returncode!=0
 try:
  if owned:
   idle();r=command(['docker','pull',image]);assert r.returncode==0
  for repeat in [1,2]:
   first=('control' if row['first_arm']=='box' else 'box') if repeat==1 else row['first_arm']
   for arm in [first,'control' if first=='box' else 'box']:arm_run(image,task,scope,arm,repeat)
 finally:
  if owned:cleanup.append({'image':image,'exit':command(['docker','image','rm',image]).returncode})
write(HERE/'repeat-cleanup.json',cleanup)
