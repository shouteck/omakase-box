"""Development native ESM measurement; runner/setup are declared, no source rewrite."""
import os, pathlib, subprocess, json, sys
out=pathlib.Path('/record')
argv=sys.argv[1:]
if not argv: raise SystemExit('Native command argv required')
def run(label, command, extra=None):
    result=subprocess.run(command,cwd='/case/tree',env={**os.environ,**(extra or {})},capture_output=True,timeout=110)
    (out/(label+'.stdout')).write_bytes(result.stdout)
    (out/(label+'.stderr')).write_bytes(result.stderr)
    (out/(label+'.execution.json')).write_text(json.dumps({'argv':command,'exit':result.returncode}))
    return result
plain=run('plain',argv)
traced=run('traced',['strace','-f','-v','-yy','-s','65535','-e','trace=file,getdents64','-o','/record/files.strace']+argv)
measured=run('coverage',argv,{'LAB_NATIVE_CAPTURE':'1','NODE_V8_COVERAGE':'/record/v8','NODE_OPTIONS':'--enable-source-maps --import=/opt/instrument/native-typescript.mjs'})
extracted=run('extract',['node','/opt/instrument/native-typescript.mjs','extract','/record/v8','/record/native'])
result={'exits':[plain.returncode,traced.returncode,measured.returncode], 'rawTraceParity':(plain.returncode,plain.stdout,plain.stderr)==(traced.returncode,traced.stdout,traced.stderr), 'rawCoverageParity':(plain.returncode,plain.stdout,plain.stderr)==(measured.returncode,measured.stdout,measured.stderr),'extractExit':extracted.returncode}
if extracted.returncode==0: result['execution']=json.loads(extracted.stdout)
(out/'measurement.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
