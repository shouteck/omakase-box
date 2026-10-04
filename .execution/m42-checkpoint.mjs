import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { resolve, relative, matchesGlob } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const statePath = resolve(root, '.execution/state.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
const graphBytes = await readFile(resolve(root, 'tasks/task-graph.json'));
const graph = JSON.parse(graphBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(graph.target, 'M9');
for (const label of ['resume-client-wiring-fixed','resume-offline-types-complete','resume-offline-build-complete','resume-offline-layer-scan-fixed']) {
  const evidence = JSON.parse(await readFile(resolve(root, `.execution/evidence/M4.2/${label}.json`), 'utf8'));
  assert.equal(evidence.exitCode, 0, label); assert.equal(evidence.truncated, false, label);
}
const blocked = JSON.parse(await readFile(resolve(root, '.execution/evidence/M4.2/resume-runtime-build-final.json'), 'utf8'));
assert.notEqual(blocked.exitCode, 0);
const changedAllowed = new Set(['docs/DECISIONS.md','infra/trusted.Dockerfile','infra/trusted.Dockerfile.dockerignore','services/private-api/src/bootstrap/main.ts','services/private-api/src/bootstrap/server.ts','services/private-api/releases/live-fixture.ts','apps/private-console/releases/release-screen.tsx']);
const integration = ['services/private-api/releases/compiler.ts','services/private-api/releases/compiler-routes.ts','services/private-api/releases/live-fixture.ts','services/private-api/src/bootstrap/server.ts','apps/private-console/releases/release-screen.tsx','tests/security/release-content/image.test.ts','.execution/evidence/M4.2/public-image.mjs','.execution/evidence/M4.2/scan-public-image.py','.execution/evidence/M4.2/scan-public-image-cases.py'];
const critical = new Set(['M0.1','M0.2','M1.3','M4.1']);
for (const [id, task] of Object.entries(state.tasks)) {
  if (!task.revision) continue;
  const prior = task.revision;
  const previous = JSON.parse(await readFile(resolve(root, prior.manifest), 'utf8'));
  assert.equal(sha(JSON.stringify(previous)), prior.digest);
  const files = new Map(), drift = [];
  for (const file of previous.files) {
    const bytes = await readFile(resolve(root, file.path));
    if (sha(bytes) !== file.sha256) { assert.ok(id === 'M4.2' || changedAllowed.has(file.path), `Unexpected source drift: ${id} ${file.path}`); drift.push(file.path); }
    files.set(file.path, { path:file.path, bytes:bytes.length, sha256:sha(bytes) });
  }
  if (id === 'M4.2' || id === 'M4.1') {
    const scopes = graph.tasks.find(task => task.id === id).writePaths;
    async function collect(directory) {
      for (const entry of await readdir(directory, { withFileTypes:true })) {
        if (['.git','.runtime','node_modules','dist','.execution','data','secrets','coverage','test-results','playwright-report','__pycache__'].includes(entry.name)) continue;
        const path = resolve(directory,entry.name);
        if (entry.isDirectory()) await collect(path);
        else if (entry.isFile()) { const local=relative(root,path).replaceAll('\\','/'); if (scopes.some(pattern => matchesGlob(local,pattern))) { const bytes=await readFile(path); files.set(local,{path:local,bytes:bytes.length,sha256:sha(bytes)}); } }
      }
    }
    await collect(root);
  }
  if (id === 'M4.2') for (const path of integration) { const bytes=await readFile(resolve(root,path)); files.set(path,{path,bytes:bytes.length,sha256:sha(bytes)}); }
  const manifest = { taskId:id, assurance:'unverified', taskDefinitionSha256:sha(graphBytes), files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path,'en')) };
  const digest = sha(JSON.stringify(manifest));
  const manifestPath = `.execution/evidence/${id}/revision-${digest}.json`;
  const encoded = JSON.stringify(manifest,null,2)+'\n';
  try { await writeFile(resolve(root,manifestPath),encoded,{flag:'wx'}); }
  catch(error) { if(error.code !== 'EEXIST' || await readFile(resolve(root,manifestPath),'utf8') !== encoded) throw error; }
  task.revision = {algorithm:'sha256',digest,manifest:manifestPath};
  task.evidence = (await readdir(resolve(root,`.execution/evidence/${id}`))).filter(name=>name.endsWith('.json')).map(name=>`.execution/evidence/${id}/${name}`);
  if (task.independentReviewStatus === 'verified') { task.previousReviewed={revision:prior,reviewer:task.reviewer,handoff:task.handoff,reviewReports:task.reviewReports??[]}; task.independentReviewStatus='not_available'; task.reviewer=null; }
  if (drift.some(path=>path !== 'docs/DECISIONS.md') && id !== 'M4.2') {
    task.integrationStatus='needs_revalidation';
    if (critical.has(id)) { task.status='review'; task.implementationStatus='in_progress'; }
  }
  task.reconciliation={assurance:'unverified',previousRevision:prior.digest,changedExistingPaths:drift,verification:'.execution/evidence/M4.2/',limitation:'Offline checks and earlier synthetic runtime/image evidence are scoped; latest Docker-backed shared/runtime checks are blocked and have NOT been marked passing.'};
  console.log(JSON.stringify({taskId:id,revision:digest,implementationStatus:task.implementationStatus,integrationStatus:task.integrationStatus??null}));
}
const current=state.tasks['M4.2'];
current.status='running'; current.implementationStatus='in_progress'; current.lease=null; current.handoff='.execution/drafts/M4.2.md'; current.independentReviewStatus='not_available'; current.reviewer=null;
current.blockers=['Docker Desktop Linux engine is stopped (local pipe absent); user must start the existing app. Latest runtime rebuild/API/browser/full compiler/release-content and shared revalidation remain unexecuted. No reset/config/resource/rate-policy changes or host candidate execution.','Public templates/image/approved-store integration have scoped implementation evidence, not real fresh-VM readiness or independent review.'];
state.coordinator='devin-coordinator-sequential'; state.reviewMode='sequential_fallback'; state.independentReviewVerified=false; state.currentTask='M4.2'; state.currentTasks=[];
state.projectStatus='implementation_checked_review_pending'; state.lastUpdatedAt=new Date().toISOString();
state.integrationRevalidation=Object.entries(state.tasks).filter(([,task])=>task.integrationStatus==='needs_revalidation').map(([id])=>id);
state.nextEligibleTasks=graph.tasks.filter(definition=>['pending','changes_requested'].includes(state.tasks[definition.id].status)&&definition.dependencies.every(id=>state.tasks[id].status==='done'||state.tasks[id].implementationStatus==='checked')).map(task=>task.id);
state.blockedTasks=Object.entries(state.tasks).filter(([,task])=>task.status==='blocked').map(([id])=>id);
state.nextWork={resumeCurrentTask:'M4.2',externalPrerequisite:'User starts existing Docker Desktop; verify the local Linux engine before rebuilding only identified synthetic services.',implementationEligible:state.nextEligibleTasks,integrationRevalidation:state.integrationRevalidation,reason:'Resume current source/runtime verification; unknown checks and earlier revision evidence are not passing current-byte checks.'};
state.delivery.software='incomplete'; state.delivery.independentReview='not_available'; state.delivery.realIsolatedRunner='not_verified';
await writeFile(statePath+'.tmp',JSON.stringify(state,null,2)+'\n',{flag:'wx'}); await rename(statePath+'.tmp',statePath);
