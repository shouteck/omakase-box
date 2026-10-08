"""Authored known-answer tool fixture, not an agent or benchmark repair run."""
import ast,json,pathlib,subprocess
from run import HERE,ROOT,command,create,dispatch,execute,idle,write,production_patch,passed_names,capture
from prepare import make
fixture='def called():\n    marker = "NEEDLE"\n    return marker\n\ndef unused():\n    marker = "NEEDLE"\n    return marker\n\nsetup = "NEEDLE"\n'
ident='astropy__astropy-13033'
image=json.loads((ROOT/'gate-1/image-digests.json').read_text())[ident]
record={'purpose':'authored fixture; no agent','image':image,'image_absent_before':command(['docker','image','inspect',image],timeout=30).returncode!=0,'checks':[]}
name=None
try:
    for path in HERE.glob('*.py'):ast.parse(path.read_text(encoding='utf-8'))
    task,scope=make(ident)
    directory=HERE/'calibration';directory.mkdir(exist_ok=True)
    if record['image_absent_before']:
        idle();r=command(['docker','pull',image]);(directory/'pull.log').write_bytes(r.stdout+r.stderr)
        if r.returncode:raise RuntimeError('Prepared image pull failed')
    name,args=create(image,task,directory);record['create_argv']=args
    assert capture(name,directory)==''
    record['checks'].append('unchanged prepared-worktree checkpoint exports an empty candidate despite dirty image files')
    src=directory/'fixture.py';src.write_bytes(fixture.encode());r=command(['docker','cp',str(src),name+':/testbed/lab_gate3_fixture.py'])
    if r.returncode:raise RuntimeError('Fixture copy failed')
    fixture_scope={'lab_gate3_fixture.py':[[1,3]]}
    result,called=dispatch(name,'box',fixture_scope,'box-search NEEDLE')
    assert called and result['stdout']=='lab_gate3_fixture.py:2:    marker = "NEEDLE"\n',result
    record['checks'].append('ordinary grep matching restricted to called function; unused body and setup absent')
    result,_=dispatch(name,'box',fixture_scope,'box-search -i needle');assert ':2:' in result['stdout']
    result,_=dispatch(name,'box',fixture_scope,'box-search -F NEEDLE');assert ':2:' in result['stdout']
    result,_=dispatch(name,'box',fixture_scope,'box-search ABSENT');assert result['exit']==1 and not result['stdout']
    result,_=dispatch(name,'box',fixture_scope,'box-search "["');assert result['exit']==2
    result,_=dispatch(name,'box',fixture_scope,'box-search NEEDLE nowhere');assert result['exit']==1
    result,called=dispatch(name,'control',fixture_scope,'box-search NEEDLE');assert result['exit']==127 and not called
    record['checks'] += ['literal/case-insensitive/no-match/error/path-filter responses','control command unavailable']
    r=execute(name,{'mode':'command','command':'python -c "import sys; print(sys.executable)"'});assert '/envs/testbed/' in r['stdout'],r
    record['checks'].append('ordinary command inherits prepared testbed environment')
    assert passed_names({'repo':'astropy/astropy'},['a.py::test_x'],'a.py::test_x PASSED\n')==['a.py::test_x']
    assert passed_names({'repo':'astropy/astropy'},['a.py::test_x'],'a.py::test_x SKIPPED\n')==[]
    assert passed_names({'repo':'django/django'},['test_x (m.C)'],'test_x (m.C) ... ok\n')==['test_x (m.C)']
    assert passed_names({'repo':'sympy/sympy'},['test_x'],'test_x ok\n')==['test_x']
    patch='diff --git a/pkg/a.py b/pkg/a.py\n+x\ndiff --git a/pkg/tests/test_a.py b/pkg/tests/test_a.py\n+y\n'
    assert 'test_a.py' not in production_patch(patch) and 'pkg/a.py' in production_patch(patch)
    record['checks']+=['test parsers reject skips','candidate production patch excludes benchmark tests']
    record['status']='pass'
except Exception as error:record.update(status='failed',error=str(error))
finally:
    if name:record['container_cleanup_exit']=command(['docker','rm','-f',name],timeout=60).returncode
    write(HERE/'calibration.json',record)
print(json.dumps({k:v for k,v in record.items() if k in ['status','error','checks']}),flush=True)
if record['status']!='pass':raise SystemExit(1)
