"""Offline only: normalized old/new mini-agent records, source provenance and corrected ordering."""
import pathlib,json,gzip,importlib.util,re,hashlib,collections
from views import visible_lines,visible_locations,tally,verified_patch_paths,literal_patch,verified_removed_lines
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parent;REPO=HERE.parents[3]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
g2=load('lab_gradient_g2',ROOT/'gate-2/measure.py');adapter=load('lab_gradient_adapter',ROOT/'ideal-box/prototype/adapter.py')
def content_of(message):
 value=message.get("content","")
 if isinstance(value,str):return value
 if isinstance(value,list):return "\n".join(z.get("text","") for z in value if isinstance(z,dict) and z.get("type") in ["text","input_text","output_text"])
 return ""

def normalized(record):
 if any((m.get('extra')or{}).get('actions') for m in record.get('messages',[])):
  return g2.steps_of(record),'structured-actions',0
 steps=[];unparsed=0
 for m in record.get('messages',[]):
  content=content_of(m)
  if not isinstance(content,str):unparsed+=1;continue
  if m.get('role')=='assistant':
   calls=re.findall(r'```(?:bash|sh)\s*\n(.*?)```',content,re.S)
   if len(calls)==1:steps.append(dict(command=calls[0].strip(),output='',returned_text='',input_tokens=None,exit=None))
   else:
    unparsed+=1;steps.append(dict(command='',output='',returned_text='',input_tokens=None,exit=None,unknown_action=True))
  elif m.get('role') in ['user','tool'] and steps:
   steps[-1]['returned_text']+=content
   match=re.search(r'<output>\n?(.*?)</output>',content,re.S)
   code=re.search(r'<returncode>(-?\d+)</returncode>',content)
   if match:steps[-1]['output']+=match.group(1)
   if code:steps[-1]['exit']=int(code.group(1))
 return steps,'bash-fences',unparsed

_cached_id=None
_cached_bundle=None
def inputs(row):
 global _cached_id,_cached_bundle
 if _cached_id==row["instance_id"]:return _cached_bundle
 path=HERE/'boxes'/row['instance_id']/'attempt.json'
 if not path.exists():return None
 attempt=json.loads(path.read_bytes());p=attempt.get('source_path')
 if not p or not (REPO/p).exists():return None
 source=json.loads(gzip.decompress((REPO/p).read_bytes()));trace={};valid=False
 if attempt.get('trace_path') and (REPO/attempt['trace_path']).exists():
  trace=json.loads((REPO/attempt['trace_path']).read_bytes())
  execution=json.loads((REPO/attempt['execution_path']).read_bytes())
  phases=execution.get('phases',{});plain=phases.get('plain',{});traced=phases.get('failing',{})
  logpath=(REPO/attempt['execution_path']).parent/'plain.log'
  log=logpath.read_bytes().decode(errors='replace') if logpath.exists() else ''
  task=load('lab_gradient_runner',ROOT/'gate-1b/run.py').prepare(row)
  tracelogpath=logpath.parent/'failing.log'
  tracelog=tracelogpath.read_bytes().decode(errors='replace') if tracelogpath.exists() else ''
  valid=g2.g1b.failed_named(task,row,g2.g1b.ANSI.sub('',tracelog)) and not plain.get('timed_out',True) and not traced.get('timed_out',True) and bool(trace) and g2.g1b.failed_named(task,row,g2.g1b.ANSI.sub('',log))
 evidence=adapter.Evidence(source,trace,valid=valid,excluded=[p for p in source if not g2.production(p)])
 trees={p:evidence.tree(p) for p in source if g2.production(p)}
 target,files=g2.g1b.targets(row,source,trees)
 _cached_id=row["instance_id"];_cached_bundle=(source,evidence,trees,target,files,attempt)
 return _cached_bundle

def measure(row,agent):
 ident=row['instance_id'];path=HERE/'records'/agent['folder']/(ident+'.traj.json');out=dict(instance_id=ident,repo=row['repo'],agent=agent['folder'],published_rate=agent['resolved'])
 if not path.exists():return dict(out,status='missing record')
 bundle=inputs(row)
 if bundle is None:return dict(out,status='missing snapshot')
 source,ev,trees,target,files,attempt=bundle;record=json.loads(path.read_bytes());steps,fmt,unparsed=normalized(record)
 if not steps:return dict(out,status='unparsed record',format=fmt)
 details=HERE/'records'/agent['folder']/'published-results.json';published=json.loads(details.read_bytes()).get(ident,{}) if details.exists() else {}
 out.update(status='measured',format=fmt,unparsed_actions=unparsed,resolved=published.get('resolved'),exit_status=record.get('info',{}).get('exit_status'),steps=len(steps),has_box=ev.valid,target_in_box=bool(target&ev.called) if ev.valid and target else None,function_target=bool(target),target_files=sorted(files),target_functions=sorted(p+':'+str(n) for p,n in target),record_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
 out['complete_record']=out['exit_status']=='Submitted' and unparsed==0
 def locate(p,line):
  if p not in source:return None
  containing=[r for r in trees.get(p,[]) if r['start']<=line<=r['end']]
  if not containing:return None
  width=min(r['end']-r['start'] for r in containing);unique=[r for r in containing if r['end']-r['start']==width]
  return unique[0] if len(unique)==1 else None
 seen='\n'.join(content_of(m) for m in record.get('messages',[])[:2]);issue_given={p for p in files if p in seen};anticipation=None;reached=None;firstedit=None;firstanyedit=None;stale=set();actions=[];searches=[];readfunctions=set();unknownviews=0;broad_reached=None;signature_cache={};all_verified_edits=set()
 for i,s in enumerate(steps,1):
  command=s['command'];output=s['output'];returned=s.get('returned_text',output);chars=len(returned);bytecount=len(returned.encode());views=[];verifiedlines=set();lineclaims=collections.defaultdict(set);edited=set();kinds=set();segmentlist=g2.segments(command)
  if anticipation is None and any(p in command and p not in seen for p in files):anticipation=i
  for segment in segmentlist:
   cls,v,h,e=g2.classify(segment,output,source);kinds|=cls;edited|=set(e)
   if s.get('exit') not in [None,0]:continue
   for p,a,b in v:
    if p in stale or re.search(r'\|\s*(?:grep|rg|awk)',segment):unknownviews+=1;continue
    locations=visible_locations(source[p],a,b,output)
    if not locations:unknownviews+=1;continue
    for n,position in locations:lineclaims[position].add((p,n))
    views.append((p,a,b))
  ambiguous_view_lines=sum(len(keys)>1 for keys in lineclaims.values())
  if ambiguous_view_lines:unknownviews+=1
  verifiedlines={next(iter(keys)) for keys in lineclaims.values() if len(keys)==1}
  vf={(p,hit['start']) for p,n in verifiedlines if (hit:=locate(p,n)) is not None}
  readfunctions |= vf
  verifiededit=set()
  patch_body=literal_patch(command);patch_action=patch_body is not None
  inspection=bool(re.search(r'--(?:check|dry-run|stat|numstat|summary|directory|reverse|cached)|(?:^|\s)-R(?:\s|$)',command))
  changes=g2.patch_changes(patch_body,source) if patch_action else {}
  if patch_action and not inspection:edited|={p for p in changes if p in source}
  if edited and firstanyedit is None:firstanyedit=i
  # Literal successful applying action; classify's path guesses do not establish
  # diff paths. Inspection-only commands and no-op numeric sed stay unlocalized.
  verified_paths=verified_patch_paths(patch_body,source) if patch_action and not inspection and s.get('exit')==0 else set()
  for p,change in changes.items():
   if p in stale or p not in verified_paths:continue
   for line in change['old_lines']:
    hit=locate(p,line)
    if hit:verifiededit.add((p,hit['start']))
  all_verified_edits|=verifiededit
  if firstedit is None and verifiededit&target:firstedit=i
  if reached is None and (vf|verifiededit)&target:reached=i
  if broad_reached is None and (vf|verifiededit)&target:broad_reached=i
  if broad_reached is None and s.get('exit') in [None,0]:
   for path0 in files:
    lines0=source.get(path0,'').splitlines()
    for path1,start in target:
     if path0!=path1:continue
     hitrow=next((q for q in trees.get(path0,[]) if q['start']==start),None)
     if hitrow and any(len(line.strip())>=16 and lines0.count(line)==1 and line.strip() in output for line in lines0[start-1:min(hitrow['end'],start+3)]):
      if path0 in command or path0 in output:broad_reached=i
  if 'search' in kinds:
   sr=dict(step=i,measurable=False,unknown_reason=None,order_changed=None,ordinary_rank=None,box_rank=None,fix_present=None,opportunity=None,top3_rescue=None,regression=None,partial_unknown_results=False)
   searchsegments=[z for z in segmentlist if g2.SEARCH.search(z)]
   if len(searchsegments)!=1 or len(segmentlist)!=1:sr['unknown_reason']='inseparable combined command'
   elif not ev.valid:sr['unknown_reason']='invalid trace'
   elif any(z in command for z in ['-A','-B','-C','--context','-U','--multiline']):sr['unknown_reason']='context/multiline fallback'
   else:
    segment=searchsegments[0];words=g2.words(segment);explicit=[g2.norm(w,source) for w in words];explicit=[x for x in explicit if x]
    lines=output.encode().splitlines(keepends=True); locations=[];matched=[];unverified_matches=0
    for ordinal,line in enumerate(lines):
     text=line.rstrip(b'\r\n').decode(errors='replace');m=re.match(r'^(?:\./|/testbed/)?([^:]+\.pyi?):(\d+):(.*)$',text);short=re.match(r'^(\d+):(.*)$',text) if not m and len(set(explicit))==1 else None
     p0=m.group(1) if m else explicit[0] if short else None;n=int(m.group(2)) if m else int(short.group(1)) if short else None;content=m.group(3) if m else short.group(2) if short else None
     if p0 not in source or p0 in stale or n is None:
      if m or short:unverified_matches+=1
      continue
     base=source[p0].splitlines()
     if not 1<=n<=len(base) or base[n-1]!=content:unverified_matches+=1;continue
     locations.append(dict(ordinal=ordinal,path=p0,line=n,source_sha256=ev.digests[p0],kind='line',is_match=True));hit=locate(p0,n)
     matched.append((ordinal,None if hit is None else (p0,hit['start'])))
    sr['partial_unknown_results']=unverified_matches>0;sr['unverified_matches']=unverified_matches
    if not locations:sr['unknown_reason']='no verified numbered matches'
    else:
     shown,proof=adapter.present(output.encode(),'grep',words[1:],ev,locations=locations)
     order=proof.get('order',list(range(len(lines))));old=[n for n,key in matched if key in target];ranks={n:j+1 for j,n in enumerate(order)}
     sr.update(measurable=True,matches=len(locations),order_changed=order!=list(range(len(lines))),ordinary_rank=min(old)+1 if old else None,box_rank=min(ranks[n] for n in old) if old else None,fix_present=bool(old),opportunity=order!=list(range(len(lines))) and bool(old),top3_rescue=bool(old) and min(old)+1>3 and min(ranks[n] for n in old)<=3,regression=bool(old) and min(ranks[n] for n in old)>min(old)+1)
     sr['order']=order;sr['locations']=locations
   searches.append(sr)
  counts,outside_keys=tally(source,ev,verifiedlines,signature_cache)
  inside_bytes=counts['inside'];outside_bytes=counts['outside'];module_bytes=counts['module']
  actions.append(dict(step=i,unknown_action=s.get('unknown_action',False),classes=sorted(kinds),chars=chars,bytes=bytecount,view_functions=sorted(p+':'+str(n) for p,n in vf),view_functions_inside=len(vf&ev.called) if ev.valid else None,view_functions_outside=len(vf-ev.called) if ev.valid else None,view_source_bytes_inside=inside_bytes if ev.valid else None,view_source_bytes_outside=outside_bytes if ev.valid else None,view_source_bytes_module=module_bytes,edited_files=sorted(edited),verified_target_edit=bool(verifiededit&target),native_output_bytes=len(output.encode()),ambiguous_view_lines=ambiguous_view_lines,view_source_lines=len(verifiedlines),slice_removable_source_bytes=counts['removable'] if ev.valid else None,slice_outside_keys=sorted(p+':'+str(n) for p,n in outside_keys),verified_edit_functions=sorted(p+':'+str(n) for p,n in verifiededit)))
  stale|=edited;seen+='\n'+output
 out.update(reached_step=reached,broad_visible_step=broad_reached,first_verified_target_edit=firstedit,first_any_edit=firstanyedit,anticipation_step=anticipation,issue_supplied_target_files=sorted(issue_given),unknown_views=unknownviews,whole_bytes=sum(a['bytes'] for a in actions),before_bytes=sum(a['bytes'] for a in actions[:reached-1]) if reached else None,locating_step_share=(reached-1)/len(steps) if reached else None,pre_reach_opportunity=any(s.get('opportunity') and (not reached or s['step']<reached) for s in searches) if ev.valid and target else None,never_reach_top3=any(s.get('top3_rescue') for s in searches) if not reached and out['complete_record'] else None,searches=searches,actions=actions)
 out['before_text_share']=out['before_bytes']/out['whole_bytes'] if out['before_bytes'] is not None and out['whole_bytes'] else None
 after=[a for a in actions if reached and a['step']>reached and (not firstedit or a['step']<firstedit)]
 after_keys=set(k for a in after for k in a['view_functions']);called={p+':'+str(n) for p,n in ev.called};out['after_finding']=dict(censored=firstedit is None,returned_bytes=sum(a['bytes'] for a in after),source_bytes_inside=sum(a['view_source_bytes_inside'] or 0 for a in after) if ev.valid else None,source_bytes_outside=sum(a['view_source_bytes_outside'] or 0 for a in after) if ev.valid else None,inside_functions=len(after_keys&called) if ev.valid else None,outside_functions=len(after_keys-called) if ev.valid else None)
 # Final submitted patch supplies an additional observed-edit check, not a time
 # of finding and not proof that an edit was necessary for a correct repair.
 finalkeys=set()
 submission=(record.get('info')or{}).get('submission')or''
 for p,change in g2.patch_changes(submission,source).items():
  for n in change['old_lines']:
   hit=locate(p,n)
   if hit:finalkeys.add(p+':'+str(hit['start']))
 final_removed_keys=set()
 for p,numbers in verified_removed_lines(submission,source).items():
  for number in numbers:
   hit=locate(p,number)
   if hit:final_removed_keys.add(p+':'+str(hit['start']))
 targetkeys={p+':'+str(n) for p,n in target}
 out['submitted_target_edit']=bool(final_removed_keys&targetkeys)
 out['submitted_verified_removed_functions']=sorted(final_removed_keys)
 out['ever_timed_or_submitted_target']=bool(reached or out['submitted_target_edit'])
 seenoutside=set(k for a in actions for k in a['slice_outside_keys'])
 editedkeys=set(k for a in actions for k in a['verified_edit_functions'])|finalkeys
 repeat=set();seenkeys=set()
 for a in actions:
  repeat|=seenkeys&set(a['slice_outside_keys']);seenkeys|=set(a['slice_outside_keys'])
 out['slicing']=dict(verified_view_source_bytes=sum((a['view_source_bytes_inside']or 0)+(a['view_source_bytes_outside']or 0)+a['view_source_bytes_module'] for a in actions),removable_source_bytes=sum(a['slice_removable_source_bytes']or 0 for a in actions) if ev.valid else None,omitted_functions=len(seenoutside),omitted_gold_functions=sorted(seenoutside&targetkeys),omitted_edited_functions=sorted(seenoutside&editedkeys),repeated_outside_functions=len(repeat),unknown_view_actions=unknownviews)
 return out
