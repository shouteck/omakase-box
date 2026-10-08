"""Research final-display adapter. Never execute repository code on the host."""
import ast, base64, collections, hashlib, json, pathlib, posixpath, re, subprocess, sys
MARK=b'[ran]'
sha=lambda b:hashlib.sha256(b).hexdigest()

def definitions(text):
    out=[]
    def visit(node,parents=()):
        for n in ast.iter_child_nodes(node):
            if isinstance(n,(ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)):
                name='.'.join(parents+(n.name,))
                if not isinstance(n,ast.ClassDef):
                    out.append({'name':name,'code_name':n.name,'start':min([n.lineno]+[d.lineno for d in n.decorator_list]),'def_line':n.lineno,'end':n.end_lineno})
                visit(n,parents+(n.name,))
            else:visit(n,parents)
    visit(ast.parse(text))
    return out

class Evidence:
    def __init__(self,sources,trace,valid=True,excluded=()):
        self.sources=sources
        self.digests={p:sha(t.encode('utf-8')) for p,t in sources.items()}
        self.trees={};self.called=set();self.unknown=[];self.valid=valid
        self.excluded=set(excluded)
        for key,value in trace.items():
            try:p,line=key.rsplit(':',1);line=int(line);order,name=value
            except (ValueError,TypeError):self.unknown.append([key,'invalid trace key']);continue
            if p not in sources or p in self.excluded or name.startswith('<'):
                continue
            tree=self.tree(p)
            rows=[r for r in tree if r['start']==line and r['code_name']==name]
            if len(rows)==1 and sum(r['start']==line for r in tree)==1 and valid:
                self.called.add((p,line))
            else:self.unknown.append([key,'no unique exact definition'])
    def tree(self,p):
        if p not in self.trees:
            try:self.trees[p]=definitions(self.sources[p])
            except (SyntaxError,ValueError,RecursionError):self.trees[p]=[]
        return self.trees[p]
    def locate(self,p,line,digest):
        if not self.valid or p in self.excluded or digest!=self.digests.get(p):return None
        containing=[r for r in self.tree(p) if r['start']<=line<=r['end']]
        if not containing:return None
        width=min(r['end']-r['start'] for r in containing)
        rows=[r for r in containing if r['end']-r['start']==width]
        if len(rows)!=1:return None
        r=rows[0]
        return dict(r,path=p,called=(p,r['start']) in self.called)
    def file_answer(self,p):
        if not self.valid or p in self.excluded:return 'Unknown: no current complete evidence for '+p+'\n'
        rows=[r for r in self.tree(p) if (p,r['start']) in self.called]
        return ''.join('%s:%s %s\n'%(p,r['start'],r['name']) for r in rows) or 'No verified called definition in this file.\n'


def relative_path(value,root=None,cwd=None):
    value=value.replace('\\','/')
    if root:
        base=posixpath.normpath(str(root).replace('\\','/'))
        current=posixpath.normpath(str(cwd or root).replace('\\','/'))
        full=posixpath.normpath(value if value.startswith('/') or re.match(r'^[A-Za-z]:/',value) else posixpath.join(current,value))
        return full[len(base)+1:] if full.startswith(base+'/') else None
    value=posixpath.normpath(value)
    if value.startswith('/testbed/'):return value[len('/testbed/'):]
    if value.startswith('/') or re.match(r'^[A-Za-z]:/',value) or value=='..' or value.startswith('../'):return None
    return value

def parse_locations(raw,evidence,root=None,cwd=None):
    locations=[]
    for i,line in enumerate(raw.splitlines(keepends=True)):
        try:text=line.decode('utf-8').rstrip('\r\n')
        except UnicodeError:continue
        m=re.match(r'^(.*?)([:\-])(\d+)([:\-])(.*)$',text)
        if not m:continue
        p=relative_path(m.group(1),root,cwd)
        if p not in evidence.sources:continue
        n=int(m.group(3));content=m.group(5)
        source=evidence.sources[p].splitlines()
        if not 1<=n<=len(source) or source[n-1]!=content:continue
        locations.append({'ordinal':i,'path':p,'line':n,'is_match':m.group(2)==':' and m.group(4)==':','source_sha256':evidence.digests[p],'kind':'line'})
    return locations

def present(raw,tool,args,evidence,locations=None,root=None,cwd=None):
    """Native command/pipeline has already completed; only display changes."""
    lines=raw.splitlines(keepends=True)
    base={'same_records':True,'order':list(range(len(lines))),'marked':[],'locations':[],'format':'pass-through'}
    machine=tool=='find' or b'\0' in raw or any(a in ('--json','--null','--null-data','--count','--count-matches','--only-matching','--quiet','--heading','--pretty','--multiline','--multiline-dotall','--files-without-match','--files-with-matches') or
       (a.startswith('-') and not a.startswith('--') and any(c in a[1:] for c in 'zZqclLoU')) for a in args)
    if machine or not evidence.valid:return raw,base
    # Saved locations may come from a changed file; source hash rejects them.
    locations=parse_locations(raw,evidence,root,cwd) if locations is None else locations
    located=[]
    seen=collections.Counter(r['ordinal'] for r in locations)
    for old in locations:
        r=dict(old);r['priority']=False
        if seen[r['ordinal']]!=1 or not 0<=r['ordinal']<len(lines):continue
        if r.get('kind')=='line' and r.get('line') and r.get('is_match'):
            # A captured line without an explicit line number is ambiguous.
            try: record=lines[r['ordinal']].decode('utf-8').rstrip('\r\n')
            except UnicodeError: continue
            m=re.match(r'^(.*?)([:\-])(\d+)([:\-])(.*)$',record)
            short=re.match(r'^(\d+)([:\-])(.*)$',record) if not m else None
            n=int(m.group(3)) if m else int(short.group(1)) if short else None
            content=m.group(5) if m else short.group(3) if short else None
            if m:
                if relative_path(m.group(1),root,cwd)!=r['path'] or m.group(2)!=':' or m.group(4)!=':':continue
            elif short:
                supplied={relative_path(a,root,cwd) for a in args if not a.startswith('-')}
                explicit={a for a in supplied if a in evidence.sources}
                if explicit!={r['path']} or short.group(2)!=':':continue
            src=evidence.sources.get(r['path'],'').splitlines()
            if n!=r['line'] or not n or not 1<=n<=len(src) or src[n-1]!=content: continue
            hit=evidence.locate(r['path'],r['line'],r.get('source_sha256'))
            if hit:
                r['function_start']=hit['start'];r['function_name']=hit['name'];r['priority']=hit['called']
        located.append(r)
    by={r['ordinal']:r for r in located}
    context=any(a in ('-A','-B','-C','--after-context','--before-context','--context') or
        (a.startswith('-') and not a.startswith('--') and any(c in a[1:] for c in 'ABC')) or
        a.startswith(('--context=','--after-context=','--before-context=')) for a in args)
    if context:
        groups=[];separators=[];current=[];previous=None
        for i,line in enumerate(lines):
            r=by.get(i)
            if line.rstrip(b'\r\n')==b'--':
                if current:groups.append(current)
                current=[];previous=None;separators.append(i);continue
            if r and previous and (r['path']!=previous['path'] or r.get('line',0)>previous.get('line',0)+1):
                if current:groups.append(current)
                current=[]
            current.append(i)
            if r:previous=r
        if current:groups.append(current)
        ordered=sorted(groups,key=lambda g:not any(by.get(i,{}).get('priority') for i in g))
        order=[]
        for j,g in enumerate(ordered):
            if j and j-1<len(separators):order.append(separators[j-1])
            order+=g
        order+=separators[max(0,len(ordered)-1):]
    else:order=sorted(range(len(lines)),key=lambda i:not by.get(i,{}).get('priority'))
    marked=[i for i in order if by.get(i,{}).get('priority')]
    markedset=set(marked)
    output=b''.join((MARK if i in markedset else b'')+lines[i] for i in order)
    restored=[line[len(MARK):] if i in markedset else line for i,line in zip(order,output.splitlines(keepends=True))]
    assert len(order)==len(lines) and collections.Counter(restored)==collections.Counter(lines)
    return output,{'same_records':True,'order':order,'marked':marked,'locations':located,'format':'human','context':context}

def run(argv,cwd,evidence):
    p=subprocess.run(argv,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    shown,proof=present(p.stdout,'rg',argv[1:],evidence)
    return p.returncode,p.stderr,p.stdout,shown,proof
