"""Python 3.6-compatible ordered-call helper, run only in pinned network-off container."""
import hashlib,json,os,pathlib,runpy,sys,time,threading
OUT=pathlib.Path('/tmp/lab-ideal-box-facts')
TARGET='test_get_context_does_not_mutate_attrs'
calls={};events=[];frames={};counter=[0];active=[0];files=set();cap=[False]
def trace(frame,event,arg):
    path=os.path.realpath(frame.f_code.co_filename)
    if not path.startswith('/testbed/'):return None
    rel=path[len('/testbed/'):]
    if event=='call':
        key=rel+':'+str(frame.f_code.co_firstlineno)
        if key not in calls:calls[key]=[len(calls)+1,frame.f_code.co_name]
        parent=frame.f_back
        while parent and id(parent) not in frames:parent=parent.f_back
        parent_id=frames[id(parent)][0] if parent else None
        isroot=frame.f_code.co_name==TARGET
        inside=bool(active[0]) or isroot
        counter[0]+=1;ident=counter[0];frames[id(frame)]=(ident,inside,isroot)
        if isroot:active[0]+=1
        if inside:
            files.add(rel)
            if len(events)<100000:events.append({'event':'call','id':ident,'parent':parent_id,'path':rel,'start':frame.f_code.co_firstlineno,'name':frame.f_code.co_name,'line':frame.f_lineno})
            else:cap[0]=True
        try:frame.f_trace_lines=False
        except AttributeError:pass
        return trace
    info=frames.get(id(frame))
    if info and info[1] and event in ('return','exception'):
        row={'event':event,'id':info[0],'path':rel,'start':frame.f_code.co_firstlineno,'name':frame.f_code.co_name,'line':frame.f_lineno}
        if event=='exception':row['exception_type']=arg[0].__name__
        if len(events)<100000:events.append(row)
        else:cap[0]=True
    if event=='return' and info:
        if info[2]:active[0]-=1
        del frames[id(frame)]
    return trace
def child(mode,argv):
    started=time.monotonic()
    if mode=='ordered':
        threading.settrace(trace);sys.settrace(trace)
    try:
        sys.path.insert(0,os.getcwd());sys.argv=argv
        sys.path.insert(0,os.path.dirname(os.path.abspath(argv[0])))
        runpy.run_path(argv[0],run_name='__main__')
    finally:
        sys.settrace(None);threading.settrace(None)
        if mode=='ordered':
            sources={}
            files.add('django/forms/widgets.py')
            for rel in files:
                try:sources[rel]=pathlib.Path('/testbed',rel).read_text(encoding='utf-8')
                except (OSError,UnicodeError):pass
            data={'calls':calls,'events':events,'sources':sources,'cap_hit':cap[0],'collector_seconds':time.monotonic()-started,'target':TARGET}
            (OUT/'ordered.json').write_text(json.dumps(data),encoding='utf-8')
if __name__=='__main__':
    OUT.mkdir(exist_ok=True);os.chdir('/testbed')
    child(sys.argv[1],sys.argv[2:])
