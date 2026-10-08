import base64,fcntl,json,os,pathlib,shutil,subprocess,sys
tool=sys.argv[1];args=sys.argv[2:];native=shutil.which(tool)
argv=([native,'grep']+args) if tool=='git' else [native]+args if native else None
if argv:
 p=subprocess.run(argv,stdin=sys.stdin.buffer,stdout=subprocess.PIPE,stderr=subprocess.PIPE);out,err,code=p.stdout,p.stderr,p.returncode
else:out,err,code=b'',(tool+': command not found\n').encode(),127
row={'tool':tool,'args':args,'cwd':os.getcwd(),'exit':code,'stdout_b64':base64.b64encode(out).decode(),'stderr_b64':base64.b64encode(err).decode()}
with open(os.environ['LAB_CAPTURE_LOG'],'a') as f:
 fcntl.flock(f.fileno(),fcntl.LOCK_EX);f.write(json.dumps(row)+'\n');f.flush()
sys.stderr.buffer.write(err)
try:sys.stdout.buffer.write(out);sys.stdout.buffer.flush()
except BrokenPipeError:os._exit(141)
raise SystemExit(code if code>=0 else 128-code)
