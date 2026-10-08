"""Owned fixtures exercising native final-display pipelines and identity attacks."""
import base64, json, pathlib, subprocess, sys, tempfile
from adapter import Evidence,present,sha,parse_locations
HERE=pathlib.Path(__file__).resolve().parent
def check():
    source='class Pair:\n    @property\n    def value(self):\n        needle = 1\n        return needle\n    @value.setter\n    def value(self, v):\n        needle = 2\n        self._value = needle\n\ndef outer():\n    needle = 3\n    def inner():\n        needle = 4\n        return needle\n    return needle\n'
    e=Evidence({'sample.py':source},{'sample.py:2':[1,'value'],'sample.py:11':[2,'outer']})
    assert e.called=={('sample.py',2),('sample.py',11)}
    cases=[]
    def add(label,raw,args,ev=e,locations=None):
        shown,proof=present(raw,'rg',args,ev,locations)
        cases.append({'label':label,'marked':proof['marked'],'same_records':proof['same_records'],'native_sha256':sha(raw),'shown_sha256':sha(shown)})
        return shown,proof
    raw=b'./sample.py:8:        needle = 2\n./sample.py:4:        needle = 1\n./sample.py:14:        needle = 4\n./sample.py:12:    needle = 3\n'
    shown,p=add('accessor-collision-and-nested',raw,['-n','needle','.'])
    assert p['marked']==[1,3] and p['order']==[1,3,0,2]
    _,p=add('stale-source-digest',raw,['-n'],locations=[dict(r,source_sha256=sha(b'stale')) for r in parse_locations(raw,e)])
    assert not p['marked'] and p['order']==[0,1,2,3]
    _,p=add('unknown-trace',raw,['-n'],Evidence({'sample.py':source},{},False))
    assert not p['marked'] and p['order']==[0,1,2,3]
    duplicate=Evidence({'sample.py':source},{'sample.py:3':[1,'value']})
    _,p=add('definition-line-not-code-start',raw,['-n'],duplicate);assert not p['marked']
    _,p=add('machine-json-pass-through',raw,['--json']);assert not p['marked'] and p['order']==[0,1,2,3]
    # A repeated name has distinct starts; runtime executes only the getter.
    namespace={};observed={}
    def trace(frame,event,arg):
        if event=='call' and frame.f_code.co_filename=='owned-fixture.py':
            observed['owned-fixture.py:'+str(frame.f_code.co_firstlineno)]=[len(observed)+1,frame.f_code.co_name]
        return None
    sys.settrace(trace)
    try:
        exec(compile(source,'owned-fixture.py','exec'),namespace)
        namespace['Pair']().value;namespace['outer']()
    finally:sys.settrace(None)
    actual=Evidence({'owned-fixture.py':source},observed)
    assert ('owned-fixture.py',2) in actual.called and ('owned-fixture.py',6) not in actual.called and ('owned-fixture.py',13) not in actual.called
    cases.append({'label':'actual-owned-code-call-identity','status':'pass','called':sorted(actual.called)})
    import shutil
    rg=shutil.which('rg');assert rg
    scratch=HERE/'scratch/fixture';scratch.mkdir(parents=True,exist_ok=True)
    (scratch/'sample.py').write_bytes(source.encode())
    argv=[rg,'-n','--with-filename','--color','never','needle','sample.py']
    native=subprocess.run(argv,cwd=scratch,capture_output=True);assert native.returncode==0
    _,p=add('native-direct',native.stdout,argv[1:]);assert {p['locations'][i]['line'] for i in p['marked']}=={4,5,12,16}
    # Native pipeline first, presentation last. Added marks never affect filters.
    for label,filterargs,expected in [('pipe-head',[rg,'-m','1','.'],0),('pipe-filter',[rg,'^4:'],0),('pipe-badge-filter',[rg,'-F','[ran]'],1)]:
        # Native rg --with-filename prefixes sample.py; select line explicitly.
        if label=='pipe-filter':filterargs=[rg,':4:']
        child=subprocess.run(filterargs,input=native.stdout,capture_output=True)
        _,p=add(label,child.stdout,argv[1:])
        assert child.returncode==expected
        if label=='pipe-badge-filter':assert not p['marked'] and child.stdout==b''
        cases[-1]['native_exit']=child.returncode;cases[-1]['stderr_sha256']=sha(child.stderr)
    context=subprocess.run([rg,'-n','--with-filename','--color','never','-C','1','needle =','sample.py'],cwd=scratch,capture_output=True)
    _,p=add('native-context',context.stdout,['-n','-C','1']);assert p['same_records']
    for label,argv in [('native-no-match',[rg,'-n','absent','sample.py']),('native-error',[rg,'[','sample.py'])]:
        native=subprocess.run(argv,cwd=scratch,capture_output=True)
        _,p=add(label,native.stdout,argv[1:]);cases[-1]['exit']=native.returncode;cases[-1]['stderr_sha256']=sha(native.stderr)
        assert native.returncode==(1 if label=='native-no-match' else 2)
    return {'status':'pass','cases':cases,'count':len(cases),'source_sha256':sha(source.encode()),'adapter_sha256':sha((HERE/'adapter.py').read_bytes())}
if __name__=='__main__':
    r=check();p=HERE/(sys.argv[1] if len(sys.argv)>1 else 'fixture.json');p.resolve().relative_to(HERE.resolve())
    p.write_bytes(json.dumps(r,indent=2).encode());print(json.dumps({'status':r['status'],'cases':r['count']}))
