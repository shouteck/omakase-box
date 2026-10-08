"""Verify visible base lines and bound optional slicing; never run repository code."""
import ast,collections,difflib,re

def visible_lines(source,a,b,output):
 base=source.splitlines();a=max(1,a);b=min(len(base),b)
 shown=output.splitlines()
 # nl/bat prefixes are stripped only when their numbered content equals base.
 for i,line in enumerate(shown):
  m=re.match(r"^\s*(\d+)(?=\s)",line)
  if m and a<=int(m[1])<=b:
   expected=base[int(m[1])-1];rest=line[m.end():]
   prefix=rest[:-len(expected)] if expected else rest
   if rest.endswith(expected) and prefix and not prefix.strip():shown[i]=expected
 piece=base[a-1:b];counts=collections.Counter(base);found=set()
 for block in difflib.SequenceMatcher(None,piece,shown,autojunk=False).get_matching_blocks():
  segment=piece[block.a:block.a+block.size]
  # Generic one-liners alone do not establish a source view.
  anchored=any(len(x.strip())>=16 and counts[x]==1 for x in segment)
  if anchored:
   found.update(range(a+block.a,a+block.a+block.size))
 return found

def signature_ends(text):
 try:tree=ast.parse(text)
 except (SyntaxError,ValueError,RecursionError):return {}
 return {min([n.lineno]+[d.lineno for d in n.decorator_list]):n.body[0].lineno-1
         for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.body}

def tally(source,ev,verified,signature_cache):
 result=dict(inside=0,outside=0,module=0,removable=0);outside=set();bases={}
 for path,number in verified:
  if path not in bases:bases[path]=source[path].splitlines(keepends=True)
  line=bases[path][number-1];size=len(line.encode())
  hit=ev.locate(path,number,ev.digests.get(path))
  if hit is None:result['module']+=size
  elif (path,hit['start']) in ev.called:result['inside']+=size
  else:
   result['outside']+=size
   if path not in signature_cache:signature_cache[path]=signature_ends(source[path])
   # Keep decorators, complete signatures and module-level text. Never remove
   # ambiguous/no-AST regions. A same-line body is kept with its signature.
   if number>max(hit['def_line'],signature_cache[path].get(hit['start'],hit['end'])):
    result['removable']+=size;outside.add((path,hit['start']))
 return result,outside

def verified_patch_paths(text,sources):
 current=None;old=None;good={};changed=set()
 for line in text.splitlines():
  if line.startswith('diff --git '):
   current=line.split(' b/',1)[-1];old=None;good[current]=current in sources
  elif line.startswith('@@ '):
   m=re.match(r'@@ -(\d+)(?:,\d+)? \+\d+',line)
   old=int(m[1]) if m else None
   if old is None and current:good[current]=False
  elif current and old is not None and line.startswith((' ','-','+')) and not line.startswith(('---','+++')):
   if line[0]!='+':
    source=sources.get(current,'').splitlines()
    if not 1<=old<=len(source) or source[old-1]!=line[1:]:good[current]=False
    old+=1
   if line[0] in '-+':changed.add(current)
 return {p for p in changed if good.get(p)}
