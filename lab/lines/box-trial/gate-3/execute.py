"""Trusted command/search adapter; run only inside network-off task containers."""
import json, os, pathlib, re, signal, subprocess, sys, time
request=json.load(sys.stdin)
started=time.monotonic()
os.chdir('/testbed')
def run(argv):
    p=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    timeout=False
    try: out,err=p.communicate(timeout=300)
    except subprocess.TimeoutExpired:
        timeout=True;os.killpg(p.pid,signal.SIGKILL);out,err=p.communicate()
    return out,err,p.returncode,timeout
try:
    if request.get('mode')=='box':
        scope=request['scope'];paths=sorted(scope)
        filters=request.get('paths',[])
        if filters:paths=[p for p in paths if any(p==f or p.startswith(f.rstrip('/')+'/') for f in filters)]
        argv=['grep','-Hn','-F' if request.get('literal') else '-E']
        if request.get('ignore_case'):argv+=['-i']
        if paths:
            out,err,code,timeout=run(argv+['--',request['pattern']]+paths)
            kept=[]
            for line in out.decode('utf-8',errors='replace').splitlines():
                m=re.match(r'^([^:]+):(\d+):(.*)$',line)
                if m and any(a<=int(m.group(2))<=b for a,b in scope.get(m.group(1),[])):kept.append(line)
            out=('\n'.join(kept)+('\n' if kept else '')).encode('utf-8')
            if code in [0,1]:code=0 if kept else 1
        else:out,err,code,timeout=b'',b'',1,False
    else:
        out,err,code,timeout=run(['/bin/bash','-c',request['command']])
    result={'stdout':out.decode('utf-8',errors='replace'),'stderr':err.decode('utf-8',errors='replace'),'exit':code,'timed_out':timeout,'seconds':time.monotonic()-started}
except Exception as error:result={'stdout':'','stderr':str(error),'exit':2,'timed_out':False,'seconds':time.monotonic()-started}
print(json.dumps(result))
