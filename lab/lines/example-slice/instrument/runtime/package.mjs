import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {safePath,validateManifest,sourceExtensions} from '../core.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');

// contents is a verified base snapshot, never a fallback owner-source directory.
export function exportCase({destination,contents,manifest,core,common,overlay,trace,repo,testPath,immutablePaths=[]}) {
  validateManifest(manifest);
  if(trace.unknown.length)throw new Error('Unresolved trace cannot define a package');
  if (fs.existsSync(destination)) throw new Error('Refuse existing case directory');
  const base=new Map(manifest.map(r=>[r.path,r])), selected=new Set(core.map(safePath));
  const commonSet=new Set(common.map(safePath));
  const immutable=new Set(immutablePaths.map(safePath));
  for(const p of common) if(sourceExtensions.has(path.posix.extname(p))&&!testPath(repo,p)) throw new Error('Common allowlist cannot silently add production source');
  const extras=trace.nonProduction.filter(p=>base.has(p)), expansion=trace.requiredProductionExpansion.filter(p=>!testPath(repo,p));
  for(const p of [...selected,...commonSet,...immutable,...extras,...expansion]) if(!base.has(p)) throw new Error('Unknown base export path');
  for(const p of immutable)if(!selected.has(p)&&!commonSet.has(p)&&!extras.includes(p))throw new Error('Immutable path is not included');
  const sets={primary:[...new Set([...selected,...commonSet,...extras])].sort(),expanded:[...new Set([...selected,...commonSet,...extras,...expansion])].sort()};
  const receipt={schema:1,core:[...selected].sort(),requiredProductionExpansion:expansion,variants:{},absent:trace.absent,directories:trace.directories};
  for(const [variant,paths] of Object.entries(sets)) {
    const records=[];
    for(const p of paths) {
      safePath(p); const bytes=contents[p];
      if(!Buffer.isBuffer(bytes)||bytes.length!==base.get(p).bytes) throw new Error('Missing or wrong-size verified snapshot bytes');
      const target=path.join(destination,variant,'tree',p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
      records.push({path:p,sha256:hash(bytes),bytes:bytes.length,immutable:immutable.has(p)||testPath(repo,p),origin:'base'});
    }
    for(const [p,value] of Object.entries(overlay)) {
      safePath(p);if(!testPath(repo,p)) throw new Error('Overlay outside frozen test family');
      const target=path.join(destination,variant,'tree',p);
      if(value===null) {if(fs.existsSync(target))fs.unlinkSync(target);records.push({path:p,origin:'overlay-delete',immutable:true});continue;}
      if(!Buffer.isBuffer(value))throw new Error('Overlay must contain raw bytes');
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);
      records.push({path:p,sha256:hash(value),bytes:value.length,immutable:true,origin:'overlay'});
    }
    receipt.variants[variant]=records;
  }
  fs.writeFileSync(path.join(destination,'authority.json'),JSON.stringify(receipt,null,2));
  return receipt;
}
