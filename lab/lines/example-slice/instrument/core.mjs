// Pure scoring mechanics. Inputs must come from later verified adapters.
// This module does not execute a project or assert that supplied traces are correct.
import path from 'node:path';
export const sourceExtensions = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.pyi']);
export function safePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
      value.startsWith('/') || /[<>:"|?*\x00-\x1f]/.test(value) || value.split('/').some(s => !s || s==='.' || s==='..' ||
        /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))) {
    throw new Error(`Invalid repository path: ${value}`);
  }
  return value;
}
export function testPath(repo, value) {
  safePath(value);
  if (repo==='colinhacks/zod') return /(^|\/)(__tests__|tests)\//.test(value) || /\.(test|spec)\.ts$/.test(value);
  if (repo==='sindresorhus/ky') return /^(test|test-d)\//.test(value);
  if (repo==='pallets/click' || repo==='pallets/itsdangerous') return value.startsWith('tests/');
  throw new Error('Unregistered project');
}
export function validateManifest(manifest) {
  const seen = new Set();
  for (const row of manifest) {
    safePath(row.path);
    if (seen.has(row.path.toLowerCase())) throw new Error('Duplicate or case-colliding path');
    seen.add(row.path.toLowerCase());
    if (row.kind !== 'file') throw new Error('Only regular tracked files accepted');
    if (!Number.isSafeInteger(row.bytes) || row.bytes < 0) throw new Error('Invalid byte count');
  }
}
const within = (name, root) => name.startsWith(root);
function validateRoot(root) {
  if (typeof root!=='string'||!root.endsWith('/')) throw new Error('Root must end with slash');
  safePath(root.slice(0,-1));
}
export function select({repo,root,manifest,graph,entries,executedRuns}) {
  validateManifest(manifest);
  validateRoot(root);
  const available = new Set(manifest.map(f=>f.path));
  const production = p => available.has(p) && !testPath(repo,p);
  if (executedRuns.length!==3) throw new Error('Exactly three trace runs required');
  for (const p of [...entries,...executedRuns.flat()]) { safePath(p); if (!available.has(p)) throw new Error('Unknown seed'); }
  for (const [from,edges] of Object.entries(graph)) {
    safePath(from); if (!available.has(from)) throw new Error('Unknown graph origin');
    for (const edge of edges) {
      if (!['local','missing','external','dynamic','ambiguous'].includes(edge.kind)) throw new Error('Unknown edge kind');
      if (edge.kind==='local') { safePath(edge.to); if (!available.has(edge.to)) throw new Error('Unresolved local target'); }
    }
  }
  function closure(seeds) {
    const visited = new Set(), pending=[...seeds], unresolved=[];
    while (pending.length) {
      const p = pending.pop(); if (visited.has(p)) continue;
      visited.add(p);
      // Absence of a parsed row is unknown, not a proven empty dependency set.
      if (!(p in graph)) unresolved.push({from:p,kind:'unparsed'});
      for (const edge of graph[p]??[]) {
        if (edge.kind==='local') pending.push(edge.to);
        else unresolved.push({from:p,...edge});
      }
    }
    return {files:[...visited].filter(production).sort(),unresolved:unresolved.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
  }
  const e=[...new Set(executedRuns.flat())].filter(production).sort();
  return {E:{files:e,unresolved:[]}, EI:closure(e), R:closure(entries),
    G:{files:manifest.filter(f=>within(f.path,root)&&production(f.path)).map(f=>f.path).sort(),unresolved:[]}};
}
export function disclosure({repo,root,manifest,shipped}) {
  validateRoot(root);
  validateManifest(manifest);
  const rows = new Map(manifest.map(f=>[f.path,f]));
  const included = new Set(shipped.map(safePath));
  for (const p of included) if (!rows.has(p)) throw new Error('Unknown shipped base path');
  const source = manifest.filter(f=>sourceExtensions.has(path.posix.extname(f.path))&&!testPath(repo,f.path));
  function fraction(universe) {
    const selected=universe.filter(f=>included.has(f.path));
    const sum=rs=>rs.reduce((n,r)=>n+r.bytes,0);
    const bytes=sum(universe), transmitted=sum(selected);
    if (!Number.isSafeInteger(bytes)||!Number.isSafeInteger(transmitted)) throw new Error('Unsafe aggregate bytes');
    return {denominatorPaths:universe.map(f=>f.path).sort(),numeratorPaths:selected.map(f=>f.path).sort(),
      fileCount:selected.length,fileTotal:universe.length,bytes:transmitted,byteTotal:bytes,
      fileFraction:universe.length ? selected.length/universe.length:null,byteFraction:bytes ? transmitted/bytes:null};
  }
  const repositorySource=fraction(source),rootSource=fraction(source.filter(f=>within(f.path,root))),totalRepository=fraction(manifest);
  const measures=[repositorySource.fileFraction,repositorySource.byteFraction,rootSource.fileFraction,rootSource.byteFraction];
  return {repositorySource,rootSource,totalRepository,small:measures.every(v=>v!==null&&v<=.25),
    nearlyEverything:measures.some(v=>v!==null&&v>=.75),sizeUnknown:measures.some(v=>v===null)};
}
export function score({repo,root,editable,patch,observations,referenceReplay,context,variant,size}) {
  validateRoot(root);
  const allowed = new Set(editable.map(safePath)), existingMisses=[],newForbidden=[];
  // Patch extractor must classify test-only changes before handing non-test edits here.
  for (const change of patch) {
    safePath(change.path);
    if (!['modify','delete','add'].includes(change.action)) throw new Error('Split renames into delete/add');
    if (typeof change.newAllowed !== 'boolean' && change.action==='add') throw new Error('New-path authority must be explicit');
    if (change.action==='add') { if (!within(change.path,root)||testPath(repo,change.path)||!change.newAllowed) newForbidden.push(change.path); }
    else if (!allowed.has(change.path)) existingMisses.push(change.path);
  }
  if (observations.length!==3 || observations.some(o=>!['same-observed-failure','different','setup-error','unstable','unknown'].includes(o))) throw new Error('Invalid observations');
  if (!['passed','failed','unknown'].includes(referenceReplay)) throw new Error('Invalid replay state');
  if (!['primary','expanded','optional-context'].includes(variant)) throw new Error('Invalid variant');
  for (const row of context) {
    safePath(row.path);
    if (!['essential-for-reference','replaceable','unknown'].includes(row.label)) throw new Error('Invalid context label');
    if (typeof row.evidence!=='string'||!row.evidence || typeof row.scepticAgreed!=='boolean') throw new Error('Context evidence missing');
  }
  const existingContained=existingMisses.length===0,newPermitted=newForbidden.length===0;
  const reproduced=observations.every(o=>o==='same-observed-failure');
  const contextResolved=context.every(c=>c.label==='replaceable'&&c.scepticAgreed);
  const referenceFeasible=existingContained&&newPermitted&&referenceReplay==='passed';
  return {existingContained,newPermitted,existingMisses,newForbidden,reproduced,referenceFeasible,contextResolved,
    primaryRowPass:variant==='primary'&&size.small===true&&!size.sizeUnknown&&reproduced&&referenceFeasible&&contextResolved};
}
