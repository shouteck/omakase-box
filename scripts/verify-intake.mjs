import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, request } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { docker } from './docker.mjs';
import { composeArguments } from './synthetic-runtime.mjs';

async function fixture(service, entry, command, flag='SYNTHETIC_AUTH_FIXTURE') {
  const result=await docker([...composeArguments,'exec','-T','--env',`${flag}=private-task-mvp-synthetic`,'--workdir',`/workspace/services/${service}`,service,'node',`dist/${entry}.js`],{input:JSON.stringify(command)});
  assert.equal(result.code,0,'Synthetic intake fixture failed.');return JSON.parse(result.stdout);
}
function http(scope,method,path,body,headers={}) {
  const port=scope==='private'?4000:4001, host=scope==='private'?'private.localhost':'contributor.localhost', origin=scope==='private'?'http://private.localhost:3000':'http://contributor.localhost:3001';
  return new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port,path,method,headers:{Host:`${host}:${port}`,Origin:origin,'Content-Type':'application/json',...headers},timeout:30000},response=>{
      const chunks=[];let length=0;
      response.on('data',chunk=>{length+=chunk.length;if(length>2097152){response.destroy(new Error('Bounded intake response exceeded.'));return;}chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:response.statusCode,bytes,body:response.headers['content-type']?.startsWith('application/json')?JSON.parse(bytes.toString()):null,headers:response.headers});});
    });req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Bounded intake request timeout.')));req.end(body===undefined?undefined:JSON.stringify(body));
  });
}
async function login(scope,account) {
  const response=await http(scope,'POST','/v1/auth/login',{username:account.username,password:'synthetic-auth-password-only'});assert.equal(response.status,200);
  return {Cookie:response.headers['set-cookie'][0].split(';')[0],'X-CSRF-Token':response.body.csrfToken};
}
function chunk(name,bytes){const length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);const body=Buffer.concat([Buffer.from(name),bytes]);const sum=Buffer.alloc(4);sum.writeUInt32BE(crc32(body));return Buffer.concat([length,body,sum]);}
function png(padded=false){const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;const parts=[Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255])))];const end=chunk('IEND',Buffer.alloc(0));if(padded){const size=parts.reduce((sum,part)=>sum+part.length,0)+end.length;parts.push(chunk('tEXt',Buffer.concat([Buffer.from('Synthetic\0'),Buffer.alloc(1048576-size-12-10,65)])));}return Buffer.concat([...parts,end]);}
const seed=await fixture('private-api','fixture',{action:'seed'}), other=await fixture('private-api','fixture',{action:'seed'}), externalSeed=await fixture('external-api','fixture',{action:'seed'});
const requesterAccount=seed.accounts.find(account=>account.role==='requester');
const owner=await login('private',seed.accounts.find(account=>account.role==='owner')), requester=await login('private',requesterAccount), operator=await login('private',seed.accounts.find(account=>account.role==='operator')), stranger=await login('private',other.accounts.find(account=>account.role==='requester')), contributor=await login('external',externalSeed.accounts[0]);
assert.equal((await http('private','POST','/v1/snapshots',{sourceId:'synthetic-shop'},requester)).status,403);
assert.equal((await http('private','POST','/v1/snapshots',{sourceId:'synthetic-shop',root:'C:/synthetic-host-canary'},operator)).status,400);
assert.equal((await http('private','POST','/v1/snapshots',{sourceId:'unknown-source'},operator)).status,400);
const registered=await http('private','POST','/v1/snapshots',{sourceId:'synthetic-shop'},operator);assert.equal(registered.status,201);assert.equal(registered.body.fileCount,10);assert.deepEqual(Object.keys(registered.body).sort(),['fileCount','id','snapshotHash']);
const repeated=await http('private','POST','/v1/snapshots',{sourceId:'synthetic-shop'},owner);assert.equal(repeated.status,201);assert.deepEqual(repeated.body,registered.body);
const catalog=await http('private','GET','/v1/snapshots',undefined,requester);assert.equal(catalog.status,200);assert.ok(catalog.body.snapshots.some(snapshot=>snapshot.id===registered.body.id));assert.ok(!JSON.stringify(catalog.body).includes('/workspace/'));
const created=await http('private','POST','/v1/requests',{snapshotId:registered.body.id,goal:'Synthetic evidence journey'},requester);assert.equal(created.status,201);const requestId=created.body.id;
assert.equal(created.body.currentBehaviour,'');assert.deepEqual(created.body.constraints,[]);
assert.equal((await http('private','POST','/v1/requests',{snapshotId:registered.body.id,goal:'Synthetic',requesterId:seed.accounts[0].id},requester)).status,400);
assert.equal((await http('private','POST','/v1/requests',{snapshotId:registered.body.id,goal:'Synthetic'},operator)).status,403);
assert.equal((await http('private','POST','/v1/requests',{snapshotId:registered.body.id,goal:'Synthetic'},{Cookie:requester.Cookie})).status,401);
for(const value of [requestId,randomUUID(),'malformed-id']){const response=await http('private','GET',`/v1/requests/${value}`,undefined,stranger);assert.equal(response.status,404);assert.deepEqual(response.body,{error:'not_found'});}
const hostileText=Buffer.from('<script>window.syntheticEvidenceExecuted=true</script>');
const upload=(bytes,mediaType='text/plain',session=requester,target=requestId)=>http('private','POST',`/v1/requests/${target}/evidence`,{mediaType,base64:bytes.toString('base64'),label:'Synthetic evidence'},session);
const text=await upload(hostileText);assert.equal(text.status,201);const image=await upload(png(),'image/png');assert.equal(image.status,201);
assert.equal((await upload(Buffer.from('<html>'),'image/png')).status,400);
assert.equal((await upload(Buffer.from([0xc3,0x28]))).status,400);
assert.equal((await http('private','POST',`/v1/requests/${requestId}/evidence`,{mediaType:'text/plain',base64:'Zh=='},requester)).status,400);
assert.equal((await http('private','POST',`/v1/requests/${requestId}/evidence`,{mediaType:'text/plain',base64:'YQ==',path:'../../synthetic-canary'},requester)).status,400);
assert.equal((await upload(Buffer.from('Synthetic stranger'), 'text/plain',stranger)).status,404);
assert.equal((await upload(Buffer.alloc(65537,65))).status,400);
assert.equal((await http('private','POST',`/v1/requests/${requestId}/evidence`,{mediaType:'image/png',base64:'A'.repeat(1400000)},requester)).status,413);
const stored=await http('private','GET',`/v1/requests/${requestId}`,undefined,requester);assert.equal(stored.status,200);assert.equal(stored.body.evidence.length,2);
for(const session of [requester,owner]){const downloaded=await http('private','GET',`/v1/requests/${requestId}/evidence/${text.body.id}`,undefined,session);assert.equal(downloaded.status,200);assert.ok(downloaded.bytes.equals(hostileText));assert.equal(downloaded.headers['content-type'],'application/octet-stream');assert.equal(downloaded.headers['content-disposition'],`attachment; filename="${text.body.id}.txt"`);assert.equal(downloaded.headers['x-content-type-options'],'nosniff');}
assert.equal((await http('private','GET',`/v1/requests/${requestId}/evidence/${text.body.id}`,undefined,stranger)).status,404);
assert.equal((await http('private','GET',`/v1/requests/${requestId}/evidence/${text.body.id}`,undefined,operator)).status,403);
assert.equal((await http('private','GET',`/v1/requests/${requestId}`,undefined,{Cookie:contributor.Cookie})).status,401);
for(const route of [`/v1/requests/${requestId}`,`/v1/requests/${requestId}/evidence/${text.body.id}`]){const response=await http('external','GET',route,undefined,contributor);assert.equal(response.status,404);assert.deepEqual(response.body,{error:'not_found'});}
const planning=await http('private','GET',`/v1/requests/${requestId}/planning-input`,undefined,requester);assert.equal(planning.status,200);assert.equal(planning.body.assurance,'bounded');assert.equal(planning.body.snapshotHash,registered.body.snapshotHash);assert.equal(planning.body.imageUnderstanding,false);assert.equal(planning.body.sources.length,10);assert.ok(planning.body.sources.every(source=>!source.reference.location.includes('reference-solutions')));assert.equal(planning.body.attachments.find(item=>item.reference.evidenceId===image.body.id).text,null);assert.equal(planning.body.attachments.find(item=>item.reference.evidenceId===text.body.id).text,hostileText.toString());assert.ok(!JSON.stringify(planning.body).includes('/workspace/examples/'));
const raced=await Promise.all(Array.from({length:15},()=>upload(Buffer.from('Synthetic bounded evidence'))));assert.equal(raced.filter(result=>result.status===201).length,14);assert.equal(raced.filter(result=>result.status===429).length,1);
const largeRequest=await http('private','POST','/v1/requests',{snapshotId:registered.body.id,goal:'Synthetic byte-bound journey'},requester);assert.equal(largeRequest.status,201);
const largeImage=png(true);assert.equal(largeImage.length,1048576);const byteRace=await Promise.all(Array.from({length:9},()=>upload(largeImage,'image/png',requester,largeRequest.body.id)));assert.equal(byteRace.filter(result=>result.status===201).length,8);assert.equal(byteRace.filter(result=>result.status===429).length,1);
const shells=[];let browser;
try {
  for(const [host,port] of [['private.localhost',3000],['contributor.localhost',3001]]){const shell=createServer((request,response)=>{if(request.headers.host!==`${host}:${port}`||request.url!=='/synthetic-intake'){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});response.end('<!doctype html><title>Synthetic intake browser</title><script>window.syntheticEvidenceExecuted=false</script>');});await new Promise((resolve,reject)=>{shell.once('error',reject);shell.listen(port,'127.0.0.1',resolve);});shells.push(shell);}
  browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP private.localhost 127.0.0.1,MAP contributor.localhost 127.0.0.1']});const context=await browser.newContext();const page=await context.newPage();
  await page.goto('http://private.localhost:3000/synthetic-intake');
  const browserLogin=await page.evaluate(async username=>{const response=await fetch('http://private.localhost:4000/v1/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'synthetic-auth-password-only'})});return response.status;},requesterAccount.username);assert.equal(browserLogin,200);
  const downloadPromise=page.waitForEvent('download');await page.evaluate(url=>{window.location.href=url;},`http://private.localhost:4000/v1/requests/${requestId}/evidence/${text.body.id}`);const downloaded=await downloadPromise;assert.equal(downloaded.suggestedFilename(),`${text.body.id}.txt`);assert.equal(await page.evaluate(()=>window.syntheticEvidenceExecuted),false);
  const contributorCookies=[];page.on('request',request=>{if(request.url().startsWith('http://contributor.localhost:4001/'))contributorCookies.push(request.allHeaders().then(headers=>headers.cookie??''));});
  await page.goto('http://contributor.localhost:3001/synthetic-intake');const denied=await page.evaluate(async id=>{const response=await fetch(`http://contributor.localhost:4001/v1/requests/${id}`,{credentials:'include'});return response.status;},requestId);assert.equal(denied,401);assert.ok((await Promise.all(contributorCookies)).every(cookie=>!cookie.includes('private_session')));
  const jpeg=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;return canvas.toDataURL('image/jpeg').split(',')[1];});
  const jpegRequest=await http('private','POST','/v1/requests',{snapshotId:registered.body.id,goal:'Synthetic JPEG journey'},requester);assert.equal(jpegRequest.status,201);assert.equal((await upload(Buffer.from(jpeg,'base64'),'image/jpeg',requester,jpegRequest.body.id)).status,201);
  await context.close();
} finally {await browser?.close();for(const shell of shells)await new Promise((resolve,reject)=>shell.close(error=>error?reject(error):resolve()));}
const immutable=await fixture('private-api','intake-fixture',{cookie:requester.Cookie.split('=')[1],requestId,snapshotId:registered.body.id,evidenceId:text.body.id},'SYNTHETIC_INTAKE_FIXTURE');assert.equal(immutable.immutableObjectsSnapshotsRequestsEvidenceProvenance,true);assert.equal(immutable.revokedSessionAfterAuthenticationDenied,true);
assert.equal((await http('private','GET',`/v1/requests/${requestId}`,undefined,requester)).status,401);
console.log(JSON.stringify({assurance:'tested',scope:'synthetic actual DB/API/browser private evidence',pinnedSnapshots:'immutable_deduplicated',privateProvenance:'not_in_dtos_or_planner_input',requestOwnership:'enforced',sessionAndCsrf:'enforced',textPngJpeg:'bounded_structure_validated',uploadCountAndByteRace:'bounded',evidenceDownloads:'attachment_not_executed',contributorAccess:'denied',plannerRetrieval:'bounded_no_image_understanding',immutableSqlAndRevokedSession:'tested',realCustomerData:false}));
