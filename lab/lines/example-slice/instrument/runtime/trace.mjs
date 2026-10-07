import path from 'node:path';
import {safePath, sourceExtensions} from '../core.mjs';

// strace -f -yy -s 65535: annotated dirfds make relative openat paths explicit.
export function parseTrace(text, manifest, core, prefix='/case/tree', isProduction=p=>sourceExtensions.has(path.posix.extname(p))) {
  const available=new Set(manifest.map(r=>r.path)), selected=new Set(core);
  const events=[], unknown=[],pending=new Map(),lines=[]; let cwdUnknown=false;
  // strace interleaves thread syscalls. Join only an exact same-PID/same-call
  // unfinished/resumed pair; missing or mismatched fragments remain unknown.
  for(const line of text.split('\n')) {
    const start=line.match(/^(\d+)\s+(\w+)\(.*<unfinished \.\.\.>$/);
    const resumed=line.match(/^(\d+)\s+<\.\.\. (\w+) resumed>(.*)$/);
    if(start){if(pending.has(start[1]))unknown.push(pending.get(start[1]).line);pending.set(start[1],{call:start[2],line});continue;}
    if(resumed){const initial=pending.get(resumed[1]);pending.delete(resumed[1]);if(!initial||initial.call!==resumed[2]){if(initial)unknown.push(initial.line);unknown.push(line);continue;}lines.push(initial.line.replace(/<unfinished \.\.\.>$/,'')+resumed[3]);continue;}
    lines.push(line);
  }
  unknown.push(...[...pending.values()].map(r=>r.line));
  for (const line of lines) {
    if (!line.trim() || /exited with|killed by/.test(line)) continue;
    if (/\b(?:chdir|fchdir)\(/.test(line)) {
      // Pytest redundantly chdirs to the declared initial cwd. No state changes.
      if(!cwdUnknown&&line.match(/\bchdir\("([^"]*)"\)\s+=\s+0$/)?.[1]===prefix)continue;
      unknown.push(line);cwdUnknown=true;continue;
    }
    // Executable bytes are observed inputs too; unsupported path semantics must
    // not silently certify a closure that lacks a directly executed repository file.
    if (/\b(?:execve|execveat)\(/.test(line)) {
      const executable=line.match(/\b(?:execve|execveat)\([^\"]*"((?:\\.|[^"\\])*)"/)?.[1];
      if(!executable||!executable.startsWith('/')||executable.startsWith(prefix+'/'))unknown.push(line);
      continue;
    }
    const call=line.match(/(?:^|\s)(openat|open|stat|statx|newfstatat|access|faccessat|faccessat2|readlink|readlinkat|getdents64)\((.*)\)\s+=\s+(.+)$/);
    if (!call) { if (/unfinished|resumed/.test(line)) unknown.push(line); continue; }
    const [,syscall,args,result]=call;
    let absolute;
    if (syscall==='getdents64') absolute=args.match(/^\d+<([^>]+)>/)?.[1];
    else {
      const literal=args.match(/"((?:\\.|[^"\\])*)"/);
      if (!literal) { unknown.push(line); continue; }
      let value;
      try { value=JSON.parse('"'+literal[1]+'"'); } catch { unknown.push(line); continue; }
      if (value.startsWith('/')) absolute=value;
      else {
        const annotated=args.match(/^(?:\d+|AT_FDCWD)<([^>]+)>/)?.[1];
        if(cwdUnknown&&!annotated){unknown.push(line);continue;}
        const dir=annotated ?? (args.startsWith('AT_FDCWD') || syscall==='open' || syscall==='stat' || syscall==='access' ? prefix : null);
        if (!dir) { unknown.push(line); continue; }
        absolute=path.posix.resolve(dir,value);
      }
    }
    if (!absolute || !(absolute===prefix || absolute.startsWith(prefix+'/'))) continue;
    const relative=absolute===prefix ? '' : absolute.slice(prefix.length+1);
    if (relative) safePath(relative);
    const absent=/^-1 ENOENT\b|^-1 ENOTDIR\b/.test(result);
    const directory=syscall==='getdents64'||/O_DIRECTORY|S_IFDIR/.test(args+result);
    const read=/^(open|openat)$/.test(syscall)&&!/O_WRONLY/.test(args)&&!result.startsWith('-1');
    events.push({path:relative,syscall,state:absent?'absent':result.startsWith('-1')?'error':'present',kind:directory?'directory':read?'read':'existence',raw:line});
  }
  // A successful existence probe is state, not permission to copy file bytes.
  const observed=[...new Set(events.filter(e=>e.state==='present'&&e.kind==='read'&&available.has(e.path)).map(e=>e.path))].sort();
  return {events,unknown,nonProduction:observed.filter(p=>!isProduction(p)),
    requiredProductionExpansion:observed.filter(p=>isProduction(p)&&!selected.has(p)),
    directories:events.filter(e=>e.kind==='directory'),absent:events.filter(e=>e.state==='absent')};
}
