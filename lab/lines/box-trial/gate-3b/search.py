"""Native search wrapper; executes only inside owned network-off containers."""
import ast, base64, collections, hashlib, io, json, os, pathlib, re, shutil, subprocess, sys, tokenize
MARK = b'[BOX] '
def sha(v): return hashlib.sha256(v).hexdigest()
def function_rows(text):
    out=[];tokens=None
    def end_line(node):
        nonlocal tokens
        known=getattr(node,'end_lineno',None)
        if known is not None:return known
        if tokens is None:tokens=list(tokenize.generate_tokens(io.StringIO(text).readline))
        index=next(i for i,t in enumerate(tokens) if t.start[0]>=node.lineno and t.start[1]==node.col_offset and t.string in ('def','async'))
        header_end=next(i for i in range(index,len(tokens)) if tokens[i].type==tokenize.NEWLINE)
        if node.body[0].lineno==tokens[index].start[0]:return tokens[header_end].start[0]
        first_indent=next(i for i in range(header_end+1,len(tokens)) if tokens[i].type==tokenize.INDENT)
        depth=1;last=node.lineno
        for token in tokens[first_indent+1:]:
            if token.type==tokenize.INDENT:depth+=1
            elif token.type==tokenize.DEDENT:
                depth-=1
                if not depth:return last
            elif token.type not in (tokenize.NL,tokenize.NEWLINE,tokenize.COMMENT,tokenize.ENDMARKER):last=max(last,token.end[0])
        return last
    def visit(node, parents=()):
        for n in ast.iter_child_nodes(node):
            if isinstance(n,(ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)):
                name='.'.join(parents+(n.name,))
                if not isinstance(n,ast.ClassDef):out.append((name,min([n.lineno]+[d.lineno for d in n.decorator_list]),end_line(n)))
                visit(n,parents+(n.name,))
            else:visit(n,parents)
    visit(ast.parse(text));return out

def reorder(raw, tool, args, scope, root, cwd):
    lines=raw.splitlines(keepends=True);cache={};cursors={};locations=[]
    def filedata(p):
        path=pathlib.Path(p)
        if not path.is_absolute():path=cwd/path
        try:
            path=path.resolve();rel=path.relative_to(root).as_posix()
            if not path.is_file():return None
            if rel not in cache:
                data=path.read_bytes();spans=[];functions=[]
                try:
                    functions=function_rows(data.decode('utf-8'));spans=[(a,b) for name,a,b in functions if name in scope.get(rel,[])]
                except (SyntaxError,UnicodeError,ValueError):pass
                cache[rel]=(data.splitlines(),spans,sha(data),functions)
            return rel,cache[rel]
        except (OSError,ValueError):return None
    machine=tool!='find' and any(a in ('--null','--null-data','--json','--count','--count-matches','--only-matching','--quiet','--files-without-match','--files-with-matches') or (a.startswith('-') and not a.startswith('--') and any(c in a[1:] for c in 'zZqclLo')) for a in args)
    if machine or b'\0' in raw:return raw,[],{'format':'machine-pass-through','same_records':True}
    candidates=[a for a in args if not a.startswith('-') and filedata(a)]
    unique=list(dict.fromkeys(candidates));single=unique[0] if len(unique)==1 else None
    for i,byte in enumerate(lines):
        text=byte.decode('utf-8',errors='replace').rstrip('\r\n');p=n=None;match=True;kind='unlocated';data=None
        if tool=='find':
            data=filedata(text)
            if data:p=text;kind='file'
        else:
            m=re.match(r'^(.*?)([:\-])(\d+)([:\-])(.*)$',text)
            if m and filedata(m.group(1)):
                p=m.group(1);n=int(m.group(3));match=m.group(2)==':' and m.group(4)==':';kind='line';data=filedata(p)
            else:
                m=re.match(r'^(\d+)([:\-])(.*)$',text)
                if m and single:p=single;n=int(m.group(1));match=m.group(2)==':';kind='line';data=filedata(p)
                else:
                    m=re.match(r'^(.*?):(.*)$',text)
                    content=text
                    if m and filedata(m.group(1)):p=m.group(1);content=m.group(2);data=filedata(p)
                    elif single:p=single;data=filedata(p)
                    if data:
                        rel,(source,spans,digest,functions)=data;start=cursors.get(rel,0)
                        hits=[j+1 for j,v in enumerate(source) if j>=start and v.decode('utf-8',errors='replace')==content]
                        if hits:n=hits[0];cursors[rel]=n;kind='line'
        if data:
            rel,(source,spans,digest,functions)=data;priority=bool(spans) if kind=='file' else bool(n and match and any(a<=n<=b for a,b in spans))
            locations.append({'ordinal':i,'path':rel,'line':n,'kind':kind,'is_match':match,'priority':priority,'source_sha256':digest,'function_names':[name for name,a,b in functions if n and a<=n<=b]})
    # Keep context groups intact, including their native separators. With no
    # explicit separators use contiguous runs from one file (native grep -C).
    context=any(a in ('-A','-B','-C','--after-context','--before-context','--context') or (a.startswith('-') and not a.startswith('--') and any(c in a[1:] for c in 'ABC')) or a.startswith(('--context=','--after-context=','--before-context=')) for a in args)
    groups=[];separators=[];by={v['ordinal']:v for v in locations}
    if context:
        current=[];previous=None
        for i,line in enumerate(lines):
            loc=by.get(i)
            if line.rstrip(b'\r\n')==b'--':
                separators.append(i)
                if current:groups.append(current)
                current=[];previous=None;continue
            if loc and previous and (loc['path']!=previous['path'] or (loc['line'] and previous['line'] and loc['line']>previous['line']+1)):
                if current:groups.append(current)
                current=[]
            current.append(i)
            if loc:previous=loc
        if current:groups.append(current)
    else:groups=[[i] for i in range(len(lines))]
    ordered=sorted(groups,key=lambda g: not any(by.get(i,{}).get('priority') for i in g))
    ordinals=[]
    for index,group in enumerate(ordered):
        if index and index-1<len(separators):ordinals.append(separators[index-1])
        ordinals.extend(group)
    ordinals.extend(separators[max(0,len(ordered)-1):])
    marked=[i for i in ordinals if by.get(i,{}).get('priority')]
    output=b''.join((MARK if i in marked else b'')+lines[i] for i in ordinals)
    # Only remove the mark at recorded positions, never a user's preexisting text.
    restored=[line[len(MARK):] if old in marked else line for old,line in zip(ordinals,output.splitlines(keepends=True))]
    same=collections.Counter(restored)==collections.Counter(lines)
    assert same and len(ordinals)==len(lines)
    return output,locations,{'format':'human','same_records':same,'order':ordinals,'marked':marked,'context_groups':len(groups),'context':context}

def main():
    tool=sys.argv[1];args=sys.argv[2:];native=shutil.which(tool)
    command=([native,'grep']+args) if tool=='git' else ([native]+args) if native else None
    if not native:out=b'';err=(tool+': command not found\n').encode();code=127
    else:
        p=subprocess.run(command,stdin=sys.stdin.buffer,stdout=subprocess.PIPE,stderr=subprocess.PIPE);out,err,code=p.stdout,p.stderr,p.returncode
    scope=json.loads(pathlib.Path(os.environ['LAB_BOX_SCOPE']).read_text(encoding='utf-8'))
    root=pathlib.Path(os.environ.get('LAB_BOX_ROOT','/testbed')).resolve();cwd=pathlib.Path.cwd()
    try:ordered,locations,proof=reorder(out,'grep' if tool=='git' else tool,args,scope,root,cwd)
    except Exception as error:
        ordered,locations,proof=out,[],{'format':'fault-pass-through','same_records':True,'ordering_error':repr(error)}
    mode=os.environ.get('LAB_BOX_MODE','box')
    # Keep annotation out of all pipes. The trusted final command adapter adds
    # marks only to source records actually displayed after downstream filters.
    source_lines=out.splitlines(keepends=True)
    visible=b''.join(source_lines[i] for i in proof.get('order',range(len(source_lines)))) if mode=='box' else out
    row={'tool':tool,'wrapper_sha256':sha(pathlib.Path(__file__).read_bytes()),'interpreter':sys.version,'args':args,'cwd':str(cwd),'exit':code,'stderr_sha256':sha(err),'native_sha256':sha(out),'ordered_sha256':sha(ordered),'native_bytes':len(out),'locations':locations,'proof':proof,'mode':mode,'emitted_sha256':sha(visible),'stdout_b64':base64.b64encode(out).decode(),'stderr_b64':base64.b64encode(err).decode()}
    with open(os.environ['LAB_BOX_LOG'],'a',encoding='utf-8') as stream:stream.write(json.dumps(row,ensure_ascii=True)+'\n')
    sys.stderr.buffer.write(err)
    try:sys.stdout.buffer.write(visible);sys.stdout.buffer.flush()
    except BrokenPipeError:os._exit(141)
    raise SystemExit(code if code>=0 else 128-code)
if __name__=='__main__':main()