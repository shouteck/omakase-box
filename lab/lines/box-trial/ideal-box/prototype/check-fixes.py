import json,pathlib,subprocess,shutil
from adapter import Evidence,present,sha
HERE=pathlib.Path(__file__).resolve().parent
src='def ordinary():\n    needle = 1\n\ndef called():\n    needle = 2\n'
e=Evidence({'a.py':src,'b.py':src},{'a.py:4':[1,'called'],'b.py:4':[2,'called']})
cases=[]
raw=b'a.py:2:    needle = 1\na.py:3:\na.py:4:def called():\na.py:5:    needle = 2\n'
for flag in ['--multiline','-U','--multiline-dotall']:
    shown,p=present(raw,'rg',['-n',flag],e)
    assert shown==raw and not p['marked']
    cases.append(flag)
line=b'a.py:5:    needle = 2\n'
wrong=[{'ordinal':0,'path':'b.py','line':5,'is_match':True,'kind':'line','source_sha256':e.digests['b.py']}]
shown,p=present(line,'rg',['-n'],e,wrong)
assert shown==line and not p['marked'];cases.append('contradictory-native-filename')
loc=[dict(wrong[0],path='a.py',source_sha256=e.digests['a.py'])]
for args,want in [(['-n','a.py'],True),(['-n'],False),(['-n','a.py','b.py'],False)]:
    shown,p=present(b'5:    needle = 2\n','rg',args,e,loc)
    assert bool(p['marked'])==want
    cases.append('number-only-'+str(args))
for prefix,root,cwd in [('a.py',None,None),('/testbed/a.py','/testbed','/testbed'),('../a.py','/testbed','/testbed/nested')]:
    shown,p=present((prefix+':5:    needle = 2\n').encode(),'rg',['-n'],e,loc,root,cwd)
    assert p['marked']==[0]
    cases.append('valid-prefix-'+prefix)
scratch=HERE/'scratch/sceptic-fixes';scratch.mkdir(parents=True,exist_ok=True)
(scratch/'a.py').write_bytes(src.encode())
argv=[shutil.which('rg'),'-n','--with-filename','--multiline',r'needle = 1[\s\S]*needle = 2','a.py']
native=subprocess.run(argv,cwd=scratch,capture_output=True)
assert native.returncode==0 and native.stdout==raw
shown,p=present(native.stdout,'rg',argv[1:],e)
assert shown==native.stdout and not p['marked']
cases.append('actual-native-cross-definition-multiline')
r={'status':'pass','count':len(cases),'cases':cases,'adapter_sha256':sha((HERE/'adapter.py').read_bytes())}
(HERE/'fix-check.json').write_bytes(json.dumps(r,indent=2).encode())
print(json.dumps(r))
