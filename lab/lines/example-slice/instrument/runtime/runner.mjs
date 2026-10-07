import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {safePath} from '../core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../../../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function command(args) {const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw new Error('Docker failure: '+r.stderr);return r.stdout.trim();}
function manifest(directory,prefix='') {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>{
    if(e.isSymbolicLink())throw new Error('Symlink mount refused');
    const absolute=path.join(directory,e.name),relative=prefix+e.name;
    return e.isDirectory()?manifest(absolute,relative+'/'):[{path:relative,bytes:fs.statSync(absolute).size,sha256:hash(fs.readFileSync(absolute))}];
  });
}
export async function runCase({caseDirectory,outputDirectory,argv,image='lab-a-replay-1',label='check',timeoutMs=120000,treeOnlyMount=false,nodeCacheMount=false}) {
  const busy=spawnSync(process.execPath,[path.join(repo,'lab/tools/kitchen-busy.mjs')],{cwd:repo,encoding:'utf8'});
  if(busy.status!==0||!busy.stdout.trim().startsWith('idle ')) throw new Error('Kitchen gate did not report idle: '+busy.stdout.trim());
  if(!Array.isArray(argv)||!argv.length||argv.some(a=>typeof a!=='string'||a.includes('\0')))throw new Error('Invalid command argv');
  if(timeoutMs>120000||timeoutMs<=0)throw new Error('Invalid timeout');
  const isolated=fs.realpathSync(caseDirectory), records=path.resolve(outputDirectory);
  if(!path.basename(isolated).startsWith('lab-a-replay-1-'))throw new Error('Case directory must use lab-a-replay-1 prefix');
  if(records===isolated||records.startsWith(isolated+path.sep))throw new Error('Records must be outside mounted case');
  if(fs.existsSync(records))throw new Error('Refuse overwrite recorded run');
  const inputs=manifest(isolated), imageId=command(['image','inspect',image,'--format','{{.Id}}']);
  const name='lab-a-replay-1-'+crypto.randomUUID();
  const args=['create','--name',name,'--network','none','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--memory','4g','--cpus','2','--pids-limit','128','--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=256m',
    '--tmpfs','/record:rw,nosuid,nodev,size=512m,uid=1000,gid=1000','--mount',`type=bind,src=${treeOnlyMount?path.join(isolated,'tree'):isolated},dst=${treeOnlyMount?'/case/tree':'/case'},readonly`,
    '--workdir','/case/tree','--env','HOME=/tmp','--env','PYTHONPATH=/case/tree/src:/case/tree',imageId,'python','/opt/instrument/supervisor.py',String(timeoutMs),...argv];
  const started=new Date().toISOString();let timedOut=false,outputLimited=false,stdout='',stderr='',status=null;
  if(nodeCacheMount) {
    if(!treeOnlyMount||!fs.existsSync(path.join(isolated,'tree/node_modules'))||fs.readdirSync(path.join(isolated,'tree/node_modules')).length)throw new Error('Cache mount requires an empty declared node_modules directory');
    args.splice(args.indexOf('--workdir'),0,'--tmpfs','/case/tree/node_modules:rw,nosuid,nodev,size=64m,uid=1000,gid=1000');
  }
  const lock=path.join(os.tmpdir(),'lab-a-replay-1-runtime.lock');
  const lease=fs.openSync(lock,'wx');fs.writeFileSync(lease,JSON.stringify({pid:process.pid,started,name}));
  fs.mkdirSync(records,{recursive:true});
  let created=false;
  try {
    command(args);created=true;
    let captureError=null, monitor;
    await new Promise((resolve,reject)=>{
      const child=spawn('docker',['start','--attach',name],{stdio:['ignore','pipe','pipe']});
      function collect(which,b) {
        const previous=which==='stdout'?stdout:stderr;
        const next=previous+b.toString();
        if(next.length>16*1024*1024) outputLimited=true;
        if(which==='stdout')stdout=next.slice(0,16*1024*1024);else stderr=next.slice(0,16*1024*1024);
      }
      child.stdout.on('data',b=>collect('stdout',b));child.stderr.on('data',b=>collect('stderr',b));
      // Supervisor enforces the behavioural deadline and kills only its process
      // group; host timeout includes bounded transport/capture grace.
      const timer=setTimeout(()=>{timedOut=true;spawnSync('docker',['kill',name],{encoding:'utf8'});},timeoutMs+65000);
      let closed=false;
      child.on('error',e=>{closed=true;clearTimeout(timer);reject(e)});
      child.on('close',code=>{closed=true;clearTimeout(timer);status=code;resolve()});
      monitor=(async()=>{
        while(!closed) {
          const ready=spawnSync('docker',['exec',name,'test','-f','/tmp/lab-supervisor-ready'],{encoding:'utf8',timeout:5000});
          if(ready.status===0) {
            try {
              // Docker archive/cp does not expose tmpfs content consistently.
              // Read it through a bounded in-container regular-file bridge.
              const captured=spawnSync('docker',['exec',name,'python','/opt/instrument/capture.py'],{encoding:'utf8',maxBuffer:128*1024*1024,timeout:60000});
              if(captured.status!==0)throw new Error('Live capture failed: '+captured.stderr);
              for(const row of JSON.parse(captured.stdout)) {
                safePath(row.path);
                const target=path.join(records,row.path);
                fs.mkdirSync(path.dirname(target),{recursive:true});
                fs.writeFileSync(target,Buffer.from(row.content,'base64'));
              }
            }
            catch(error) {captureError=String(error);}
            finally {
              const release=spawnSync('docker',['exec',name,'python','-c','from pathlib import Path; Path("/tmp/lab-supervisor-release").touch()'],{encoding:'utf8',timeout:5000});
              if(release.status!==0)captureError=(captureError??'')+'; capture release failed: '+release.stderr;
            }
            break;
          }
          await new Promise(done=>setTimeout(done,250));
        }
        if(closed&&!fs.existsSync(path.join(records,'supervisor.json'))&&!captureError)captureError='Container stopped before live tmpfs capture';
      })().catch(error=>{captureError=String(error)});
    });
    await monitor;
    const state=JSON.parse(command(['inspect',name,'--format','{{json .State}}']));
    let supervisor=null;
    try {supervisor=JSON.parse(fs.readFileSync(path.join(records,'supervisor.json'),'utf8'));}
    catch(error) {captureError=(captureError??'')+'; missing or invalid supervisor artifact: '+String(error);}
    timedOut ||= supervisor?.timedOut===true;outputLimited ||= supervisor?.outputLimited===true;
    const result={schema:1,label,started,finished:new Date().toISOString(),imageId,args,inputs,argv,status:state.ExitCode,attachStatus:status,timedOut,outputLimited,oomKilled:state.OOMKilled,captureError,supervisor,stdout,stderr,stdoutHash:hash(stdout),stderrHash:hash(stderr),artifacts:manifest(records)};
    fs.writeFileSync(path.join(records,'run.json'),JSON.stringify(result,null,2));return result;
  } finally {
    try {if(created)command(['rm','-f',name]);}
    finally {fs.closeSync(lease);fs.unlinkSync(lock);}
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv[2]) {const spec=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(await runCase(spec)));}
